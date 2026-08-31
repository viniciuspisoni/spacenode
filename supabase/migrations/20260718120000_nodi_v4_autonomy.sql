-- 20260718120000_nodi_v4_autonomy.sql
--
-- Nodi V4 — copiloto central: modos de autonomia por usuário + plano do
-- projeto persistente.
--
-- nodi_user_settings: modo (consultor|copiloto|autopiloto) e limites do
--   autopiloto (nodes por ação / por dia, revisão automática). Escrita pelo
--   próprio usuário (RLS) — o servidor só LÊ para decidir gates de execução.
-- nodi_project_memory.plan: o "Plano do Projeto" (objetivo, etapas com
--   status, custos) — jsonb validado no app, gravado só após confirmação,
--   como o resto da memória.

create table if not exists public.nodi_user_settings (
  user_id             uuid        primary key references auth.users (id) on delete cascade,
  mode                text        not null default 'copiloto'
                                  check (mode in ('consultor', 'copiloto', 'autopiloto')),
  max_nodes_per_action integer    not null default 60  check (max_nodes_per_action between 0 and 1000),
  max_nodes_per_day    integer    not null default 200 check (max_nodes_per_day between 0 and 5000),
  auto_review          boolean    not null default true,
  updated_at           timestamptz not null default now()
);

comment on table public.nodi_user_settings is
  'Modo de autonomia do Nodi por usuário. Autopiloto só executa dentro dos limites daqui; o servidor lê antes de qualquer execução automática.';

alter table public.nodi_user_settings enable row level security;
revoke all on public.nodi_user_settings from anon, authenticated;
grant select, insert, update on public.nodi_user_settings to authenticated;

drop policy if exists "nodi_user_settings_own" on public.nodi_user_settings;
create policy "nodi_user_settings_own"
  on public.nodi_user_settings for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.nodi_project_memory
  add column if not exists plan jsonb;

comment on column public.nodi_project_memory.plan is
  'Plano do Projeto (V4): {objective, steps:[{order,moduleId,goal,status,estimatedNodes}], updatedAt}. Proposto pelo Nodi, gravado só após confirmação.';
