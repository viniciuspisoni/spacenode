-- Regras de Nodes acumulativos — verificação contra um Postgres de verdade.
--
-- COMO RODAR (contra um banco que já tem o schema e a migration
-- 20260910120000_cumulative_plan_nodes.sql aplicados — um branch do Supabase,
-- por exemplo):
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cumulative_plan_nodes.test.sql
--
-- O arquivo inteiro roda dentro de UMA transação que termina em ROLLBACK: os
-- perfis de teste, os movimentos no livro-razão e qualquer expiração que a
-- varredura tenha feito somem no fim. Nada persiste. Ainda assim, prefira um
-- branch/staging — a varredura em lote toca linhas de outras contas dentro da
-- transação antes de desfazer tudo.
--
-- Qualquer regra quebrada vira ERROR e, com ON_ERROR_STOP, derruba a execução.
-- É o teste que o vitest não consegue fazer: as regras de acúmulo,
-- idempotência e expiração moram em plpgsql, não em TypeScript.
-- (tests/nodes-rollover.test.ts cobre o lado TypeScript: prazo e proporcional.)

\set ON_ERROR_STOP on

BEGIN;

CREATE FUNCTION pg_temp.assert_eq(got anyelement, want anyelement, label text)
RETURNS VOID LANGUAGE plpgsql AS $ASSERT$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FALHOU [%]: obtido=%, esperado=%', label, got, want;
  END IF;
  RAISE NOTICE '  ok · % (%)', label, got;
END; $ASSERT$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; bal INTEGER;
BEGIN
  RAISE NOTICE '── 1. Renovação SOMA em vez de sobrescrever ──';
  INSERT INTO public.profiles (email, credits, plan) VALUES ('acumula@nodes-test.invalid', 0, 'free')
    RETURNING id INTO u;

  -- Ativação: Pro (1800)
  PERFORM public.grant_plan_nodes(u, 1800, 'pro', 'grant_plan', 'sub_A');
  SELECT credits INTO bal FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 1800, 'ativação credita 1800');

  -- Gastou 300 no mês
  UPDATE public.profiles SET credits = credits - 300 WHERE id = u;

  -- Renovação: sobra 1500 + 1800 do plano = 3300 (ANTES seria 1800)
  PERFORM public.grant_plan_nodes(u, 1800, 'pro', 'grant_renewal', 'in_1');
  SELECT credits INTO bal FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 3300, 'renovação soma ao saldo restante');

  -- Segundo ciclo, sem gastar nada
  PERFORM public.grant_plan_nodes(u, 1800, 'pro', 'grant_renewal', 'in_2');
  SELECT credits INTO bal FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 5100, 'segundo ciclo acumula de novo');
  PERFORM pg_temp.assert_eq((SELECT nodes_expire_at FROM public.profiles WHERE id = u), NULL::timestamptz,
                    'assinante ativo não tem prazo de expiração');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; bal INTEGER; res JSON;
BEGIN
  RAISE NOTICE '── 2. Reentrega do Stripe não credita duas vezes ──';
  INSERT INTO public.profiles (email, credits, plan) VALUES ('idem@nodes-test.invalid', 0, 'free')
    RETURNING id INTO u;

  PERFORM public.grant_plan_nodes(u, 750, 'starter', 'grant_plan', 'sub_B');
  -- Mesma assinatura chegando pelo OUTRO caminho (invoice.paid/subscription_create)
  res := public.grant_plan_nodes(u, 750, 'starter', 'grant_plan', 'sub_B');
  PERFORM pg_temp.assert_eq((res->>'applied')::boolean, FALSE, 'segundo sinal da mesma assinatura é no-op');

  SELECT credits INTO bal FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 750, 'saldo não dobrou');

  -- Renovação reentregue 3× (Stripe retenta em 500)
  PERFORM public.grant_plan_nodes(u, 750, 'starter', 'grant_renewal', 'in_X');
  PERFORM public.grant_plan_nodes(u, 750, 'starter', 'grant_renewal', 'in_X');
  PERFORM public.grant_plan_nodes(u, 750, 'starter', 'grant_renewal', 'in_X');
  SELECT credits INTO bal FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 1500, 'renovação reentregue credita uma vez só');
  PERFORM pg_temp.assert_eq((SELECT count(*)::int FROM public.node_ledger WHERE user_id = u), 2,
                    'livro-razão tem 2 movimentos, não 5');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; bal INTEGER; exp TIMESTAMPTZ;
