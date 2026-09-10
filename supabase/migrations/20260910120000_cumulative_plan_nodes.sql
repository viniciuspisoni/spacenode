-- ─────────────────────────────────────────────────────────────
-- Nodes mensais passam a ACUMULAR (2026-09-10)
--
-- Até aqui a renovação SOBRESCREVIA o saldo: `credits = plano.nodes`.
-- Quem não usava tudo perdia a diferença na virada do ciclo. A regra
-- nova é a que o produto anuncia agora:
--
--   • Nodes mensais não expiram enquanto a assinatura estiver ativa.
--   • Cada renovação SOMA os nodes do plano ao saldo existente.
--   • No cancelamento o saldo NÃO é zerado: fica disponível por mais
--     30 dias (profiles.nodes_expire_at) e só então expira.
--
-- O consumo por ferramenta não muda em nada — consume_nodes_v2 segue
-- debitando mensais primeiro e extras (lumen_packs) depois.
--
-- O que esta migration cria:
--   1. profiles.nodes_expire_at — prazo de expiração do saldo mensal
--      (NULL = não expira; é o estado de quem tem assinatura ativa).
--   2. Índice único no node_ledger por (kind, stripe_event_id) — é ele
--      que torna o grant IDEMPOTENTE. Somar não é idempotente por
--      natureza, e o Stripe reentrega webhooks: sem essa trava, uma
--      reentrega creditaria o mês duas vezes.
--   3. grant_plan_nodes — soma nodes ao saldo, idempotente pela chave
--      do Stripe (subscription id na ativação, invoice id na renovação).
--   4. start_nodes_grace — cancelamento: preserva o saldo e agenda a
--      expiração para 30 dias depois do fim da assinatura.
--   5. expire_plan_nodes_for_user / expire_stale_plan_nodes — a
--      expiração em si, preguiçosa (no consumo/grant) e em lote (cron).
--   6. consume_nodes_v2 — expira o saldo vencido ANTES de debitar.
--   7. user_node_balance — não exibe saldo vencido e passa a expor
--      nodes_expire_at.
--
-- A expiração é aplicada nos DOIS caminhos de propósito: o cron
-- (/api/cron/expire-nodes) mantém o banco limpo, mas a checagem
-- preguiçosa garante a regra mesmo se o cron falhar ou não rodar —
-- é a mesma postura defensiva do resto do billing aqui.
-- ─────────────────────────────────────────────────────────────

-- ── 1. profiles.nodes_expire_at ───────────────────────────────
--
-- NULL = saldo mensal sem prazo (assinante ativo, conta gratuita com
-- os nodes de cadastro). Data no futuro = janela de cortesia pós
-- cancelamento. Data no passado = saldo a expirar na próxima leitura.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nodes_expire_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.nodes_expire_at IS
  'Quando o saldo de Nodes mensais (credits) expira. NULL = não expira '
  '(assinatura ativa). Preenchido no cancelamento com fim da assinatura + 30 dias.';

-- Índice parcial pro cron de expiração — só as linhas com prazo.
CREATE INDEX IF NOT EXISTS idx_profiles_nodes_expire_at
  ON public.profiles (nodes_expire_at)
  WHERE nodes_expire_at IS NOT NULL;

-- A coluna é escrita só por funções SECURITY DEFINER e pelo service_role.
-- O lockdown de colunas de profiles (20260703120000) já restringe o UPDATE
-- do usuário a um conjunto fixo de colunas, então nada a fazer aqui.

-- ── 2. Idempotência do grant no node_ledger ───────────────────
--
-- O índice existente (uq_node_ledger_kind_job) cobre movimentos ligados a
-- um JOB. Grants de assinatura não têm job — a chave deles é o objeto do
-- Stripe. Índice parcial próprio, para não colidir com o outro.

