-- editRouter v1 — roteamento inteligente de edições da Retocar.
--
-- Cria:
--   1. image_edit_attempts  — log de TODAS as tentativas de edição (inclui
--      falhas e custo real do provider), separado da tabela `edits` (que só
--      guarda sucessos do modo standalone).
--   2. user_monthly_usage   — controle mensal por usuário (edits / free fixes /
--      nodes), base pro teto mensal de correções grátis.
--   3. controle de correção grátis por imagem em renders e vistas
--      (free_fixes_used, source_tool, generated_by_spacenode).
--   4. bump_monthly_usage()  — RPC atômica pra incrementar o uso mensal.
--
-- Idempotente: seguro reaplicar (IF NOT EXISTS / DROP POLICY IF EXISTS).

-- ── image_edit_attempts ─────────────────────────────────────────────────────────
-- source_image_id / result_image_id / project_id são polimórficos (podem
-- apontar pra renders, vistas, edits ou spaces) — por isso SEM foreign key.
create table if not exists public.image_edit_attempts (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  source_image_id    uuid,
  result_image_id    uuid,
  project_id         uuid,
  tool               text        not null
                       check (tool in ('remove','material','replace','add','fix_detail','lighting','landscaping')),
  prompt             text        not null default '',
  endpoint           text        not null,
  provider           text        not null check (provider in ('fal','vertex','google')),
  cost_nodes         integer     not null default 0 check (cost_nodes >= 0),
  provider_cost_usd  numeric(10,4),
  is_free_fix        boolean     not null default false,
  has_mask           boolean     not null default false,
  mask_area_ratio    numeric(5,4),
  used_crop          boolean     not null default false,
  crop_megapixels    numeric(8,3),
  output_resolution  text        check (output_resolution in ('current','2K','4K')),
  preservation_mode  text        check (preservation_mode in ('max','balanced','creative')),
  status             text        not null default 'pending'
                       check (status in ('pending','processing','completed','failed','refunded')),
  error_message      text,
  created_at         timestamptz not null default now(),
  completed_at       timestamptz
);

create index if not exists idx_iea_user_created on public.image_edit_attempts(user_id, created_at desc);
create index if not exists idx_iea_source       on public.image_edit_attempts(source_image_id);
create index if not exists idx_iea_status        on public.image_edit_attempts(status);

alter table public.image_edit_attempts enable row level security;

drop policy if exists iea_select_own on public.image_edit_attempts;
create policy iea_select_own on public.image_edit_attempts
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists iea_insert_own on public.image_edit_attempts;
create policy iea_insert_own on public.image_edit_attempts
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists iea_update_own on public.image_edit_attempts;
create policy iea_update_own on public.image_edit_attempts
  for update to authenticated using (auth.uid() = user_id);

-- ── correção grátis por imagem (renders + vistas) ───────────────────────────────
-- generated_by_spacenode = true por padrão: tudo que já existe em renders/vistas
-- foi, de fato, gerado pelo Spacenode.
alter table public.renders
  add column if not exists free_fixes_used        integer not null default 0 check (free_fixes_used >= 0),
  add column if not exists source_tool            text,
  add column if not exists generated_by_spacenode boolean not null default true;

alter table public.vistas
  add column if not exists free_fixes_used        integer not null default 0 check (free_fixes_used >= 0),
  add column if not exists source_tool            text,
  add column if not exists generated_by_spacenode boolean not null default true;

-- ── user_monthly_usage ──────────────────────────────────────────────────────────
create table if not exists public.user_monthly_usage (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  month           date        not null,                       -- primeiro dia do mês
  edits_used      integer     not null default 0 check (edits_used >= 0),
  free_fixes_used integer     not null default 0 check (free_fixes_used >= 0),
  nodes_used      integer     not null default 0 check (nodes_used >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, month)
);

create index if not exists idx_umu_user on public.user_monthly_usage(user_id);

alter table public.user_monthly_usage enable row level security;

drop policy if exists umu_select_own on public.user_monthly_usage;
create policy umu_select_own on public.user_monthly_usage
  for select to authenticated using (auth.uid() = user_id);

-- set_updated_at já existe (spaces_block_1); recriamos por segurança/idempotência.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_umu_updated_at on public.user_monthly_usage;
create trigger trg_umu_updated_at before update on public.user_monthly_usage
  for each row execute function public.set_updated_at();

-- ── bump_monthly_usage() ──────────────────────────────────────────────────────────
-- Upsert atômico: cria a linha do mês corrente ou incrementa os contadores.
create or replace function public.bump_monthly_usage(
  user_id_input    uuid,
  edits_delta      integer default 0,
  free_fixes_delta integer default 0,
  nodes_delta      integer default 0
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  m date := date_trunc('month', now())::date;
begin
  insert into public.user_monthly_usage (user_id, month, edits_used, free_fixes_used, nodes_used)
  values (
    user_id_input, m,
    greatest(coalesce(edits_delta,      0), 0),
    greatest(coalesce(free_fixes_delta, 0), 0),
    greatest(coalesce(nodes_delta,      0), 0)
  )
  on conflict (user_id, month) do update set
    edits_used      = user_monthly_usage.edits_used      + excluded.edits_used,
    free_fixes_used = user_monthly_usage.free_fixes_used + excluded.free_fixes_used,
    nodes_used      = user_monthly_usage.nodes_used      + excluded.nodes_used,
    updated_at      = now();
end;
$$;

revoke execute on function public.bump_monthly_usage(uuid,integer,integer,integer) from public;
revoke execute on function public.bump_monthly_usage(uuid,integer,integer,integer) from anon;
grant  execute on function public.bump_monthly_usage(uuid,integer,integer,integer) to authenticated;
grant  execute on function public.bump_monthly_usage(uuid,integer,integer,integer) to service_role;
