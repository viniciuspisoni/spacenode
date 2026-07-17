-- 20260717000000_profiles_onboarding_tour.sql
--
-- Tour de boas-vindas do /app: marca quando o usuário concluiu (ou pulou) o
-- tour. NULL = nunca viu → o dashboard abre o tour automaticamente no primeiro
-- acesso. Reinício manual sempre disponível pelo item "Como usar" da sidebar.

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.profiles.onboarding_completed_at is
  'Quando o usuário concluiu ou pulou o tour de boas-vindas do /app. NULL = tour ainda não visto (abre sozinho no primeiro acesso). Reinício manual via "Como usar" na sidebar.';

-- Contas existentes não são "novos usuários": não devem ver o tour automático
-- no próximo login. O tour continua acessível a elas via "Como usar".
update public.profiles
   set onboarding_completed_at = now()
 where onboarding_completed_at is null;

-- Pós-lockdown CR-1 (20260703120000): UPDATE em profiles é concedido POR COLUNA.
-- O browser (papel authenticated) grava a conclusão direto via PostgREST, no
-- mesmo modelo do theme_preference; a policy de linha (auth.uid() = id) segue valendo.
grant update (onboarding_completed_at) on public.profiles to authenticated;