CREATE UNIQUE INDEX IF NOT EXISTS uq_node_ledger_kind_stripe_event
  ON public.node_ledger (kind, stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- ── 3. expire_plan_nodes_for_user ─────────────────────────────
--
-- Zera o saldo mensal vencido de UM usuário e registra a expiração no
-- livro-razão. Pressupõe que o caller já segura o lock da linha
-- (SELECT ... FOR UPDATE) — todas as chamadas abaixo seguram.
--
-- `nodes_expire_at` NÃO volta a NULL depois de expirar, de propósito: o
-- prazo continua valendo para qualquer node que apareça na conta depois
-- dele. O caso real é o refund de uma geração que falhou já fora da
-- janela — sem a marca, esses nodes voltariam SEM prazo nenhum e a conta
-- cancelada ficaria com saldo eterno. Quem limpa a marca é o próximo
-- grant (reassinou = saldo sem prazo de novo).
--
-- Como o zero fica gravado, reexecutar é barato e não gera linha nova no
-- livro-razão — o filtro `credits > 0` nas varreduras mantém a coisa
-- convergindo em vez de reprocessar as mesmas contas todo dia.

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
BEGIN
  SELECT credits INTO expired_amount
    FROM public.profiles
   WHERE id = user_id_input
     AND nodes_expire_at IS NOT NULL
     AND nodes_expire_at <= NOW()
     AND credits > 0;

  -- Sem prazo vencido (ou já zerado): nada a fazer.
  IF expired_amount IS NULL OR expired_amount <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.profiles
     SET credits = 0
   WHERE id = user_id_input;

  INSERT INTO public.node_ledger (user_id, delta, kind, source, balance_after)
  VALUES (user_id_input, -expired_amount, 'expiry', 'grace_period', 0);

  RETURN expired_amount;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_plan_nodes_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_plan_nodes_for_user(uuid) TO service_role;

-- ── 4. grant_plan_nodes — soma idempotente ────────────────────
--
-- `source_id_input` é a chave de idempotência e vem do Stripe:
--   • ativação  → subscription id. Os DOIS caminhos de ativação
--     (checkout.session.completed e invoice.paid/subscription_create)
--     carregam o mesmo subscription id, então a corrida entre eles
--     credita uma vez só.
--   • renovação → invoice id (um por ciclo).
--   • upgrade   → invoice id da fatura de proporcional.
--
-- Sem `source_id_input` a soma é aplicada direto (uso administrativo).
--
-- Retorna JSON com `applied` — FALSE quando o movimento já tinha sido
-- registrado. O webhook usa isso para não contar a mesma venda duas
-- vezes no funil.

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
  expired_amount  INTEGER := 0;
  ledger_id       UUID;
  new_balance     INTEGER;
BEGIN
  IF amount IS NULL OR amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: %', amount
      USING ERRCODE = '22023';
  END IF;

  IF kind_input NOT IN ('grant_plan', 'grant_renewal', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid grant kind: %', kind_input
      USING ERRCODE = '22023';
  END IF;

  -- Lock da linha: a soma é read-modify-write e duas entregas do Stripe
  -- podem chegar ao mesmo tempo.
  SELECT credits INTO current_credits
    FROM public.profiles
   WHERE id = user_id_input
     FOR UPDATE;

  IF current_credits IS NULL THEN
    RAISE EXCEPTION 'User not found: %', user_id_input
      USING ERRCODE = 'P0002';
  END IF;

  -- Saldo de uma assinatura anterior que já venceu não ressuscita quando
  -- o usuário volta: expira primeiro, o novo grant entra por cima do zero.
  expired_amount  := public.expire_plan_nodes_for_user(user_id_input);
  current_credits := current_credits - expired_amount;

  -- Trava de idempotência: o INSERT é a reserva do movimento. Se já existe
  -- linha com essa chave, o grant é uma reentrega do Stripe e sai sem somar.
  IF source_id_input IS NOT NULL THEN
    INSERT INTO public.node_ledger (user_id, delta, kind, source, stripe_event_id)
    VALUES (user_id_input, amount, kind_input, source_input, source_id_input)
    ON CONFLICT DO NOTHING
    RETURNING id INTO ledger_id;

    IF ledger_id IS NULL THEN
      RETURN json_build_object(
        'success',  TRUE,
        'applied',  FALSE,
        'granted',  0,
        'expired',  expired_amount,
        'balance',  current_credits
      );
    END IF;
  ELSE
    INSERT INTO public.node_ledger (user_id, delta, kind, source)
    VALUES (user_id_input, amount, kind_input, source_input)
    RETURNING id INTO ledger_id;
  END IF;

  new_balance := current_credits + amount;

  UPDATE public.profiles
     SET credits         = new_balance,
         plan            = COALESCE(plan_name, plan),
         -- Assinatura ativa de novo: o saldo volta a não ter prazo.
         nodes_expire_at = NULL
   WHERE id = user_id_input;

  UPDATE public.node_ledger
     SET balance_after = new_balance
   WHERE id = ledger_id;

  RETURN json_build_object(
    'success',  TRUE,
    'applied',  TRUE,
    'granted',  amount,
    'expired',  expired_amount,
    'balance',  new_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_plan_nodes(uuid, integer, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_plan_nodes(uuid, integer, text, text, text, text) TO service_role;

-- ── 5. start_nodes_grace — cancelamento sem confisco ──────────
--
-- Substitui o `credits = 0` que o webhook aplicava em
-- customer.subscription.deleted. O plano volta a 'free' (perde os
-- benefícios do plano na hora, como sempre foi), mas os nodes já
-- adquiridos continuam gastáveis até `grace_until`.
--
-- Idempotente: reentrega do mesmo evento não empurra o prazo pra frente
-- (mantém o menor prazo já registrado) nem mexe no saldo.

CREATE OR REPLACE FUNCTION public.start_nodes_grace(
  user_id_input UUID,
  grace_until   TIMESTAMPTZ
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
BEGIN
  IF grace_until IS NULL THEN
    RAISE EXCEPTION 'grace_until is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT credits, nodes_expire_at
    INTO current_credits, current_expiry
    FROM public.profiles
   WHERE id = user_id_input
     FOR UPDATE;

  IF current_credits IS NULL THEN
    RAISE EXCEPTION 'User not found: %', user_id_input
      USING ERRCODE = 'P0002';
  END IF;

  effective_until := LEAST(COALESCE(current_expiry, grace_until), grace_until);

  UPDATE public.profiles
     SET plan                   = 'free',
         stripe_subscription_id = NULL,
         nodes_expire_at        = effective_until
   WHERE id = user_id_input;

  RETURN json_build_object(
    'success',         TRUE,
    'balance',         current_credits,
    'nodes_expire_at', effective_until
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_nodes_grace(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.start_nodes_grace(uuid, timestamptz) TO service_role;

-- ── 6. expire_stale_plan_nodes — varredura do cron ────────────
--
-- Zera em lote os saldos cujo prazo venceu. A checagem preguiçosa em
-- consume_nodes_v2/grant_plan_nodes já garante a regra; esta função
-- existe para que o banco reflita a verdade mesmo em contas paradas
-- (o saldo exibido não depende de o usuário tentar gerar algo).

CREATE OR REPLACE FUNCTION public.expire_stale_plan_nodes(
  batch_limit INTEGER DEFAULT 1000
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  profile_row     RECORD;
  users_expired   INTEGER := 0;
  nodes_expired   INTEGER := 0;
  amount          INTEGER;
BEGIN
  -- `credits > 0` é o que faz a varredura CONVERGIR: uma conta já zerada sai
  -- do conjunto e não volta todo dia. Ela reaparece se algum node voltar pra
  -- lá depois do prazo (refund de geração que falhou), que é justamente o
  -- caso em que a expiração precisa rodar de novo.
  --
  -- Teto por execução: mantém a transação (e os locks) curtos. O que sobrar
  -- entra na varredura do dia seguinte — e a checagem preguiçosa já cobre
  -- qualquer conta que tente gastar nesse meio-tempo.
  FOR profile_row IN
    SELECT id
      FROM public.profiles
     WHERE nodes_expire_at IS NOT NULL
       AND nodes_expire_at <= NOW()
       AND credits > 0
     ORDER BY nodes_expire_at ASC
     LIMIT GREATEST(COALESCE(batch_limit, 1000), 1)
       FOR UPDATE
  LOOP
    amount := public.expire_plan_nodes_for_user(profile_row.id);
    users_expired := users_expired + 1;
    nodes_expired := nodes_expired + COALESCE(amount, 0);
  END LOOP;

  RETURN json_build_object(
    'success',       TRUE,
    'users_expired', users_expired,
    'nodes_expired', nodes_expired
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_plan_nodes(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_stale_plan_nodes(integer) TO service_role;

-- ── 7. consume_nodes_v2 — expira antes de debitar ─────────────
--
-- Idêntica à versão de 20260831190000, com UMA adição: o saldo mensal
-- vencido é zerado antes de entrar na conta. A cascata (mensais →
-- extras FIFO por ordem de compra) e o custo por ferramenta seguem
-- exatamente os mesmos.

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

  -- Janela de cortesia vencida: o saldo mensal não existe mais. Sem isto,
  -- um saldo pós-cancelamento seguiria gastável indefinidamente.
  --
  -- Atenção ao alcance disto: se o débito abaixo levantar P0001 (saldo
  -- insuficiente), o RAISE desfaz TAMBÉM esta expiração — a função inteira é
  -- uma transação. Ou seja, o zero só fica gravado quando o consumo dá certo.
  -- Não é furo na regra: a tentativa foi recusada, e a view já esconde o saldo
  -- vencido de quem olha a tela. Quem grava o zero nas contas paradas é o cron
  -- (expire_stale_plan_nodes), e é por isso que ele existe além desta checagem.
  plan_credits := plan_credits - public.expire_plan_nodes_for_user(user_id_input);

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

-- ── 8. user_node_balance — não exibe saldo vencido ────────────
--
-- A view é só leitura: não pode zerar a coluna, então ESCONDE o saldo
-- vencido. Quem grava o zero é a expiração (cron ou preguiçosa). Assim
-- a tela nunca mostra nodes que a geração recusaria.

CREATE OR REPLACE VIEW public.user_node_balance
WITH (security_invoker = on)
AS
SELECT
  p.id                                                                       AS user_id,
  CASE
    WHEN p.nodes_expire_at IS NOT NULL AND p.nodes_expire_at <= NOW() THEN 0
    ELSE p.credits
  END                                                                        AS plan_balance,
  COALESCE(SUM(lp.nodes_remaining), 0)::INTEGER                              AS lumen_balance,
  (CASE
     WHEN p.nodes_expire_at IS NOT NULL AND p.nodes_expire_at <= NOW() THEN 0
     ELSE p.credits
   END + COALESCE(SUM(lp.nodes_remaining), 0))::INTEGER                      AS total_balance,
  COUNT(lp.id) FILTER (WHERE lp.status = 'active' AND lp.expires_at > NOW()) AS active_lumen_packs,
  -- Prazo da janela de cortesia pós-cancelamento (NULL = saldo sem prazo).
  p.nodes_expire_at                                                          AS plan_nodes_expire_at
FROM public.profiles p
LEFT JOIN public.lumen_packs lp
  ON lp.user_id = p.id
 AND lp.status     = 'active'
 AND lp.expires_at > NOW()
GROUP BY p.id, p.credits, p.nodes_expire_at;

GRANT SELECT ON public.user_node_balance TO authenticated;