BEGIN
  RAISE NOTICE '── 3. Cancelamento preserva o saldo por 90 dias ──';
  INSERT INTO public.profiles (email, credits, plan, stripe_subscription_id)
    VALUES ('cancela@nodes-test.invalid', 0, 'free', NULL) RETURNING id INTO u;
  PERFORM public.grant_plan_nodes(u, 3500, 'studio', 'grant_plan', 'sub_C');

  PERFORM public.start_nodes_grace(u, NOW() + INTERVAL '90 days');
  SELECT credits, nodes_expire_at INTO bal, exp FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 3500, 'cancelamento NÃO zera o saldo');
  PERFORM pg_temp.assert_eq((SELECT plan FROM public.profiles WHERE id = u), 'free', 'plano volta pra free');
  PERFORM pg_temp.assert_eq(exp > NOW() + INTERVAL '89 days', TRUE, 'prazo de 90 dias gravado');

  -- Dentro da janela ainda dá pra gastar
  PERFORM public.consume_nodes_v2(u, 500);
  SELECT credits INTO bal FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 3000, 'consumo funciona dentro da janela');

  -- Reentrega do subscription.deleted não empurra o prazo pra frente
  PERFORM public.start_nodes_grace(u, NOW() + INTERVAL '90 days');
  PERFORM pg_temp.assert_eq((SELECT nodes_expire_at FROM public.profiles WHERE id = u), exp,
                    'reentrega do cancelamento mantém o prazo original');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; bal INTEGER; res JSON;
BEGIN
  RAISE NOTICE '── 4. Passados os 90 dias, o saldo expira ──';
  INSERT INTO public.profiles (email, credits, plan) VALUES ('expira@nodes-test.invalid', 0, 'free')
    RETURNING id INTO u;
  PERFORM public.grant_plan_nodes(u, 1800, 'pro', 'grant_plan', 'sub_D');
  -- Cancelou faz 31 dias
  PERFORM public.start_nodes_grace(u, NOW() - INTERVAL '1 day');

  -- A view não mostra saldo vencido...
  PERFORM pg_temp.assert_eq((SELECT plan_balance FROM public.user_node_balance WHERE user_id = u), 0,
                    'view esconde saldo vencido');

  -- ...e o consumo recusa (P0001 = saldo insuficiente)
  BEGIN
    PERFORM public.consume_nodes_v2(u, 10);
    RAISE EXCEPTION 'FALHOU: consumo deveria recusar saldo vencido';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    RAISE NOTICE '  ok · consumo recusa saldo vencido';
  END;

  -- O RAISE do saldo insuficiente desfaz a transação inteira, inclusive a
  -- expiração que a função tinha acabado de fazer. A regra segue valendo (o
  -- gasto foi recusado e a view esconde o saldo); quem grava o zero é o cron.
  SELECT credits INTO bal FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 1800, 'consumo recusado não grava o zero (rollback do RAISE)');

  PERFORM public.expire_stale_plan_nodes();
  SELECT credits INTO bal FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 0, 'cron grava o zero');
  PERFORM pg_temp.assert_eq((SELECT count(*)::int FROM public.node_ledger WHERE user_id = u AND kind = 'expiry'), 1,
                    'expiração registrada no livro-razão');

  -- Reassinar depois do prazo começa do zero + o novo plano
  res := public.grant_plan_nodes(u, 1800, 'pro', 'grant_plan', 'sub_D2');
  PERFORM pg_temp.assert_eq((res->>'balance')::int, 1800, 'reassinou depois do prazo: saldo é só o novo plano');
  PERFORM pg_temp.assert_eq((SELECT nodes_expire_at FROM public.profiles WHERE id = u), NULL::timestamptz,
                    'reassinatura limpa o prazo');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; res JSON;
BEGIN
  RAISE NOTICE '── 5. Reassinar DENTRO da janela preserva o acumulado ──';
  INSERT INTO public.profiles (email, credits, plan) VALUES ('volta@nodes-test.invalid', 0, 'free')
    RETURNING id INTO u;
  PERFORM public.grant_plan_nodes(u, 1800, 'pro', 'grant_plan', 'sub_E');
  PERFORM public.start_nodes_grace(u, NOW() + INTERVAL '60 days');

  res := public.grant_plan_nodes(u, 1800, 'pro', 'grant_plan', 'sub_E2');
  PERFORM pg_temp.assert_eq((res->>'balance')::int, 3600, 'saldo antigo + novo plano');
  PERFORM pg_temp.assert_eq((SELECT nodes_expire_at FROM public.profiles WHERE id = u), NULL::timestamptz,
                    'prazo removido');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; exp1 TIMESTAMPTZ; exp2 TIMESTAMPTZ;
