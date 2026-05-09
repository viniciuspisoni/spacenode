-- ─────────────────────────────────────────────────────────────
-- Pricing v2.1 — Office plan + Lumen system
--
-- 1. profiles.plan ganha 'office' no CHECK.
-- 2. lumen_packs: créditos avulsos com 90 dias de validade,
--    em packs de 500 / 1500 / 4000 nodes.
-- 3. consume_nodes_v2 — débito em cascata: plano primeiro,
--    depois Lumens FIFO por expires_at. Retorna JSON com o
--    detalhamento do débito.
-- 4. add_lumen_pack — inserção idempotente via webhook Stripe
--    (chave: stripe_session_id).
-- 5. user_node_balance — view consolidando saldo total
--    (plano + Lumens ativos não expirados).
--
-- consume_nodes (v2) e refund_nodes (v2) permanecem ativas em
-- paralelo durante a transição (drop em migration futura).
-- Refund pós-falha continua usando refund_nodes — em caso de
-- débito misto (plano + Lumens), o total volta pro plano. É o
-- tradeoff aceito: usuário ganha um pequeno benefício, lógica
-- fica trivial.
-- ─────────────────────────────────────────────────────────────

-- ── 1. profiles.plan: aceitar 'office' ────────────────────────

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'studio', 'office'));

-- ── 2. lumen_packs ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lumen_packs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_size         INTEGER NOT NULL CHECK (pack_size IN (500, 1500, 4000)),
  nodes_initial     INTEGER NOT NULL CHECK (nodes_initial > 0),
  nodes_remaining   INTEGER NOT NULL CHECK (nodes_remaining >= 0),
  status            TEXT    NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'depleted', 'expired')),
  stripe_session_id TEXT UNIQUE,
  purchased_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  CONSTRAINT remaining_le_initial CHECK (nodes_remaining <= nodes_initial)
);

-- Índice parcial pro consumo FIFO (cobre o ORDER BY expires_at).
CREATE INDEX IF NOT EXISTS idx_lumen_packs_user_active
  ON public.lumen_packs (user_id, expires_at ASC)
  WHERE status = 'active';

-- Índice parcial pro cron de expiração.
CREATE INDEX IF NOT EXISTS idx_lumen_packs_expires
  ON public.lumen_packs (expires_at)
  WHERE status = 'active';

ALTER TABLE public.lumen_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_read_own_lumens ON public.lumen_packs;
CREATE POLICY users_read_own_lumens
  ON public.lumen_packs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Inserts/updates só via service_role (admin.rpc bypassa RLS).
-- Sem policy de INSERT/UPDATE/DELETE pra usuário comum.

-- ── 3. consume_nodes_v2 — cascading debit (plano → Lumens FIFO) ──

