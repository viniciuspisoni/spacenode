-- Hardening do editRouter v1 (advisors de segurança do Supabase).
--
-- 1. bump_monthly_usage() é SECURITY DEFINER e só deve ser chamada pelo
--    servidor (admin/service_role). Permitir `authenticated` deixaria um
--    usuário logado inflar o uso mensal de QUALQUER user_id via /rest/v1/rpc.
--    A rota já chama via createAdminClient() (service_role), então revogamos
--    de authenticated. (lint 0029)
revoke execute on function public.bump_monthly_usage(uuid,integer,integer,integer) from authenticated;

-- 2. Fixar search_path da trigger function (lint 0011). Ela só usa now()
--    (pg_catalog), então search_path vazio é seguro.
alter function public.set_updated_at() set search_path = '';