BEGIN
  RAISE NOTICE '── 5b. Cancelar de novo abre uma janela NOVA ──';
  INSERT INTO public.profiles (email, credits, plan) VALUES ('ciclo@nodes-test.invalid', 0, 'free')
    RETURNING id INTO u;

  -- 1º ciclo: assina, cancela.
  PERFORM public.grant_plan_nodes(u, 1000, 'pro', 'grant_plan', 'sub_F1');
  PERFORM public.start_nodes_grace(u, NOW() + INTERVAL '90 days');
  SELECT nodes_expire_at INTO exp1 FROM public.profiles WHERE id = u;

  -- Reassina dentro da janela: saldo preservado, expiração cancelada.
  PERFORM public.grant_plan_nodes(u, 1000, 'pro', 'grant_plan', 'sub_F2');
  PERFORM pg_temp.assert_eq((SELECT credits FROM public.profiles WHERE id = u), 2000,
                    'reassinatura preserva o acumulado integralmente');
  PERFORM pg_temp.assert_eq((SELECT nodes_expire_at FROM public.profiles WHERE id = u), NULL::timestamptz,
                    'expiração cancelada pela reassinatura');

  -- Cancela a assinatura NOVA 40 dias depois: janela nova, contada do novo fim.
  PERFORM public.start_nodes_grace(u, NOW() + INTERVAL '40 days' + INTERVAL '90 days');
  SELECT nodes_expire_at INTO exp2 FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(exp2 > exp1, TRUE,
                    'a 2ª janela vai além da 1ª (não ficou presa ao vencimento antigo)');
  PERFORM pg_temp.assert_eq(exp2 > NOW() + INTERVAL '129 days', TRUE,
                    'a 2ª janela tem 90 dias cheios a partir do novo encerramento');
  PERFORM pg_temp.assert_eq((SELECT credits FROM public.profiles WHERE id = u), 2000,
                    'e o saldo segue intacto no segundo cancelamento');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; exp1 TIMESTAMPTZ;
BEGIN
  RAISE NOTICE '── 5c. Invariante: assinatura ativa ⇒ saldo sem prazo ──';
  INSERT INTO public.profiles (email, credits, plan) VALUES ('invariante@nodes-test.invalid', 0, 'free')
    RETURNING id INTO u;
  PERFORM public.grant_plan_nodes(u, 500, 'pro', 'grant_plan', 'sub_G1');
  PERFORM public.start_nodes_grace(u, NOW() + INTERVAL '90 days');

  -- Grant REENTREGUE (mesma chave): não soma, mas ainda assim tem de cancelar
  -- a expiração — senão a conta volta a ser assinante com prazo de morte.
  PERFORM public.grant_plan_nodes(u, 500, 'pro', 'grant_plan', 'sub_G1');
  PERFORM pg_temp.assert_eq((SELECT credits FROM public.profiles WHERE id = u), 500,
                    'reentrega não soma');
  PERFORM pg_temp.assert_eq((SELECT nodes_expire_at FROM public.profiles WHERE id = u), NULL::timestamptz,
                    'reentrega ainda assim cancela a expiração');

  -- Ajuste manual do suporte NÃO é prova de assinatura: herda o prazo vigente.
  PERFORM public.start_nodes_grace(u, NOW() + INTERVAL '90 days');
  SELECT nodes_expire_at INTO exp1 FROM public.profiles WHERE id = u;
  PERFORM public.grant_plan_nodes(u, 50, NULL, 'adjustment', 'ticket_123');
  PERFORM pg_temp.assert_eq((SELECT credits FROM public.profiles WHERE id = u), 550,
                    'ajuste manual soma');
  PERFORM pg_temp.assert_eq((SELECT nodes_expire_at FROM public.profiles WHERE id = u), exp1,
                    'ajuste manual NÃO torna eterno o saldo de conta cancelada');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; bal INTEGER;