CREATE OR REPLACE FUNCTION public.consume_nodes_v2(
  user_id_input UUID,
  amount        INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  plan_credits           INTEGER;
  remaining_to_debit     INTEGER := amount;
  debit_from_plan        INTEGER := 0;
  debit_from_lumens      INTEGER := 0;
  lumen_record           RECORD;
  total_lumens_available INTEGER;
BEGIN
  IF amount IS NULL OR amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: %', amount
      USING ERRCODE = '22023';
  END IF;

  -- Lock no profile pra evitar race condition
  SELECT credits INTO plan_credits
    FROM public.profiles
   WHERE id = user_id_input
     FOR UPDATE;

  IF plan_credits IS NULL THEN
    RAISE EXCEPTION 'User not found: %', user_id_input
      USING ERRCODE = 'P0002';
  END IF;

  -- Total de Lumens ativos não expirados
  SELECT COALESCE(SUM(nodes_remaining), 0) INTO total_lumens_available
    FROM public.lumen_packs
   WHERE user_id = user_id_input
     AND status = 'active'
     AND expires_at > NOW();

  -- Validação de saldo total
  IF (plan_credits + total_lumens_available) < amount THEN
    RAISE EXCEPTION
      'Insufficient nodes: % requested, % available (% plan + % lumens)',
      amount, plan_credits + total_lumens_available, plan_credits, total_lumens_available
      USING ERRCODE = 'P0001';
  END IF;

  -- 1) Debita do plano primeiro
  IF plan_credits >= remaining_to_debit THEN
    debit_from_plan    := remaining_to_debit;
    remaining_to_debit := 0;
  ELSE
    debit_from_plan    := plan_credits;
    remaining_to_debit := remaining_to_debit - plan_credits;
  END IF;

  IF debit_from_plan > 0 THEN
    UPDATE public.profiles
       SET credits = credits - debit_from_plan
     WHERE id = user_id_input;
  END IF;

  -- 2) Debita de Lumens em ordem FIFO se ainda houver pendência
  IF remaining_to_debit > 0 THEN
    FOR lumen_record IN
      SELECT id, nodes_remaining
        FROM public.lumen_packs
       WHERE user_id = user_id_input
         AND status = 'active'
         AND expires_at > NOW()
       ORDER BY expires_at ASC
         FOR UPDATE
    LOOP
      EXIT WHEN remaining_to_debit = 0;

      IF lumen_record.nodes_remaining >= remaining_to_debit THEN
        UPDATE public.lumen_packs
           SET nodes_remaining = nodes_remaining - remaining_to_debit,
               status = CASE
                 WHEN nodes_remaining - remaining_to_debit = 0 THEN 'depleted'
                 ELSE status
               END
         WHERE id = lumen_record.id;
        debit_from_lumens  := debit_from_lumens + remaining_to_debit;
        remaining_to_debit := 0;
      ELSE
        UPDATE public.lumen_packs
           SET nodes_remaining = 0,
               status          = 'depleted'
         WHERE id = lumen_record.id;
        debit_from_lumens  := debit_from_lumens + lumen_record.nodes_remaining;
        remaining_to_debit := remaining_to_debit - lumen_record.nodes_remaining;
      END IF;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'success',            TRUE,
    'total_debited',      amount,
    'from_plan',          debit_from_plan,
    'from_lumens',        debit_from_lumens,
    'plan_balance_after', plan_credits - debit_from_plan
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_nodes_v2(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_nodes_v2(uuid, integer) TO service_role;

-- ── 4. add_lumen_pack — idempotente via stripe_session_id ─────

CREATE OR REPLACE FUNCTION public.add_lumen_pack(
  user_id_input           UUID,
  pack_size_input         INTEGER,
  stripe_session_id_input TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_id UUID;
  new_pack_id UUID;
BEGIN
  IF pack_size_input NOT IN (500, 1500, 4000) THEN
    RAISE EXCEPTION 'Invalid pack size: %', pack_size_input
      USING ERRCODE = '22023';
  END IF;

  IF stripe_session_id_input IS NULL OR length(stripe_session_id_input) = 0 THEN
    RAISE EXCEPTION 'stripe_session_id is required for idempotency'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotência: se já existe pack com esse session_id, retorna o existente
  SELECT id INTO existing_id
    FROM public.lumen_packs
   WHERE stripe_session_id = stripe_session_id_input;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  INSERT INTO public.lumen_packs (
    user_id, pack_size, nodes_initial, nodes_remaining,
    stripe_session_id, expires_at
  ) VALUES (
    user_id_input,
    pack_size_input,
    pack_size_input,
    pack_size_input,
    stripe_session_id_input,
    NOW() + INTERVAL '90 days'
  )
  RETURNING id INTO new_pack_id;

  RETURN new_pack_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_lumen_pack(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.add_lumen_pack(uuid, integer, text) TO service_role;

-- ── 5. user_node_balance — view com saldo total ───────────────
--
-- security_invoker = on faz a view rodar sob a identidade do
-- caller, herdando a RLS de profiles ("auth.uid() = id"). Cada
-- user vê apenas a própria linha.

CREATE OR REPLACE VIEW public.user_node_balance
WITH (security_invoker = on)
AS
SELECT
  p.id                                                                       AS user_id,
  p.credits                                                                  AS plan_balance,
  COALESCE(SUM(lp.nodes_remaining), 0)::INTEGER                              AS lumen_balance,
  (p.credits + COALESCE(SUM(lp.nodes_remaining), 0))::INTEGER                AS total_balance,
  COUNT(lp.id) FILTER (WHERE lp.status = 'active' AND lp.expires_at > NOW()) AS active_lumen_packs
FROM public.profiles p
LEFT JOIN public.lumen_packs lp
  ON lp.user_id = p.id
 AND lp.status     = 'active'
 AND lp.expires_at > NOW()
GROUP BY p.id, p.credits;

GRANT SELECT ON public.user_node_balance TO authenticated;
