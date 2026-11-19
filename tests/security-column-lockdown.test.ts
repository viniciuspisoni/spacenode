// Trava de coluna em profiles (achado crítico S1 da auditoria 2026-11-18).
//
// O que estes testes protegem:
//   • um usuário logado NÃO altera o próprio saldo/plano/ids do Stripe pelo
//     PostgREST (UPDATE direto em profiles com o JWT dele);
//   • as preferências que o browser grava de verdade continuam funcionando;
//   • o browser não forja linhas em renders (tabela escrita só pelo servidor);
//   • a migration é idempotente (reaplicar não quebra);
//   • toda coluna que um client component grava em profiles está no GRANT —
//     quem adicionar uma preferência nova sem GRANT quebra este teste, não a
//     produção.
//
// Roda as migrations REAIS num Postgres em WASM (PGlite), com os grants
// padrão que o Supabase dá a anon/authenticated no schema public.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { applyMigration, createSupabaseLikeDb } from './helpers/pglite-supabase'

const LOCKDOWN = 'supabase/migrations/20261118160000_lockdown_user_writable_columns.sql'
const ROOT = join(__dirname, '..')

const BASE_MIGRATIONS = [
  'supabase-schema.sql',
  'migration-materials.sql',
  'supabase/migrations/20260508000000_add_project_config.sql',
  'supabase/migrations/20260717000000_profiles_onboarding_tour.sql',
  'supabase/migrations/20260917040000_profiles_glass_intensity.sql',
] as const

// Grants padrão do Supabase (o que torna o S1 explorável em produção).
const SUPABASE_DEFAULT_GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
`

const USER_ID = '11111111-1111-4111-8111-111111111111'

let db: PGlite

async function asUser<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${USER_ID}', false);`)
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

beforeAll(async () => {
  db = await createSupabaseLikeDb(BASE_MIGRATIONS)
  await db.exec(SUPABASE_DEFAULT_GRANTS)
  await db.query(`insert into auth.users (id, email) values ($1, 'arq@example.com')`, [USER_ID])
  await db.query(
    `insert into public.profiles (id, email, credits, plan) values ($1, 'arq@example.com', 80, 'free')
     on conflict (id) do nothing`,
    [USER_ID],
  )
})

afterAll(async () => {
  await db?.close()
})

describe('antes da trava (reproduz o S1 com os grants padrão do Supabase)', () => {
  it('o usuário consegue se dar saldo — é o buraco que a migration fecha', async () => {
    const err = await asUser(() => errorOf(
      `update public.profiles set credits = 999999 where id = '${USER_ID}'`,
    ))
    expect(err).toBeNull()
    const { rows } = await db.query<{ credits: number }>(`select credits from public.profiles where id = $1`, [USER_ID])
    expect(rows[0].credits).toBe(999999)
    await db.query(`update public.profiles set credits = 80 where id = $1`, [USER_ID])
  })
})

describe('depois da trava', () => {
  beforeAll(async () => {
    await applyMigration(db, LOCKDOWN)
  })

  it.each([
    ['credits', '999999'],
    ['plan', `'studio'`],
    ['stripe_customer_id', `'cus_vitima'`],
    ['stripe_subscription_id', `'sub_vitima'`],
    ['email', `'convidado@escritorio.com'`],
  ])('nega UPDATE em profiles.%s', async (column, value) => {
    const err = await asUser(() => errorOf(
      `update public.profiles set ${column} = ${value} where id = '${USER_ID}'`,
    ))
    expect(err).toMatch(/permission denied/i)
  })

  it('o saldo continua intacto', async () => {
    const { rows } = await db.query<{ credits: number; plan: string }>(
      `select credits, plan from public.profiles where id = $1`, [USER_ID],
    )
    expect(rows[0]).toEqual({ credits: 80, plan: 'free' })
  })

  it.each([
    ['project_materials', `'{"piso":"madeira"}'::jsonb`],
    ['project_config', `'{"engine":"pulsar"}'::jsonb`],
    ['onboarding_completed_at', 'now()'],
    ['glass_intensity', '0.5'],
  ])('preferência do browser segue gravável: profiles.%s', async (column, value) => {
    const err = await asUser(() => errorOf(
      `update public.profiles set ${column} = ${value} where id = '${USER_ID}'`,
    ))
    expect(err).toBeNull()
  })

  it('a policy de LINHA continua valendo junto com a de coluna', async () => {
    await db.query(`insert into auth.users (id, email) values ('22222222-2222-4222-8222-222222222222', 'b@example.com')`)
    await db.query(`insert into public.profiles (id, email) values ('22222222-2222-4222-8222-222222222222', 'b@example.com') on conflict (id) do nothing`)
    await asUser(() => db.exec(
      `update public.profiles set project_config = '{"x":1}'::jsonb where id = '22222222-2222-4222-8222-222222222222'`,
    ))
    const { rows } = await db.query<{ project_config: unknown }>(
      `select project_config from public.profiles where id = '22222222-2222-4222-8222-222222222222'`,
    )
    expect(rows[0].project_config).toBeNull()
  })

  it('o browser não insere nem altera renders (só o servidor escreve)', async () => {
    const insertErr = await asUser(() => errorOf(
      `insert into public.renders (user_id, input_url, prompt, ambient, style, lighting, status)
       values ('${USER_ID}', 'https://x', 'p', 'a', 's', 'l', 'completed')`,
    ))
    expect(insertErr).toMatch(/permission denied/i)
  })

  it('o browser não cria nem apaga o próprio profile', async () => {
    const del = await asUser(() => errorOf(`delete from public.profiles where id = '${USER_ID}'`))
    expect(del).toMatch(/permission denied/i)
  })

  it('reaplicar a migration não falha (idempotente)', async () => {
    await expect(applyMigration(db, LOCKDOWN)).resolves.toBeUndefined()
  })
})

// ── Regressão estática: GRANT × código ──────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

function grantedProfileColumns(): Set<string> {
  const sql = readFileSync(join(ROOT, LOCKDOWN), 'utf8')
  const block = sql.match(/grant_existing_update_columns\('profiles', array\[([\s\S]*?)\]\)/)
  if (!block) throw new Error('lista de colunas de profiles não encontrada na migration')
  return new Set([...block[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]))
}

describe('toda coluna de profiles gravada pelo browser tem GRANT', () => {
  it('client components só atualizam colunas concedidas', () => {
    const granted = grantedProfileColumns()
    const written: Array<{ file: string; column: string }> = []
    for (const dir of ['app', 'components', 'lib']) {
      for (const file of walk(join(ROOT, dir))) {
        const src = readFileSync(file, 'utf8')
        if (!/^\s*['"]use client['"]/m.test(src)) continue
        for (const m of src.matchAll(/\.from\('profiles'\)\s*\.update\(\s*\{([^}]*)\}/g)) {
          for (const key of m[1].matchAll(/([a-z_]+)\s*:/g)) {
            written.push({ file: relative(ROOT, file), column: key[1] })
          }
        }
      }
    }
    expect(written.length).toBeGreaterThan(0)
    const missing = written.filter(w => !granted.has(w.column))
    expect(missing).toEqual([])
  })
})
