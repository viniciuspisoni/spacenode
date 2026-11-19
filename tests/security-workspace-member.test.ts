// is_workspace_member sem sondagem (auditoria 2026-11-18, recomendação 5).
//
// O que estes testes protegem:
//   • antes: qualquer conta logada perguntava "X participa do escritório Y?"
//     pela RPC pública passando o usuário que quisesse;
//   • depois: a função pública some; o helper novo mora em `private` e só
//     responde pela própria sessão;
//   • a leitura de workspaces/workspace_members pela RLS continua igual —
//     colegas do mesmo escritório se enxergam, quem é de fora não vê nada.
//
// Roda as migrations REAIS num Postgres em WASM (PGlite).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { CREDIT_PATH_MIGRATIONS, applyMigration, createSupabaseLikeDb } from './helpers/pglite-supabase'

const FIX = 'supabase/migrations/20261119190000_private_is_workspace_member.sql'

const OWNER    = '11111111-1111-4111-8111-111111111111'
const COLLEAGUE = '33333333-3333-4333-8333-333333333333'
const OUTSIDER = '22222222-2222-4222-8222-222222222222'
const OFFICE   = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

let db: PGlite

async function as<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(userId
    ? `set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`
    : `set role anon; select set_config('request.jwt.claim.sub', '', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

async function errorOf(sql: string): Promise<string | null> {
  try {
    await db.exec(sql)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

async function ids(sql: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(sql)
  return rows.map(r => r.id).sort()
}

beforeAll(async () => {
  db = await createSupabaseLikeDb(CREDIT_PATH_MIGRATIONS)
  await db.exec(`
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
  `)
  for (const [id, email] of [[OWNER, 'dono@escritorio.com'], [COLLEAGUE, 'colega@escritorio.com'], [OUTSIDER, 'fora@example.com']]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email])
    await db.query(`insert into public.profiles (id, email) values ($1, $2) on conflict (id) do nothing`, [id, email])
  }
  // Escritório do OWNER com o COLLEAGUE dentro (1 workspace ativo por pessoa).
  await db.query(`insert into public.workspaces (id, name, type, owner_id) values ($1, 'Escritório', 'office', $2)`, [OFFICE, OWNER])
  await db.query(`update public.workspace_members set status = 'removed' where user_id in ($1, $2)`, [OWNER, COLLEAGUE])
  await db.query(
    `insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, 'owner', 'active'), ($1, $3, 'member', 'active')
     on conflict (workspace_id, user_id) do update set status = 'active', role = excluded.role`,
    [OFFICE, OWNER, COLLEAGUE],
  )
})

afterAll(async () => {
  await db?.close()
})

describe('antes da correção', () => {
  it('quem é de fora sonda a equipe de outro escritório pela RPC', async () => {
    const probe = await as(OUTSIDER, () => db.query<{ m: boolean }>(
      `select public.is_workspace_member('${OFFICE}', '${COLLEAGUE}') as m`,
    ))
    expect(probe.rows[0].m).toBe(true)
  })
})

describe('depois da correção', () => {
  beforeAll(async () => {
    await applyMigration(db, FIX)
  })

  it('a função pública com usuário por parâmetro não existe mais', async () => {
    const err = await as(OUTSIDER, () => errorOf(
      `select public.is_workspace_member('${OFFICE}', '${COLLEAGUE}')`,
    ))
    expect(err).toMatch(/does not exist/i)
  })

  it('o helper novo só responde pela própria sessão', async () => {
    const outsider = await as(OUTSIDER, () => db.query<{ m: boolean }>(`select private.is_workspace_member('${OFFICE}') as m`))
    const colleague = await as(COLLEAGUE, () => db.query<{ m: boolean }>(`select private.is_workspace_member('${OFFICE}') as m`))
    expect(outsider.rows[0].m).toBe(false)
    expect(colleague.rows[0].m).toBe(true)
  })

  it('não aceita mais um usuário de terceiros como parâmetro', async () => {
    const err = await as(OUTSIDER, () => errorOf(
      `select private.is_workspace_member('${OFFICE}', '${COLLEAGUE}')`,
    ))
    expect(err).toMatch(/does not exist/i)
  })

  it('anon não executa o helper', async () => {
    const err = await as(null, () => errorOf(`select private.is_workspace_member('${OFFICE}')`))
    expect(err).toMatch(/permission denied/i)
  })

  it('colegas do escritório continuam se enxergando', async () => {
    const workspaces = await as(COLLEAGUE, () => ids(`select id from public.workspaces where id = '${OFFICE}'`))
    const members = await as(COLLEAGUE, () => db.query<{ id: string }>(
      `select user_id as id from public.workspace_members where workspace_id = '${OFFICE}' and status = 'active'`,
    ))
    expect(workspaces).toEqual([OFFICE])
    expect(members.rows.map(r => r.id).sort()).toEqual([OWNER, COLLEAGUE].sort())
  })

  it('quem é de fora não vê o escritório nem a equipe', async () => {
    const workspaces = await as(OUTSIDER, () => ids(`select id from public.workspaces where id = '${OFFICE}'`))
    const members = await as(OUTSIDER, () => ids(
      `select user_id as id from public.workspace_members where workspace_id = '${OFFICE}'`,
    ))
    expect(workspaces).toEqual([])
    expect(members).toEqual([])
  })

  it('reaplicar a migration não falha (idempotente)', async () => {
    await expect(applyMigration(db, FIX)).resolves.toBeUndefined()
  })
})
