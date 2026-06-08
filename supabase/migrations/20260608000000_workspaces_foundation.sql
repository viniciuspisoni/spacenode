-- Workspaces/Equipes — Fase 1 (fundação).
--
-- Cria a camada organizacional ACIMA do usuário individual, sem mudar o fluxo
-- atual de quem usa sozinho:
--   1. workspaces         — um workspace por pessoa (type 'individual') ou
--      escritório (type 'office'). owner_id = conta principal (a "bolsa" de
--      nodes na Fase 1.5).
--   2. workspace_members  — quem participa de cada workspace e com qual papel.
--      Índice único parcial garante a regra de produto: cada usuário tem
--      EXATAMENTE UM workspace ativo por vez.
--   3. is_workspace_member() — helper SECURITY DEFINER usado nas policies de RLS
--      (evita recursão infinita ao consultar workspace_members dentro da própria
--      policy de workspace_members).
--   4. Backfill — cria o workspace pessoal de cada usuário JÁ existente.
--   5. handle_new_user() — passa a criar o workspace pessoal de todo novo
--      cadastro (preserva 100% do insert em profiles que já existia).
--
-- NÃO toca em cobrança, RLS de projetos, nem nas tabelas de geração.
-- Aditivo e reversível. Idempotente: seguro reaplicar.

-- ── workspaces ──────────────────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  type       text        not null default 'individual' check (type in ('individual','office')),
  -- owner_id = conta principal. ON DELETE CASCADE: apagar o dono apaga o
  -- workspace pessoal dele (comportamento atual de exclusão de conta segue
  -- funcionando). Reatribuição de dono de escritório é tema da Fase 3.
  owner_id   uuid        not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspaces_owner on public.workspaces(owner_id);

-- ── workspace_members ───────────────────────────────────────────────────────────
create table if not exists public.workspace_members (
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  role         text        not null default 'member' check (role in ('owner','admin','member')),
  status       text        not null default 'active'  check (status in ('active','invited','removed')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_wm_user on public.workspace_members(user_id);

-- Regra de produto: 1 workspace ATIVO por usuário (decisão 2026-06).
create unique index if not exists uq_wm_one_active_per_user
  on public.workspace_members(user_id) where status = 'active';

-- ── is_workspace_member() ─────────────────────────────────────────────────────────
-- SECURITY DEFINER de propósito: as policies de RLS de workspace_members
-- precisam consultar workspace_members; chamar a tabela direto na policy causaria
-- recursão. Encapsular num SECURITY DEFINER quebra a recursão (padrão Supabase).
create or replace function public.is_workspace_member(p_workspace uuid, p_user uuid)
returns boolean
language sql
security definer
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace and user_id = p_user and status = 'active'
  );
$$;

revoke execute on function public.is_workspace_member(uuid,uuid) from public;
revoke execute on function public.is_workspace_member(uuid,uuid) from anon;
grant  execute on function public.is_workspace_member(uuid,uuid) to authenticated;
grant  execute on function public.is_workspace_member(uuid,uuid) to service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────────
-- Leitura: membro enxerga seus próprios workspaces e os colegas do mesmo
-- workspace. Escrita (insert/update/delete) NÃO tem policy → só service-role e os
-- triggers SECURITY DEFINER gravam. Criação/convite vira ação controlada no
-- servidor nas Fases 2/3.
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id, auth.uid()));

drop policy if exists wm_select_same_workspace on public.workspace_members;
create policy wm_select_same_workspace on public.workspace_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- ── Backfill: workspace pessoal pra cada usuário existente ───────────────────────
-- Guardas garantem idempotência (não duplica em reaplicação).
insert into public.workspaces (name, type, owner_id)
select coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)), 'individual', p.id
from public.profiles p
where not exists (
  select 1 from public.workspace_members m
  where m.user_id = p.id and m.status = 'active'
);

insert into public.workspace_members (workspace_id, user_id, role, status)
select w.id, w.owner_id, 'owner', 'active'
from public.workspaces w
where not exists (
  select 1 from public.workspace_members m
  where m.workspace_id = w.id and m.user_id = w.owner_id
);

-- ── handle_new_user(): cadastro passa a criar o workspace pessoal ────────────────
-- Mantém EXATAMENTE o insert em profiles que já existia e só ADICIONA o workspace
-- pessoal + a membership de owner. O trigger on_auth_user_created já aponta pra
-- esta função (não precisa recriar o trigger).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );

  insert into public.workspaces (name, type, owner_id)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    'individual',
    new.id
  )
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role, status)
  values (v_workspace_id, new.id, 'owner', 'active');

  return new;
end;
$$;