BEGIN
  RAISE NOTICE '── 6. Upgrade/downgrade não resetam o saldo ──';
  INSERT INTO public.profiles (email, credits, plan) VALUES ('troca@nodes-test.invalid', 0, 'free')
    RETURNING id INTO u;
  PERFORM public.grant_plan_nodes(u, 750, 'starter', 'grant_plan', 'sub_F');
  UPDATE public.profiles SET credits = credits - 100 WHERE id = u;  -- gastou 100

  -- Upgrade p/ Pro no meio do ciclo: proporcional (40% de 1800 = 720)
  PERFORM public.grant_plan_nodes(u, 720, 'pro', 'grant_renewal', 'in_upg');
  SELECT credits INTO bal FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 1370, 'upgrade soma o proporcional ao saldo (650 + 720)');
  PERFORM pg_temp.assert_eq((SELECT plan FROM public.profiles WHERE id = u), 'pro', 'plano atualizado');

  -- Downgrade p/ Starter: o webhook só troca o plano, sem tocar em credits
  UPDATE public.profiles SET plan = 'starter' WHERE id = u;
  SELECT credits INTO bal FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 1370, 'downgrade não confisca o saldo acumulado');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; bal INTEGER; res JSON;
BEGIN
  RAISE NOTICE '── 7. Cascata mensais → extras segue intacta ──';
  INSERT INTO public.profiles (email, credits, plan) VALUES ('cascata@nodes-test.invalid', 0, 'free')
    RETURNING id INTO u;
  PERFORM public.grant_plan_nodes(u, 100, 'starter', 'grant_plan', 'sub_G');
  INSERT INTO public.lumen_packs (user_id, pack_size, nodes_initial, nodes_remaining, expires_at)
    VALUES (u, 500, 500, 500, 'infinity');

  res := public.consume_nodes_v2(u, 250);
  PERFORM pg_temp.assert_eq((res->>'from_plan')::int,   100, 'debita os 100 mensais primeiro');
  PERFORM pg_temp.assert_eq((res->>'from_lumens')::int, 150, 'o resto sai dos extras');
  SELECT credits INTO bal FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(bal, 0, 'mensais zerados');
  PERFORM pg_temp.assert_eq((SELECT nodes_remaining FROM public.lumen_packs WHERE user_id = u), 350,
                    'pack extra debitado corretamente');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; extras INTEGER;
BEGIN
  RAISE NOTICE '── 8. Nodes EXTRAS nunca expiram, nem com a janela vencida ──';
  INSERT INTO public.profiles (email, credits, plan) VALUES ('extras@nodes-test.invalid', 0, 'free')
    RETURNING id INTO u;
  PERFORM public.grant_plan_nodes(u, 500, 'pro', 'grant_plan', 'sub_H');
  INSERT INTO public.lumen_packs (user_id, pack_size, nodes_initial, nodes_remaining, expires_at)
    VALUES (u, 1500, 1500, 1500, 'infinity');
  PERFORM public.start_nodes_grace(u, NOW() - INTERVAL '1 day');

  PERFORM public.expire_stale_plan_nodes();
  PERFORM pg_temp.assert_eq((SELECT credits FROM public.profiles WHERE id = u), 0, 'mensais expirados');
  SELECT lumen_balance INTO extras FROM public.user_node_balance WHERE user_id = u;
  PERFORM pg_temp.assert_eq(extras, 1500, 'extras intactos');
  PERFORM pg_temp.assert_eq((SELECT total_balance FROM public.user_node_balance WHERE user_id = u), 1500,
                    'total = só os extras');

  -- E ainda dá pra gastar os extras
  PERFORM public.consume_nodes_v2(u, 100);
  PERFORM pg_temp.assert_eq((SELECT nodes_remaining FROM public.lumen_packs WHERE user_id = u), 1400,
                    'extras seguem gastáveis depois da expiração dos mensais');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; res JSON;
BEGIN
  RAISE NOTICE '── 9. Cron: varredura em lote e convergência ──';
  INSERT INTO public.profiles (email, credits, plan) VALUES ('cron@nodes-test.invalid', 0, 'free')
    RETURNING id INTO u;
  PERFORM public.grant_plan_nodes(u, 900, 'pro', 'grant_plan', 'sub_I');
  PERFORM public.start_nodes_grace(u, NOW() - INTERVAL '2 days');

  res := public.expire_stale_plan_nodes(1000);
  PERFORM pg_temp.assert_eq((SELECT credits FROM public.profiles WHERE id = u), 0, 'cron expirou esta conta');

  -- Segunda passada: a conta já zerada NÃO volta ao conjunto (credits = 0).
  -- Medido pelo livro-razão desta conta, não pelo total — num banco real pode
  -- haver outras contas vencidas na mesma varredura.
  PERFORM public.expire_stale_plan_nodes(1000);
  PERFORM pg_temp.assert_eq(
    (SELECT count(*)::int FROM public.node_ledger WHERE user_id = u AND kind = 'expiry'), 1,
    'varredura converge — não reprocessa quem já zerou');

  -- Refund pós-expiração: o prazo continua valendo, a varredura recolhe de novo
  PERFORM public.refund_nodes(u, 40);
  PERFORM pg_temp.assert_eq((SELECT credits FROM public.profiles WHERE id = u), 40, 'refund entrou');
  PERFORM public.expire_stale_plan_nodes(1000);
  PERFORM pg_temp.assert_eq((SELECT credits FROM public.profiles WHERE id = u), 0,
    'nodes que voltaram fora do prazo expiram também');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID;
