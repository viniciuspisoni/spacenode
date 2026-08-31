-- ─────────────────────────────────────────────────────────────
-- Nodes extras (ex-"Lumens") — fim da validade de 90 dias
--
-- O conceito "Lumens" foi aposentado na superfície do produto
-- (2026-08-31): todos os créditos são "Nodes" — mensais (renovam
-- com o plano, profiles.credits) ou extras (avulsos, sem
-- validade, lumen_packs). Os nomes internos (tabela, funções,
-- colunas) permanecem por compatibilidade — nada é dropado nem
-- renomeado; rename só na camada de aplicação.
--
-- 1. add_lumen_pack: novos packs nascem sem vencimento
--    (expires_at = 'infinity' — a coluna segue NOT NULL e todos
--    os filtros `expires_at > NOW()` continuam verdadeiros).
-- 2. Packs ATIVOS existentes têm o vencimento removido —
--    preserva integralmente os saldos avulsos já comprados.
-- 3. consume_nodes_v2: desempate determinístico no FIFO
--    (purchased_at) — com expires_at = infinity para todos, a
--    ordem de consumo vira a ordem de compra. A cascata segue
--    idêntica: Nodes mensais primeiro, extras depois.
--
-- A edge function expire-lumens fica obsoleta (nunca foi
-- agendada — pg_cron não instalado) e sai do repositório.
-- ─────────────────────────────────────────────────────────────

-- ── 1. add_lumen_pack sem vencimento ──────────────────────────

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
    'infinity'::timestamptz  -- Nodes extras não expiram
  )
  RETURNING id INTO new_pack_id;

  RETURN new_pack_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_lumen_pack(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.add_lumen_pack(uuid, integer, text) TO service_role;

-- ── 2. Packs ativos existentes: remover vencimento ────────────

UPDATE public.lumen_packs
   SET expires_at = 'infinity'::timestamptz
 WHERE status = 'active';

-- ── 3. consume_nodes_v2 com desempate por purchased_at ────────

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

  -- Total de Nodes extras ativos
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

  -- 1) Debita dos Nodes mensais (plano) primeiro
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

  -- 2) Debita dos Nodes extras na ordem de compra se ainda houver pendência
  IF remaining_to_debit > 0 THEN
    FOR lumen_record IN
      SELECT id, nodes_remaining
        FROM public.lumen_packs
       WHERE user_id = user_id_input
         AND status = 'active'
         AND expires_at > NOW()
       ORDER BY expires_at ASC, purchased_at ASC
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
