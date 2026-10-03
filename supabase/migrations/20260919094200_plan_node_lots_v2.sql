-- ─────────────────────────────────────────────────────────────
-- Regra de créditos v2 — lotes com validade própria + congelamento
-- (Fase A, 2026-09-19)
--
-- O saldo mensal deixa de ser um escalar com UMA data e passa a ser um
-- conjunto de LOTES, cada um com seu vencimento. É o que permite:
--
--   • nodes v2 vencerem 90 dias depois de CADA concessão;
--   • consumo FIFO pelo vencimento mais próximo;
--   • saldo v1 e v2 convivendo na MESMA conta (quem estava no Starter e
--     migra para um plano novo mantém os lotes antigos sob a regra antiga).
--
-- Por isso `rule_version` mora no LOTE, não no perfil: o regime é uma
-- propriedade do crédito concedido, não da pessoa.
--
-- ── Diferença entre os regimes ────────────────────────────────
--
--   v1 (legado — Starter/Office e tudo que já existe)
--     · lote sem validade própria (expires_at = 'infinity');
--     · encerrada a assinatura, o saldo segue GASTÁVEL por 90 dias,
--       governado por profiles.nodes_expire_at (regra atual, intocada).
--
--   v2 (Essence/Pro/Studio, a partir de nodes_v2_from())
--     · lote vence em granted_at + 90 dias;
--     · encerrada a assinatura, os lotes v2 ficam CONGELADOS — visíveis,
--       não gastáveis — e profiles.nodes_frozen_until marca o prazo;
--     · reativar limpa o congelamento e libera só o que ainda não venceu:
--       o congelamento NÃO pausa nem renova a validade;
--     · passado o prazo sem reativar, os lotes v2 são expirados.
--
-- ── ESTA MIGRATION É INERTE EM PRODUÇÃO ───────────────────────
--
-- `nodes_v2_from()` devolve 'infinity', então NENHUMA concessão nasce v2
-- até a Fase C trocar essa função pela data de vigência real. Motivo: os
-- Termos ainda prometem a regra v1. Conceder v2 antes deles mudarem seria
-- entregar MENOS do que o contrato promete — a direção perigosa.
--
-- Até lá, todo lote nasce v1 e o comportamento observável é idêntico ao
-- de hoje. Os Starter atuais nunca saem de v1: o regime é decidido pelo
-- plano, e planos legados nunca viram v2.
-- ─────────────────────────────────────────────────────────────

-- ── 1. nodes_v2_from — a chave de vigência ────────────────────
--
-- Uma função, não uma constante espalhada: a Fase C faz um único
-- CREATE OR REPLACE com a data real e tudo passa a concordar. Enquanto
-- devolver 'infinity', nenhuma comparação `>=` é verdadeira.

CREATE OR REPLACE FUNCTION public.nodes_v2_from()
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT 'infinity'::TIMESTAMPTZ $$;

