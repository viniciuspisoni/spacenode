-- Workspaces/Equipes — Fase 3 (convites + papéis + transições de membership).
--
-- 1. workspace_invites — convite por email com token. Entrega via LINK (sem
--    provedor de email): o owner/admin gera e compartilha o link manualmente.
-- 2. accept_workspace_invite() — aceite ATÔMICO: valida token/email/expiração e
--    move o usuário pro workspace do convite, respeitando a regra "1 workspace
--    ativo por pessoa" (sai do pessoal, entra no escritório).
-- 3. remove_workspace_member() — tira o membro do escritório e o DEVOLVE ao
--    workspace pessoal (reativa a membership de owner dele).
--
-- Acesso só via service-role (as rotas checam owner/admin antes). Não mexe no RLS
-- dos projetos. Aditivo, reversível, idempotente.

-- ── workspace_invites ──────────────────────────────────────────────────────────────
create table if not exists public.workspace_invites (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  email        text        not null,
  role         text        not null default 'member' check (role in ('admin','member')),
  token        text        not null unique,
  status       text        not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by   uuid        not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '14 days'),
  accepted_at  timestamptz,
  accepted_by  uuid        references public.profiles(id) on delete set null
);

create index if not exists idx_wi_workspace on public.workspace_invites(workspace_id, status);
create index if not exists idx_wi_token     on public.workspace_invites(token);
-- No máximo 1 convite pendente por email por workspace.
create unique index if not exists uq_wi_pending_email
  on public.workspace_invites(workspace_id, lower(email)) where status = 'pending';

alter table public.workspace_invites enable row level security;
-- Sem policies de propósito: todo acesso passa por rota de servidor que checa
-- owner/admin (gestão) ou pelo aceite (service-role com user verificado).

-- ── accept_workspace_invite() ──────────────────────────────────────────────────────
create or replace function public.accept_workspace_invite(p_token text, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invite public.workspace_invites;
  v_email  text;
begin
  select * into v_invite from public.workspace_invites where token = p_token for update;
  if v_invite.id is null          then raise exception 'invite_not_found'    using errcode = 'P0001'; end if;
  if v_invite.status <> 'pending' then raise exception 'invite_not_pending'  using errcode = 'P0001'; end if;
  if v_invite.expires_at < now()  then raise exception 'invite_expired'      using errcode = 'P0001'; end if;

  select email into v_email from public.profiles where id = p_user;
  if v_email is null or lower(v_email) <> lower(v_invite.email) then
    raise exception 'invite_email_mismatch' using errcode = 'P0001';
  end if;

  -- Já é membro ativo deste workspace? Só fecha o convite.
  if exists (
    select 1 from public.workspace_members
    where workspace_id = v_invite.workspace_id and user_id = p_user and status = 'active'
  ) then
    update public.workspace_invites
      set status = 'accepted', accepted_at = now(), accepted_by = p_user
      where id = v_invite.id;
    return jsonb_build_object('workspace_id', v_invite.workspace_id, 'already_member', true);
  end if;

  -- Sai do workspace ativo atual (regra: 1 ativo por pessoa).
  update public.workspace_members set status = 'removed'
    where user_id = p_user and status = 'active';

  -- Entra no workspace do convite.
  insert into public.workspace_members (workspace_id, user_id, role, status)
  values (v_invite.workspace_id, p_user, v_invite.role, 'active')
  on conflict (workspace_id, user_id) do update set status = 'active', role = excluded.role;

  -- O workspace vira 'office' ao ganhar membro além do dono.
  update public.workspaces set type = 'office'
    where id = v_invite.workspace_id and type = 'individual';

  update public.workspace_invites
    set status = 'accepted', accepted_at = now(), accepted_by = p_user
    where id = v_invite.id;

  return jsonb_build_object('workspace_id', v_invite.workspace_id, 'role', v_invite.role);
end;
$$;

-- ── remove_workspace_member() ──────────────────────────────────────────────────────
create or replace function public.remove_workspace_member(p_workspace uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.workspaces where id = p_workspace;
  if v_owner = p_user then raise exception 'cannot_remove_owner' using errcode = 'P0001'; end if;

  update public.workspace_members set status = 'removed'
    where workspace_id = p_workspace and user_id = p_user;

  -- Devolve ao workspace pessoal (onde ele é owner): reativa a membership.
  update public.workspace_members set status = 'active'
    where user_id = p_user and role = 'owner'
      and workspace_id in (select id from public.workspaces where owner_id = p_user);
end;
$$;

revoke execute on function public.accept_workspace_invite(text, uuid) from public, anon, authenticated;
grant  execute on function public.accept_workspace_invite(text, uuid) to service_role;
revoke execute on function public.remove_workspace_member(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.remove_workspace_member(uuid, uuid) to service_role;