BEGIN
  RAISE NOTICE '── 10. Conta gratuita: nodes de cadastro não expiram ──';
  INSERT INTO public.profiles (email) VALUES ('free@nodes-test.invalid') RETURNING id INTO u;
  PERFORM pg_temp.assert_eq((SELECT credits FROM public.profiles WHERE id = u), 80, '80 nodes de cadastro');
  PERFORM pg_temp.assert_eq((SELECT nodes_expire_at FROM public.profiles WHERE id = u), NULL::timestamptz,
                    'sem prazo — quem nunca assinou não entra em cortesia');
  PERFORM public.expire_stale_plan_nodes();
  PERFORM pg_temp.assert_eq((SELECT plan_balance FROM public.user_node_balance WHERE user_id = u), 80,
                    'cron não toca em conta gratuita');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID;
BEGIN
  RAISE NOTICE '── 11. Guardas de entrada ──';
  INSERT INTO public.profiles (email) VALUES ('guarda@nodes-test.invalid') RETURNING id INTO u;

  BEGIN
    PERFORM public.grant_plan_nodes(u, -50, 'pro', 'grant_plan', 'x');
    RAISE EXCEPTION 'FALHOU: grant negativo deveria ser recusado';
  EXCEPTION WHEN sqlstate '22023' THEN RAISE NOTICE '  ok · grant negativo recusado';
  END;

  BEGIN
    PERFORM public.grant_plan_nodes(u, 50, 'pro', 'debit', 'x');
    RAISE EXCEPTION 'FALHOU: kind inválido deveria ser recusado';
  EXCEPTION WHEN sqlstate '22023' THEN RAISE NOTICE '  ok · kind inválido recusado';
  END;

  BEGIN
    PERFORM public.grant_plan_nodes('00000000-0000-0000-0000-000000000000'::uuid, 50, 'pro', 'grant_plan', 'y');
    RAISE EXCEPTION 'FALHOU: usuário inexistente deveria ser recusado';
  EXCEPTION WHEN sqlstate 'P0002' THEN RAISE NOTICE '  ok · usuário inexistente recusado';
  END;
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE u UUID; res JSON;
BEGIN
  RAISE NOTICE '── 12. Grant sem chave de idempotência (uso administrativo) ──';
  INSERT INTO public.profiles (email, credits) VALUES ('admin@nodes-test.invalid', 0) RETURNING id INTO u;
  res := public.grant_plan_nodes(u, 100, NULL, 'adjustment', NULL);
  PERFORM pg_temp.assert_eq((res->>'applied')::boolean, TRUE, 'ajuste sem chave é aplicado');
  res := public.grant_plan_nodes(u, 100, NULL, 'adjustment', NULL);
  PERFORM pg_temp.assert_eq((SELECT credits FROM public.profiles WHERE id = u), 200,
                    'sem chave, cada chamada soma (é o esperado no ajuste manual)');
  PERFORM pg_temp.assert_eq((SELECT plan FROM public.profiles WHERE id = u), 'free',
                    'plan_name NULL não altera o plano');
END $$;

-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  ok BOOLEAN;
BEGIN
  RAISE NOTICE '── 13. Permissões: só service_role executa ──';
  FOR ok IN
    SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('grant_plan_nodes','start_nodes_grace','expire_stale_plan_nodes',
                         'expire_plan_nodes_for_user','consume_nodes_v2')
  LOOP
    PERFORM pg_temp.assert_eq(ok, FALSE, 'authenticated NÃO executa função de billing');
  END LOOP;

  FOR ok IN
    SELECT has_function_privilege('service_role', p.oid, 'EXECUTE')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('grant_plan_nodes','start_nodes_grace','expire_stale_plan_nodes',
                         'expire_plan_nodes_for_user','consume_nodes_v2')
  LOOP
    PERFORM pg_temp.assert_eq(ok, TRUE, 'service_role executa função de billing');
  END LOOP;
END $$;

SELECT '=== TODOS OS CENÁRIOS PASSARAM ===' AS resultado;

-- Nada do que foi criado acima sobrevive a esta linha.
ROLLBACK;
