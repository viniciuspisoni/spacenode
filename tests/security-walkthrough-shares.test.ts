// walkthrough_shares sem leitura pública (auditoria 2026-11-18, recomendação 4).
//
// O que estes testes protegem:
//   • antes: qualquer pessoa, sem login, listava todos os compartilhamentos
//     (slug, walkthrough_id, views) pela API REST;
//   • depois: anônimo não lê nada, outra conta não vê compartilhamento alheio,
//     e o dono continua lendo e gerenciando os próprios.
//
// A tabela foi criada fora do repositório; o estado de produção abaixo foi
// copiado do catálogo em 2026-11-20 (colunas, policies sem TO = todos os papéis,
// grants padrão do Supabase). Roda num Postgres em WASM (PGlite).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { applyMigration, createSupabaseLikeDb } from './helpers/pglite-supabase'

const FIX = 'supabase/migrations/20261120130000_walkthrough_shares_no_public_read.sql'

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const WALK  = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const PROD_STATE = `
  create table public.walkthroughs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    created_at timestamptz not null default now()
  );
  alter table public.walkthroughs enable row level security;
  create policy walkthroughs_select_own on public.walkthroughs for select using (auth.uid() = user_id);
  create policy walkthroughs_insert_own on public.walkthroughs for insert with check (auth.uid() = user_id);
  create policy walkthroughs_update_own on public.walkthroughs for update using (auth.uid() = user_id);
  create policy walkthroughs_delete_own on public.walkthroughs for delete using (auth.uid() = user_id);

  create table public.walkthrough_shares (
    id uuid primary key default gen_random_uuid(),
    walkthrough_id uuid not null references public.walkthroughs(id) on delete cascade,
    slug text not null,
    views integer not null default 0,
    created_at timestamptz not null default now()
  );
  alter table public.walkthrough_shares enable row level security;
  create policy walkthrough_shares_owner on public.walkthrough_shares
    using (exists (select 1 from public.walkthroughs w where w.id = walkthrough_shares.walkthrough_id and w.user_id = auth.uid()))
    with check (exists (select 1 from public.walkthroughs w where w.id = walkthrough_shares.walkthrough_id and w.user_id = auth.uid()));
  create policy walkthrough_shares_public_read on public.walkthrough_shares for select using (true);

  grant usage on schema public, auth to anon, authenticated;
  grant all on public.walkthroughs, public.walkthrough_shares to anon, authenticated;
`

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

async function slugs(): Promise<string[]> {
  const { rows } = await db.query<{ slug: string }>(`select slug from public.walkthrough_shares order by slug`)
  return rows.map(r => r.slug)
}

beforeAll(async () => {
  db = await createSupabaseLikeDb([])
  await db.exec(PROD_STATE)
  await db.query(`insert into public.walkthroughs (id, user_id) values ($1, $2)`, [WALK, OWNER])
  await db.query(`insert into public.walkthrough_shares (walkthrough_id, slug) values ($1, 'apto-cliente-x')`, [WALK])
})

afterAll(async () => {
  await db?.close()
})

describe('antes da correção', () => {
  it('anônimo e outra conta listam todos os compartilhamentos', async () => {
    expect(await as(null, slugs)).toEqual(['apto-cliente-x'])
    expect(await as(OTHER, slugs)).toEqual(['apto-cliente-x'])
  })
})

describe('depois da correção', () => {
  beforeAll(async () => {
    await applyMigration(db, FIX)
  })

  it('anônimo não lê a tabela', async () => {
    const err = await as(null, () => errorOf(`select slug from public.walkthrough_shares`))
    expect(err).toMatch(/permission denied/i)
  })

  it('outra conta não vê compartilhamento alheio', async () => {
    expect(await as(OTHER, slugs)).toEqual([])
  })

  it('outra conta não cria compartilhamento no walkthrough de terceiro', async () => {
    const err = await as(OTHER, () => errorOf(
      `insert into public.walkthrough_shares (walkthrough_id, slug) values ('${WALK}', 'sequestro')`,
    ))
    expect(err).toMatch(/row-level security/i)
  })

  it('o dono continua lendo e gerenciando os próprios', async () => {
    expect(await as(OWNER, slugs)).toEqual(['apto-cliente-x'])
    await as(OWNER, () => db.exec(`insert into public.walkthrough_shares (walkthrough_id, slug) values ('${WALK}', 'apto-cliente-y')`))
    expect(await as(OWNER, slugs)).toEqual(['apto-cliente-x', 'apto-cliente-y'])
    const deleted = await as(OWNER, () => db.query(`delete from public.walkthrough_shares where slug = 'apto-cliente-y' returning id`))
    expect(deleted.rows).toHaveLength(1)
  })

  it('reaplicar a migration não falha (idempotente)', async () => {
    await expect(applyMigration(db, FIX)).resolves.toBeUndefined()
  })
})

describe('banco montado só com as migrations do repositório', () => {
  it('sem a tabela, a migration não faz nada e não falha', async () => {
    const fresh = await createSupabaseLikeDb([])
    try {
      await expect(applyMigration(fresh, FIX)).resolves.toBeUndefined()
    } finally {
      await fresh.close()
    }
  })
})
