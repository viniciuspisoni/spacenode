-- ════════════════════════════════════════════════════════════════════════════
-- Finalizar (MVP) — pós-produção arquitetônica nativa.
--
-- Ferramenta 100% local (camadas, opacidade, máscaras manuais, export PNG) que
-- NÃO consome Nodes. Estas tabelas só PERSISTEM a composição e o histórico de
-- exportações — nenhuma coluna de custo/cobrança, nenhuma RPC consume_*.
--
-- Modelo (MVP): a pilha de camadas vive em finalize_projects.document (jsonb,
-- fonte única de verdade → save atômico, sem bug de sincronização). A tabela
-- normalizada finalize_layers da spec foi DOBRADA dentro do document; pode ser
-- normalizada depois sem migração de dados destrutiva.
--
-- Storage: reusa o bucket público `space-mestres` no prefixo {user_id}/finalizar/...
-- (mesma convenção do Retocar/upload-asset). Escritas via service_role; nenhuma
-- policy nova de storage é necessária.
--
-- Convenções espelhadas de edit_router_v1 / spaces: uuid PK, user_id →
-- auth.users(id) on delete cascade, timestamptz default now(), RLS 4 policies
-- `auth.uid() = user_id` to authenticated. Idempotente (IF NOT EXISTS / CREATE
-- OR REPLACE / DROP POLICY IF EXISTS). NÃO é aplicado por db push.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Trigger function dedicada (zero blast radius sobre a set_updated_at compartilhada) ──
create or replace function public.finalize_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── finalize_projects ────────────────────────────────────────────────────────
create table if not exists public.finalize_projects (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  name            text        not null default 'Composição sem título',
  base_image_url  text,                      -- imagem da camada base (origem)
  source_space_id uuid,                      -- projeto Spaces de origem (polimórfico, SEM FK)
  width           integer,                   -- dimensões do canvas base (px)
  height          integer,
  document        jsonb       not null default '{}'::jsonb,  -- { version, width, height, layers[] }
  thumbnail_url   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_finalize_projects_user
  on public.finalize_projects(user_id, updated_at desc);

drop trigger if exists trg_finalize_projects_updated_at on public.finalize_projects;
create trigger trg_finalize_projects_updated_at
  before update on public.finalize_projects
  for each row execute function public.finalize_touch_updated_at();

alter table public.finalize_projects enable row level security;

drop policy if exists fp_select_own on public.finalize_projects;
create policy fp_select_own on public.finalize_projects
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists fp_insert_own on public.finalize_projects;
create policy fp_insert_own on public.finalize_projects
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists fp_update_own on public.finalize_projects;
create policy fp_update_own on public.finalize_projects
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists fp_delete_own on public.finalize_projects;
create policy fp_delete_own on public.finalize_projects
  for delete to authenticated using (auth.uid() = user_id);

-- ── finalize_exports ─────────────────────────────────────────────────────────
create table if not exists public.finalize_exports (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  project_id      uuid        references public.finalize_projects(id) on delete cascade,
  png_url         text        not null,
  format          text        not null default 'png' check (format in ('png', 'jpg')),
  width           integer,
  height          integer,
  file_size_bytes integer,
  created_at      timestamptz not null default now()
);

create index if not exists idx_finalize_exports_user
  on public.finalize_exports(user_id, created_at desc);
create index if not exists idx_finalize_exports_project
  on public.finalize_exports(project_id);

alter table public.finalize_exports enable row level security;

drop policy if exists fe_select_own on public.finalize_exports;
create policy fe_select_own on public.finalize_exports
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists fe_insert_own on public.finalize_exports;
create policy fe_insert_own on public.finalize_exports
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists fe_delete_own on public.finalize_exports;
create policy fe_delete_own on public.finalize_exports
  for delete to authenticated using (auth.uid() = user_id);
