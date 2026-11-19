-- 20261119190000_private_is_workspace_member.sql
--
-- Auditoria de segurança 2026-11-18, recomendação 5
-- (docs/audits/2026-11-18/seguranca.md) — advisor 0029.
--
-- ── PROBLEMA ────────────────────────────────────────────────────────────────
-- public.is_workspace_member(p_workspace, p_user) é SECURITY DEFINER e fica
-- exposta pela API REST (/rest/v1/rpc/is_workspace_member) para `authenticated`.
-- Como recebe o usuário por parâmetro, qualquer conta logada consegue perguntar
-- "o usuário X participa do escritório Y?" para QUALQUER par de UUIDs e mapear
-- a equipe de outro escritório (exige conhecer os UUIDs).
--
-- ── SOLUÇÃO ─────────────────────────────────────────────────────────────────
-- Padrão recomendado pelo Supabase para helpers de RLS:
--   • private.is_workspace_member(p_workspace) num schema que o PostgREST NÃO
--     expõe — não existe endpoint RPC para ele;
--   • só recebe o workspace; o usuário vem SEMPRE da sessão (auth.uid()), então
--     mesmo chamado direto não responde sobre terceiros;
--   • continua SECURITY DEFINER pelo motivo original: a policy de
--     workspace_members consulta a própria tabela (sem isso, recursão de RLS).
-- As duas únicas policies que usavam a função antiga (workspaces_select_member
-- e wm_select_same_workspace, ambas com auth.uid()) passam a usar a nova; o
-- comportamento de leitura é o mesmo. Nenhum código do app chama a função por
-- RPC (grep 2026-11-19), então a antiga é removida.
--
-- ATENÇÃO: 20260608000000_workspaces_foundation.sql recria a função antiga e as
-- policies se for reaplicada. Não reaplicar em produção.
--
-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
--   select to_regprocedure('public.is_workspace_member(uuid,uuid)');   -- null
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy
--    where polname in ('workspaces_select_member', 'wm_select_same_workspace');
--
-- ── REVERSÃO ────────────────────────────────────────────────────────────────
-- Reaplicar o bloco "is_workspace_member()" + "RLS" de
-- 20260608000000_workspaces_foundation.sql.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_workspace_member(p_workspace uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

revoke execute on function private.is_workspace_member(uuid) from public, anon;
grant  execute on function private.is_workspace_member(uuid) to authenticated, service_role;

alter policy workspaces_select_member on public.workspaces
  using (private.is_workspace_member(id));

alter policy wm_select_same_workspace on public.workspace_members
  using (private.is_workspace_member(workspace_id));

drop function if exists public.is_workspace_member(uuid, uuid);
