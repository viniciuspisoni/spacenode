-- Workspaces/Equipes — Fase 1 (hardening pós-advisor de segurança).
--
-- As funções de trigger NUNCA precisam ser chamadas diretamente (elas disparam
-- sozinhas no INSERT). O Supabase concede EXECUTE a `authenticated` por padrão em
-- toda função nova do schema public, o que as exporia como RPC em /rest/v1/rpc/.
-- Removemos esse EXECUTE. Os triggers continuam disparando normalmente — a
-- execução de um trigger NÃO checa privilégio EXECUTE do papel que faz o INSERT.
--
-- (public e anon já tinham sido revogados na migration de gerações.)
revoke execute on function public.set_generation_workspace_id() from authenticated;
revoke execute on function public.set_shot_workspace_id()       from authenticated;
