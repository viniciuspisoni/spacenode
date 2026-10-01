// Postgres de verdade (PGlite, WASM) com o mínimo de Supabase que as
// migrations do caminho de créditos usam: auth.users, auth.uid(), os papéis
// e o schema storage. Roda as migrations REAIS do repositório — é o que
// permite testar no vitest regra que mora em SQL/plpgsql (default de
// profiles.credits, handle_new_user, grant_plan_nodes).
//
// Lista explícita de migrations: o histórico do repositório não recria o
// banco inteiro (há objetos de produção cujas migrations nunca entraram
// aqui), mas este recorte aplica sem erro — e qualquer erro derruba o teste.

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  email_confirmed_at timestamptz
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (
  id text primary key, name text, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select string_to_array(name, '/') $$;
`

/** Caminho de cadastro, créditos de plano e conteúdo de landing/anúncios. */
export const CREDIT_PATH_MIGRATIONS = [
  'supabase-schema.sql',
  'supabase/migrations/20260507000000_pricing_v2_engines.sql',
  'supabase/migrations/20260508140000_pricing_v2_1_office_lumen.sql',
  'supabase/migrations/20260529000000_free_signup_nodes_40.sql',
  'supabase/migrations/20260608000000_workspaces_foundation.sql',
  'supabase/migrations/20260703150000_node_ledger_ai_cost_log.sql',
  'supabase/migrations/20260713000000_marketing_schema.sql',
  'supabase/migrations/20260713000001_marketing_seed.sql',
  'supabase/migrations/20260718000000_marketing_ads_schema.sql',
  'supabase/migrations/20260718000001_marketing_ads_seed.sql',
  'supabase/migrations/20260728000000_free_signup_nodes_80.sql',
  'supabase/migrations/20260831190000_extra_nodes_no_expiry.sql',
  'supabase/migrations/20260910120000_cumulative_plan_nodes.sql',
  'supabase/migrations/20260912000000_essence_plan.sql',
  'supabase/migrations/20260916120000_lp_print_do_sketchup_conversao.sql',
  'supabase/migrations/20261001135341_lp_sketchup_hero_conversao.sql',
  'supabase/migrations/20261001150323_free_signup_nodes_40.sql',
] as const

export function readRepoFile(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

export async function createSupabaseLikeDb(migrations: readonly string[]): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUB)
  for (const file of migrations) await applyMigration(db, file)
  return db
}

export async function applyMigration(db: PGlite, file: string): Promise<void> {
  try {
    await db.exec(readRepoFile(file))
  } catch (err) {
    throw new Error(`migration ${file} falhou: ${err instanceof Error ? err.message : String(err)}`)
  }
}
