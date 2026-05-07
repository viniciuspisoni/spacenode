-- ─────────────────────────────────────────────────────────────
-- Pricing v2 — Engines (Vega · Quasar · Pulsar)
--
-- 1. renders ganha engine / resolution / nodes_charged + CHECK
--    proibindo HD em vega/quasar.
-- 2. consume_nodes / refund_nodes — débito atômico variável e
--    refund. Espelham o corpo de consume_credits em produção
--    (sem auth.uid() guard) para que admin.rpc continue
--    funcionando.
-- 3. Migração one-shot de saldos × 5, com guarda idempotente
--    via migration_audits — re-rodar é seguro.
--
-- consume_credits legada permanece viva durante a transição.
-- ─────────────────────────────────────────────────────────────

-- ── 1. Colunas em renders ─────────────────────────────────────

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'vega'
    CHECK (engine IN ('vega', 'quasar', 'pulsar'));

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS resolution text NOT NULL DEFAULT '2k'
    CHECK (resolution IN ('hd', '2k', '4k'));

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS nodes_charged integer NOT NULL DEFAULT 1
    CHECK (nodes_charged > 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'renders_valid_engine_resolution'
      AND conrelid = 'renders'::regclass
  ) THEN
    ALTER TABLE renders
      ADD CONSTRAINT renders_valid_engine_resolution
      CHECK (NOT (engine IN ('vega', 'quasar') AND resolution = 'hd'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_renders_engine     ON renders(engine);
CREATE INDEX IF NOT EXISTS idx_renders_resolution ON renders(resolution);

-- ── 2. consume_nodes / refund_nodes ───────────────────────────
--
-- Importante: NÃO replicar o auth.uid() guard que consta na
-- migration 20260503000001 (essa versão do consume_credits nunca
-- foi aplicada — em produção roda a versão simples sem guard).
-- Como o /api/generate chama via admin.rpc (service_role, sem
-- JWT), o guard quebraria todo débito silenciosamente.

CREATE OR REPLACE FUNCTION public.consume_nodes(
  user_id_input uuid,
  amount        integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_credits integer;
BEGIN
  IF amount IS NULL OR amount <= 0 THEN
    RETURN false;
  END IF;

  SELECT credits
    INTO current_credits
    FROM public.profiles
   WHERE id = user_id_input
   FOR UPDATE;

  IF current_credits IS NULL THEN
    RETURN false;
  END IF;

  IF current_credits >= amount THEN
    UPDATE public.profiles
       SET credits = credits - amount
     WHERE id = user_id_input;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_nodes(
  user_id_input uuid,
  amount        integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF amount IS NULL OR amount <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.profiles
     SET credits = credits + amount
   WHERE id = user_id_input;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_nodes(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_nodes(uuid, integer)  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.consume_nodes(uuid, integer) TO service_role;
GRANT  EXECUTE ON FUNCTION public.refund_nodes(uuid, integer)  TO service_role;

-- ── 3. Migração one-shot de saldos × 5 ────────────────────────
--
-- Custos sobem ~5x sob a tabela engine × resolução. Para preservar
-- o poder de compra dos usuários ativos no momento do deploy,
-- multiplicamos profiles.credits por 5 uma única vez.
--
-- migration_audits garante idempotência: se a migration for
-- re-aplicada (db reset, ambiente novo, etc.) não multiplica
-- novamente.

CREATE TABLE IF NOT EXISTS migration_audits (
  migration_name text PRIMARY KEY,
  applied_at     timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM migration_audits
    WHERE migration_name = 'pricing_v2_balance_x5'
  ) THEN
    UPDATE public.profiles SET credits = credits * 5;
    INSERT INTO migration_audits (migration_name)
      VALUES ('pricing_v2_balance_x5');
  END IF;
END $$;
