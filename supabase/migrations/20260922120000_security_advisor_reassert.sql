-- ─────────────────────────────────────────────────────────────
-- Reaplica o hardening de segurança (alerta do Supabase Advisor)
--
-- O projeto spacenode-dev recebeu o alerta CRITICAL
-- `rls_disabled_in_public` para public.migration_audits: a tabela
-- estava com RLS desligado e grants completos para anon/authenticated
-- (qualquer um com a URL + anon key podia ler/editar/apagar).
--
-- As correções já existiam em 20260508000001_lock_down_audit_tables e
-- 20260508000002_harden_security_definer_functions, mas o banco de dev
-- divergiu. Esta migration é idempotente e reafirma o estado seguro:
--
--   1. migration_audits → RLS ligado, sem policies (deny-all) e sem
--      grants para anon/authenticated. Só migrations (postgres) e
--      service_role usam essa tabela.
--   2. consume_nodes / refund_nodes → SECURITY DEFINER que aceitam
--      qualquer user_id: expostas via /rest/v1/rpc permitiam a um
--      visitante dar Nodes a si mesmo (refund) ou zerar o saldo de
--      outros (consume). O app só chama via service_role.
--   3. marketing.tag_internal_actor_event → função de trigger; não
--      precisa ser chamável via RPC (triggers não checam EXECUTE).
--   4. update_spaces_updated_at → search_path fixo.
-- ─────────────────────────────────────────────────────────────

-- 1. migration_audits
DO $$
BEGIN
  IF to_regclass('public.migration_audits') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.migration_audits ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.migration_audits FROM anon, authenticated';
  END IF;
  IF to_regclass('public.pre_pricing_v2_balance_snapshot') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.pre_pricing_v2_balance_snapshot ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.pre_pricing_v2_balance_snapshot FROM anon, authenticated';
  END IF;
END $$;

-- 2. RPCs de saldo: somente service_role
REVOKE EXECUTE ON FUNCTION public.consume_nodes(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_nodes(uuid, integer)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_nodes(uuid, integer) TO service_role;
GRANT  EXECUTE ON FUNCTION public.refund_nodes(uuid, integer)  TO service_role;

-- 3. Função de trigger do marketing
DO $$
BEGIN
  IF to_regprocedure('marketing.tag_internal_actor_event()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION marketing.tag_internal_actor_event() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- 4. search_path fixo
ALTER FUNCTION public.update_spaces_updated_at() SET search_path = public, pg_temp;