COMMENT ON FUNCTION public.nodes_v2_from() IS
  'Data a partir da qual concessões de planos não-legados nascem v2. '
  '''infinity'' = regra v2 desligada. A Fase C troca pela data de vigência '
  'dos Termos — tem de ser EXATAMENTE a mesma data publicada em /termos.';

-- Os dois prazos da regra v2, em funções pelo mesmo motivo: o SQL e o
-- TypeScript (lib/billing/nodes.ts, Fase B) precisam concordar, e mudar um
-- número em dois lugares é como a promessa dos 90 dias se desencontrou da
-- vitrine antes.

CREATE OR REPLACE FUNCTION public.nodes_lot_days()
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT 90 $$;

COMMENT ON FUNCTION public.nodes_lot_days() IS
  'Validade, em dias, de cada lote v2 a contar da concessão.';

CREATE OR REPLACE FUNCTION public.nodes_freeze_days()
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT 30 $$;

COMMENT ON FUNCTION public.nodes_freeze_days() IS
  'Prazo, em dias, para reativar e descongelar o saldo v2 após o fim da '
  'assinatura. O congelamento NÃO pausa a validade de cada lote.';

-- ── 2. plan_node_rule — quem nasce v2 ─────────────────────────
--
-- Planos legados (starter, office) nunca viram v2: direito adquirido de
-- quem já assinava. `plan_name` NULL cai em v1 de propósito — sem saber o
-- plano, o conservador é a regra antiga, que é a mais generosa.

CREATE OR REPLACE FUNCTION public.plan_node_rule(
  plan_name_input TEXT,
  granted_at_input TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN plan_name_input IS NULL                        THEN 'v1'
    WHEN plan_name_input IN ('starter', 'office')       THEN 'v1'
    WHEN granted_at_input >= public.nodes_v2_from()     THEN 'v2'
    ELSE 'v1'
  END
$$;

-- ── 3. plan_node_lots ─────────────────────────────────────────
--
-- Mesmo formato de lumen_packs (que já provou o modelo para os extras),
-- mas tabela própria: lumen_packs tem CHECK (pack_size IN (500,1500,4000))
-- e as franquias de plano violam. Separar também mantém a decisão do dono
-- de que extras e mensais são coisas distintas.

CREATE TABLE IF NOT EXISTS public.plan_node_lots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nodes_initial   INTEGER NOT NULL CHECK (nodes_initial > 0),
  nodes_remaining INTEGER NOT NULL CHECK (nodes_remaining >= 0),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'depleted', 'expired')),
  rule_version    TEXT NOT NULL CHECK (rule_version IN ('v1', 'v2')),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 'infinity' para v1: a validade dele é a da conta (nodes_expire_at),
  -- não a do lote. Assim o ORDER BY do FIFO não precisa de CASE.
  expires_at      TIMESTAMPTZ NOT NULL,
  source_kind     TEXT,
  source_id       TEXT,
  CONSTRAINT plan_node_lots_remaining_le_initial CHECK (nodes_remaining <= nodes_initial)
);

-- FIFO: vencimento mais próximo primeiro. 'infinity' ordena por último
-- naturalmente, então lotes v2 são gastos antes dos v1 — que é o que o
-- usuário quer (gasta o que morre antes).
CREATE INDEX IF NOT EXISTS idx_plan_node_lots_fifo
  ON public.plan_node_lots (user_id, expires_at ASC, granted_at ASC)
  WHERE status = 'active';

-- Varredura do cron: só lotes com vencimento real e ainda ativos.
CREATE INDEX IF NOT EXISTS idx_plan_node_lots_expiring
  ON public.plan_node_lots (expires_at)
  WHERE status = 'active' AND expires_at <> 'infinity'::TIMESTAMPTZ;

ALTER TABLE public.plan_node_lots ENABLE ROW LEVEL SECURITY;

-- Leitura própria; escrita só por SECURITY DEFINER / service_role.
DROP POLICY IF EXISTS plan_node_lots_select_own ON public.plan_node_lots;
CREATE POLICY plan_node_lots_select_own ON public.plan_node_lots
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON public.plan_node_lots TO authenticated;

COMMENT ON TABLE public.plan_node_lots IS
  'Lotes de Nodes mensais. Cada concessão é um lote com validade própria. '
  'rule_version fica no LOTE para que saldo v1 e v2 convivam na mesma conta.';

-- ── 4. profiles.nodes_frozen_until ────────────────────────────
--
-- NOT NULL = os lotes v2 estão congelados, e o valor é o prazo para
-- reativar. A checagem de "congelado" é `IS NOT NULL`, não a comparação
-- com NOW(): depois do prazo os lotes são EXPIRADOS pela varredura, não
-- descongelados. Quem limpa a coluna é a reativação.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nodes_frozen_until TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.nodes_frozen_until IS
  'NOT NULL = lotes v2 congelados (visíveis, não gastáveis); o valor é o '
  'prazo para reativar e recuperar. NULL = não congelado. Não afeta lotes v1, '
  'que seguem governados por nodes_expire_at.';

CREATE INDEX IF NOT EXISTS idx_profiles_nodes_frozen_until
  ON public.profiles (nodes_frozen_until)
  WHERE nodes_frozen_until IS NOT NULL;

-- ── 5. plan_lot_is_usable — a regra, num lugar só ─────────────
--
-- Toda leitura de saldo e todo consumo passam por aqui. Sem isto, a
-- condição apareceria em consume, na view e no cron, e divergiria.

CREATE OR REPLACE FUNCTION public.plan_lot_is_usable(
  rule_version_input     TEXT,
  lot_expires_at         TIMESTAMPTZ,
  profile_expire_at      TIMESTAMPTZ,
  profile_frozen_until   TIMESTAMPTZ,
  now_input              TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE rule_version_input
    -- v2: vale a validade do PRÓPRIO lote, e congelado não gasta.
    WHEN 'v2' THEN lot_expires_at > now_input AND profile_frozen_until IS NULL
    -- v1: validade da CONTA (janela pós-cancelamento), como sempre foi.
    ELSE profile_expire_at IS NULL OR profile_expire_at > now_input
  END
$$;

-- ── 6. recompute_plan_credits ─────────────────────────────────
--
-- profiles.credits continua existindo e continua sendo "quanto dá para
-- gastar agora" — é lido em muitos pontos do app e não vale refatorar
-- todos. Passa a ser CACHE da soma dos lotes UTILIZÁVEIS: saldo congelado
-- e saldo vencido não entram, então nenhum leitor antigo mostra crédito
-- que a geração recusaria.
--
-- Pressupõe que o caller segura o lock da linha do profile.

CREATE OR REPLACE FUNCTION public.recompute_plan_credits(
  user_id_input UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  usable INTEGER := 0;
  p_expire TIMESTAMPTZ;
  p_frozen TIMESTAMPTZ;
BEGIN
  SELECT nodes_expire_at, nodes_frozen_until
    INTO p_expire, p_frozen
    FROM public.profiles
   WHERE id = user_id_input;

  SELECT COALESCE(SUM(l.nodes_remaining), 0)::INTEGER
    INTO usable
    FROM public.plan_node_lots l
   WHERE l.user_id = user_id_input
     AND l.status = 'active'
     AND public.plan_lot_is_usable(l.rule_version, l.expires_at, p_expire, p_frozen);

  UPDATE public.profiles SET credits = usable WHERE id = user_id_input;
  RETURN usable;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_plan_credits(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recompute_plan_credits(uuid) TO service_role;

-- ── 7. Backfill — o saldo de hoje vira um lote v1 ─────────────
--
-- Um lote por perfil com saldo, v1 e sem validade própria: ninguém perde
-- nodes e ninguém ganha vencimento retroativo. Idempotente pela marca
-- source_kind='backfill' (a migration pode reexecutar).

INSERT INTO public.plan_node_lots
  (user_id, nodes_initial, nodes_remaining, status, rule_version, granted_at, expires_at, source_kind)
SELECT
  p.id, p.credits, p.credits, 'active', 'v1', NOW(), 'infinity'::TIMESTAMPTZ, 'backfill'
FROM public.profiles p
WHERE p.credits > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.plan_node_lots l
     WHERE l.user_id = p.id AND l.source_kind = 'backfill'
  );

-- ── 8. grant_plan_nodes — passa a criar lote ──────────────────
--
-- Mantém a assinatura, o retorno e a idempotência pela chave do Stripe
-- (índice único de node_ledger em (kind, stripe_event_id)). O lote nasce
-- DENTRO da mesma transação do movimento no livro-razão, então uma
-- reentrega do Stripe não cria lote duplicado: ela nem chega aqui.

CREATE OR REPLACE FUNCTION public.grant_plan_nodes(
  user_id_input   UUID,
  amount          INTEGER,
  plan_name       TEXT    DEFAULT NULL,
  kind_input      TEXT    DEFAULT 'grant_renewal',
  source_id_input TEXT    DEFAULT NULL,
  source_input    TEXT    DEFAULT 'stripe'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_credits INTEGER;
  new_balance     INTEGER;
  rule            TEXT;
  lot_expires     TIMESTAMPTZ;
  clears_deadline BOOLEAN;
  already         BOOLEAN := FALSE;
BEGIN
  IF amount IS NULL OR amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: %', amount USING ERRCODE = '22023';
  END IF;

  IF kind_input NOT IN ('grant_plan', 'grant_renewal', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid grant kind: %', kind_input USING ERRCODE = '22023';
  END IF;

  -- Só um grant de ASSINATURA prova que existe assinatura ativa, e por isso
  -- só ele limpa prazo e congelamento. Um 'adjustment' (cortesia do suporte)
  -- numa conta cancelada não descongela nada.
  clears_deadline := kind_input IN ('grant_plan', 'grant_renewal');

  SELECT credits INTO current_credits
    FROM public.profiles WHERE id = user_id_input FOR UPDATE;

  IF current_credits IS NULL THEN
    RAISE EXCEPTION 'User not found: %', user_id_input USING ERRCODE = 'P0002';
  END IF;

  -- Idempotência: reserva o movimento no livro-razão primeiro. Se a chave
  -- do Stripe já existir, o índice único levanta 23505 e nada é creditado.
  IF source_id_input IS NOT NULL THEN
    BEGIN
      INSERT INTO public.node_ledger (user_id, delta, kind, source, stripe_event_id, balance_after)
      VALUES (user_id_input, amount, kind_input, source_input, source_id_input, current_credits + amount);
    EXCEPTION WHEN unique_violation THEN
      already := TRUE;
    END;
  ELSE
    INSERT INTO public.node_ledger (user_id, delta, kind, source, balance_after)
    VALUES (user_id_input, amount, kind_input, source_input, current_credits + amount);
  END IF;

  IF already THEN
    RETURN json_build_object(
      'success', TRUE, 'applied', FALSE, 'granted', 0, 'balance', current_credits
    );
  END IF;

  rule := public.plan_node_rule(plan_name, NOW());
  lot_expires := CASE
    WHEN rule = 'v2' THEN NOW() + (public.nodes_lot_days() || ' days')::INTERVAL
    ELSE 'infinity'::TIMESTAMPTZ
  END;

  IF clears_deadline THEN
    UPDATE public.profiles
       SET nodes_expire_at    = NULL,
           nodes_frozen_until = NULL
     WHERE id = user_id_input;
  END IF;

  INSERT INTO public.plan_node_lots
    (user_id, nodes_initial, nodes_remaining, rule_version, expires_at, source_kind, source_id)
  VALUES
    (user_id_input, amount, amount, rule, lot_expires, kind_input, source_id_input);

  new_balance := public.recompute_plan_credits(user_id_input);

  RETURN json_build_object(
    'success', TRUE, 'applied', TRUE, 'granted', amount,
    'balance', new_balance, 'rule_version', rule
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_plan_nodes(uuid, integer, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_plan_nodes(uuid, integer, text, text, text, text) TO service_role;

-- ── 9. start_nodes_grace — ramifica por regime ────────────────
--
-- v1 segue exatamente como era: nodes_expire_at = fim + 90 dias, saldo
-- GASTÁVEL. v2 congela: nodes_frozen_until = fim + 30 dias.
--
-- Uma conta pode ter os dois, e então os dois efeitos valem ao mesmo
-- tempo — é justamente o caso de quem veio do Starter para um plano novo.

CREATE OR REPLACE FUNCTION public.start_nodes_grace(
  user_id_input UUID,
  grace_until   TIMESTAMPTZ,
  freeze_until  TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_credits INTEGER;
  current_expiry  TIMESTAMPTZ;
  effective_until TIMESTAMPTZ;
  has_v2          BOOLEAN;
  effective_freeze TIMESTAMPTZ;
  new_balance     INTEGER;
BEGIN
  IF grace_until IS NULL THEN
    RAISE EXCEPTION 'grace_until is required' USING ERRCODE = '22023';
  END IF;

  SELECT credits, nodes_expire_at INTO current_credits, current_expiry
    FROM public.profiles WHERE id = user_id_input FOR UPDATE;

  IF current_credits IS NULL THEN
    RAISE EXCEPTION 'User not found: %', user_id_input USING ERRCODE = 'P0002';
  END IF;

  effective_until := LEAST(COALESCE(current_expiry, grace_until), grace_until);

  SELECT EXISTS (
    SELECT 1 FROM public.plan_node_lots
     WHERE user_id = user_id_input AND status = 'active'
       AND rule_version = 'v2' AND expires_at > NOW()
  ) INTO has_v2;

  -- Congela só se houver lote v2. Sem isso, uma conta 100% v1 ganharia
  -- uma marca de congelamento que não governa nada.
  effective_freeze := CASE
    WHEN has_v2 THEN COALESCE(freeze_until, NOW() + (public.nodes_freeze_days() || ' days')::INTERVAL)
    ELSE NULL
  END;

  UPDATE public.profiles
     SET plan                   = 'free',
         stripe_subscription_id = NULL,
         nodes_expire_at        = effective_until,
         nodes_frozen_until     = effective_freeze
   WHERE id = user_id_input;

  new_balance := public.recompute_plan_credits(user_id_input);

  RETURN json_build_object(
    'success',            TRUE,
    'balance',            new_balance,
    'nodes_expire_at',    effective_until,
    'nodes_frozen_until', effective_freeze,
    'froze_v2',           has_v2
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_nodes_grace(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.start_nodes_grace(uuid, timestamptz, timestamptz) TO service_role;

-- ── 10. expire_plan_nodes_for_user — agora por lote ───────────
--
-- Marca como 'expired' tudo que morreu: lotes v2 vencidos, lotes v2 cujo
-- prazo de congelamento passou, e lotes v1 de conta com nodes_expire_at
-- vencido. Registra UM movimento no livro-razão com o total.

CREATE OR REPLACE FUNCTION public.expire_plan_nodes_for_user(
  user_id_input UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  expired_amount INTEGER := 0;
  p_expire TIMESTAMPTZ;
  p_frozen TIMESTAMPTZ;
BEGIN
  SELECT nodes_expire_at, nodes_frozen_until INTO p_expire, p_frozen
    FROM public.profiles WHERE id = user_id_input;

  WITH dead AS (
    UPDATE public.plan_node_lots l
       SET status = 'expired'
     WHERE l.user_id = user_id_input
       AND l.status = 'active'
       AND l.nodes_remaining > 0
       AND (
         -- v2: venceu sozinho, OU o prazo de reativação passou.
         (l.rule_version = 'v2' AND (
            l.expires_at <= NOW()
            OR (p_frozen IS NOT NULL AND p_frozen <= NOW())
         ))
         -- v1: a janela da conta venceu.
         OR (l.rule_version = 'v1' AND p_expire IS NOT NULL AND p_expire <= NOW())
       )
     RETURNING l.nodes_remaining
  )
  SELECT COALESCE(SUM(nodes_remaining), 0)::INTEGER INTO expired_amount FROM dead;

  IF expired_amount > 0 THEN
    INSERT INTO public.node_ledger (user_id, delta, kind, source, balance_after)
    VALUES (user_id_input, -expired_amount, 'expiry', 'grace_period',
            public.recompute_plan_credits(user_id_input));
  END IF;

  RETURN expired_amount;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_plan_nodes_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_plan_nodes_for_user(uuid) TO service_role;

-- ── 11. expire_stale_plan_nodes — varredura do cron ───────────

CREATE OR REPLACE FUNCTION public.expire_stale_plan_nodes(
  batch_limit INTEGER DEFAULT 500
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  victim RECORD;
  users_touched INTEGER := 0;
  nodes_expired INTEGER := 0;
  got INTEGER;
BEGIN
  FOR victim IN
    SELECT DISTINCT p.id
      FROM public.profiles p
      JOIN public.plan_node_lots l ON l.user_id = p.id AND l.status = 'active'
     WHERE l.nodes_remaining > 0
       AND (
         (l.rule_version = 'v2' AND l.expires_at <= NOW())
         OR (l.rule_version = 'v2' AND p.nodes_frozen_until IS NOT NULL AND p.nodes_frozen_until <= NOW())
         OR (l.rule_version = 'v1' AND p.nodes_expire_at IS NOT NULL AND p.nodes_expire_at <= NOW())
       )
     LIMIT batch_limit
  LOOP
    PERFORM 1 FROM public.profiles WHERE id = victim.id FOR UPDATE;
    got := public.expire_plan_nodes_for_user(victim.id);
    IF got > 0 THEN
      users_touched := users_touched + 1;
      nodes_expired := nodes_expired + got;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'success', TRUE, 'users_touched', users_touched, 'nodes_expired', nodes_expired
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_plan_nodes(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_stale_plan_nodes(integer) TO service_role;

-- ── 12. consume_nodes_v2 — FIFO por lote, depois extras ───────
--
-- Cascata: lotes mensais utilizáveis, do vencimento mais próximo para o
-- mais distante, e só então os extras. Extras NÃO congelam e NÃO vencem —
-- decisão do dono: é bem comprado à parte.

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
  remaining_to_debit     INTEGER := amount;
  debit_from_plan        INTEGER := 0;
  debit_from_lumens      INTEGER := 0;
  lot_record             RECORD;
  lumen_record           RECORD;
  plan_available         INTEGER;
  total_lumens_available INTEGER;
  p_expire TIMESTAMPTZ;
  p_frozen TIMESTAMPTZ;
BEGIN
  IF amount IS NULL OR amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: %', amount USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = user_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', user_id_input USING ERRCODE = 'P0002';
  END IF;

  -- Expira o que morreu ANTES de contar (checagem preguiçosa: garante a
  -- regra mesmo se o cron não rodar).
  PERFORM public.expire_plan_nodes_for_user(user_id_input);

  SELECT nodes_expire_at, nodes_frozen_until INTO p_expire, p_frozen
    FROM public.profiles WHERE id = user_id_input;

  SELECT COALESCE(SUM(l.nodes_remaining), 0)::INTEGER INTO plan_available
    FROM public.plan_node_lots l
   WHERE l.user_id = user_id_input AND l.status = 'active'
     AND public.plan_lot_is_usable(l.rule_version, l.expires_at, p_expire, p_frozen);

  SELECT COALESCE(SUM(nodes_remaining), 0) INTO total_lumens_available
    FROM public.lumen_packs
   WHERE user_id = user_id_input AND status = 'active' AND expires_at > NOW();

  IF (plan_available + total_lumens_available) < amount THEN
    RAISE EXCEPTION
      'Insufficient nodes: % requested, % available (% plan + % lumens)',
      amount, plan_available + total_lumens_available, plan_available, total_lumens_available
      USING ERRCODE = 'P0001';
  END IF;

  -- 1) Lotes mensais, vencimento mais próximo primeiro.
  FOR lot_record IN
    SELECT l.id, l.nodes_remaining
      FROM public.plan_node_lots l
     WHERE l.user_id = user_id_input AND l.status = 'active'
       AND public.plan_lot_is_usable(l.rule_version, l.expires_at, p_expire, p_frozen)
     ORDER BY l.expires_at ASC, l.granted_at ASC
       FOR UPDATE
  LOOP
    EXIT WHEN remaining_to_debit = 0;

    IF lot_record.nodes_remaining >= remaining_to_debit THEN
      UPDATE public.plan_node_lots
         SET nodes_remaining = nodes_remaining - remaining_to_debit,
             status = CASE WHEN nodes_remaining - remaining_to_debit = 0 THEN 'depleted' ELSE status END
       WHERE id = lot_record.id;
      debit_from_plan    := debit_from_plan + remaining_to_debit;
      remaining_to_debit := 0;
    ELSE
      UPDATE public.plan_node_lots
         SET nodes_remaining = 0, status = 'depleted'
       WHERE id = lot_record.id;
      debit_from_plan    := debit_from_plan + lot_record.nodes_remaining;
      remaining_to_debit := remaining_to_debit - lot_record.nodes_remaining;
    END IF;
  END LOOP;

  -- 2) Extras, na ordem de compra.
  IF remaining_to_debit > 0 THEN
    FOR lumen_record IN
      SELECT id, nodes_remaining FROM public.lumen_packs
       WHERE user_id = user_id_input AND status = 'active' AND expires_at > NOW()
       ORDER BY expires_at ASC, purchased_at ASC
         FOR UPDATE
    LOOP
      EXIT WHEN remaining_to_debit = 0;

      IF lumen_record.nodes_remaining >= remaining_to_debit THEN
        UPDATE public.lumen_packs
           SET nodes_remaining = nodes_remaining - remaining_to_debit,
               status = CASE WHEN nodes_remaining - remaining_to_debit = 0 THEN 'depleted' ELSE status END
         WHERE id = lumen_record.id;
        debit_from_lumens  := debit_from_lumens + remaining_to_debit;
        remaining_to_debit := 0;
      ELSE
        UPDATE public.lumen_packs
           SET nodes_remaining = 0, status = 'depleted'
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
    'plan_balance_after', public.recompute_plan_credits(user_id_input)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_nodes_v2(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_nodes_v2(uuid, integer) TO service_role;

-- ── 13. user_node_balance — expõe o congelado ─────────────────
--
-- plan_balance é o que dá para gastar. frozen_balance é o que existe mas
-- está congelado — a tela precisa mostrar os dois, porque os Termos
-- prometem que o saldo congelado continua VISÍVEL.

CREATE OR REPLACE VIEW public.user_node_balance
WITH (security_invoker = on)
AS
SELECT
  p.id AS user_id,
  COALESCE(SUM(l.nodes_remaining) FILTER (
    WHERE l.status = 'active'
      AND public.plan_lot_is_usable(l.rule_version, l.expires_at, p.nodes_expire_at, p.nodes_frozen_until)
  ), 0)::INTEGER AS plan_balance,
  COALESCE(SUM(l.nodes_remaining) FILTER (
    WHERE l.status = 'active' AND l.rule_version = 'v2'
      AND l.expires_at > NOW() AND p.nodes_frozen_until IS NOT NULL
  ), 0)::INTEGER AS frozen_balance,
  COALESCE(lp.lumen_balance, 0)::INTEGER AS lumen_balance,
  (COALESCE(SUM(l.nodes_remaining) FILTER (
    WHERE l.status = 'active'
      AND public.plan_lot_is_usable(l.rule_version, l.expires_at, p.nodes_expire_at, p.nodes_frozen_until)
  ), 0) + COALESCE(lp.lumen_balance, 0))::INTEGER AS total_balance,
  COALESCE(lp.active_packs, 0)::BIGINT AS active_lumen_packs,
  p.nodes_expire_at    AS plan_nodes_expire_at,
  p.nodes_frozen_until AS plan_nodes_frozen_until,
  -- Vencimento do próximo lote v2 a morrer — o que a tela deve anunciar.
  MIN(l.expires_at) FILTER (
    WHERE l.status = 'active' AND l.rule_version = 'v2' AND l.expires_at > NOW()
  ) AS next_lot_expires_at
FROM public.profiles p
LEFT JOIN public.plan_node_lots l ON l.user_id = p.id
LEFT JOIN LATERAL (
  SELECT SUM(nodes_remaining) AS lumen_balance,
         COUNT(*) AS active_packs
    FROM public.lumen_packs
   WHERE user_id = p.id AND status = 'active' AND expires_at > NOW()
) lp ON TRUE
GROUP BY p.id, p.nodes_expire_at, p.nodes_frozen_until, lp.lumen_balance, lp.active_packs;

GRANT SELECT ON public.user_node_balance TO authenticated;
