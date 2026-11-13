-- Regra de créditos v2 (lotes + congelamento) — verificação contra um
-- Postgres de verdade.
--
-- COMO RODAR (banco com o schema e a migration 20260919094200 aplicados —
-- um branch do Supabase ou o projeto spacenode-dev):
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plan_node_lots.test.sql
--
-- Tudo roda em UMA transação que termina em ROLLBACK: nada persiste.
--
-- IMPORTANTE: a migration deixa nodes_v2_from() em 'infinity' de propósito
-- (regra v2 desligada em produção). Para testar o regime v2 o arquivo
-- SOBRESCREVE essa função dentro da transação — e o ROLLBACK devolve o
-- 'infinity'. Nenhum lote v2 nasce em produção por causa deste teste.

\set ON_ERROR_STOP on

BEGIN;

CREATE FUNCTION pg_temp.assert_eq(got anyelement, want anyelement, label text)
RETURNS VOID LANGUAGE plpgsql AS $ASSERT$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FALHOU [%]: obtido=%, esperado=%', label, got, want;
  END IF;
END;
$ASSERT$;

CREATE FUNCTION pg_temp.assert_true(got boolean, label text)
RETURNS VOID LANGUAGE plpgsql AS $ASSERT$
BEGIN
  IF got IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU [%]: esperado TRUE, obtido %', label, got;
  END IF;
END;
$ASSERT$;

-- Liga a regra v2 só dentro desta transação.
CREATE OR REPLACE FUNCTION public.nodes_v2_from()
RETURNS TIMESTAMPTZ LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT '-infinity'::TIMESTAMPTZ $$;

-- ── Fixtures ──────────────────────────────────────────────────
-- profiles exige uma linha em auth.users; criamos as duas pontas.

CREATE FUNCTION pg_temp.mk_user(tag text) RETURNS UUID
LANGUAGE plpgsql AS $MK$
DECLARE uid UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role)
  VALUES (uid, 'v2-' || tag || '-' || uid || '@test.local',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.profiles (id, email, credits, plan)
  VALUES (uid, 'v2-' || tag || '-' || uid || '@test.local', 0, 'free')
  ON CONFLICT (id) DO UPDATE SET credits = 0;
  RETURN uid;
END;
$MK$;

DO $TESTS$
DECLARE
  u UUID;
  r JSON;
  got INTEGER;
  lots INTEGER;
  frozen INTEGER;
  nearest TIMESTAMPTZ;
BEGIN
  -- ── 1. Grant v2 cria lote com validade de 90 dias ───────────
  u := pg_temp.mk_user('lot');
  r := public.grant_plan_nodes(u, 800, 'essence', 'grant_plan', 'sub_t1');
  PERFORM pg_temp.assert_eq((r->>'rule_version')::TEXT, 'v2', '1: grant essence nasce v2');
  PERFORM pg_temp.assert_eq((r->>'balance')::INTEGER, 800, '1: saldo 800');

  SELECT COUNT(*)::INTEGER INTO lots FROM public.plan_node_lots WHERE user_id = u;
  PERFORM pg_temp.assert_eq(lots, 1, '1: um lote');

  SELECT expires_at INTO nearest FROM public.plan_node_lots WHERE user_id = u;
  PERFORM pg_temp.assert_true(
    nearest BETWEEN NOW() + INTERVAL '89 days' AND NOW() + INTERVAL '91 days',
    '1: vence em ~90 dias');

  -- ── 2. Dois grants = dois lotes; credits == soma ────────────
  r := public.grant_plan_nodes(u, 800, 'essence', 'grant_renewal', 'inv_t2');
  SELECT COUNT(*)::INTEGER INTO lots FROM public.plan_node_lots WHERE user_id = u;
  PERFORM pg_temp.assert_eq(lots, 2, '2: dois lotes');
  SELECT credits INTO got FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(got, 1600, '2: credits = soma dos lotes');

  -- ── 3. Consumo debita o vencimento mais próximo ─────────────
  -- Envelhece o primeiro lote para 10 dias de validade restante.
  UPDATE public.plan_node_lots SET expires_at = NOW() + INTERVAL '10 days'
   WHERE user_id = u AND source_id = 'sub_t1';

  r := public.consume_nodes_v2(u, 300);
  PERFORM pg_temp.assert_eq((r->>'from_plan')::INTEGER, 300, '3: saiu do plano');
  SELECT nodes_remaining INTO got FROM public.plan_node_lots
   WHERE user_id = u AND source_id = 'sub_t1';
  PERFORM pg_temp.assert_eq(got, 500, '3: debitou o lote que vence antes');
  SELECT nodes_remaining INTO got FROM public.plan_node_lots
   WHERE user_id = u AND source_id = 'inv_t2';
  PERFORM pg_temp.assert_eq(got, 800, '3: lote distante intacto');

  -- ── 4. Consumo atravessa lotes ──────────────────────────────
  r := public.consume_nodes_v2(u, 600);
  SELECT status INTO got FROM (SELECT CASE WHEN status = 'depleted' THEN 1 ELSE 0 END AS status
    FROM public.plan_node_lots WHERE user_id = u AND source_id = 'sub_t1') s;
  PERFORM pg_temp.assert_eq(got, 1, '4: lote proximo esgotou');
  SELECT nodes_remaining INTO got FROM public.plan_node_lots
   WHERE user_id = u AND source_id = 'inv_t2';
  PERFORM pg_temp.assert_eq(got, 700, '4: sobra saiu do lote seguinte');

  -- ── 5. Lote vencido nao conta e e varrido ───────────────────
  u := pg_temp.mk_user('exp');
  PERFORM public.grant_plan_nodes(u, 500, 'pro', 'grant_plan', 'sub_t5');
  UPDATE public.plan_node_lots SET expires_at = NOW() - INTERVAL '1 day' WHERE user_id = u;

  SELECT plan_balance INTO got FROM public.user_node_balance WHERE user_id = u;
  PERFORM pg_temp.assert_eq(got, 0, '5: view esconde lote vencido');

  got := public.expire_plan_nodes_for_user(u);
  PERFORM pg_temp.assert_eq(got, 500, '5: varredura expirou 500');
  SELECT credits INTO got FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(got, 0, '5: credits zerado');

  -- ── 6. Cancelamento v2 congela ──────────────────────────────
  u := pg_temp.mk_user('freeze');
  PERFORM public.grant_plan_nodes(u, 1800, 'pro', 'grant_plan', 'sub_t6');
  r := public.start_nodes_grace(u, NOW() + INTERVAL '90 days');
  PERFORM pg_temp.assert_true((r->>'froze_v2')::BOOLEAN, '6: congelou');

  SELECT credits INTO got FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(got, 0, '6: saldo gastavel zera ao congelar');
  SELECT frozen_balance INTO frozen FROM public.user_node_balance WHERE user_id = u;
  PERFORM pg_temp.assert_eq(frozen, 1800, '6: congelado segue VISIVEL');

  BEGIN
    PERFORM public.consume_nodes_v2(u, 10);
    RAISE EXCEPTION 'FALHOU [6]: consumo deveria ter sido recusado';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    NULL; -- esperado
  END;

  -- ── 7. Extras seguem gastaveis com mensais congelados ───────
  INSERT INTO public.lumen_packs
    (user_id, pack_size, nodes_initial, nodes_remaining, status, expires_at)
  VALUES (u, 500, 500, 500, 'active', 'infinity'::TIMESTAMPTZ);

  r := public.consume_nodes_v2(u, 100);
  PERFORM pg_temp.assert_eq((r->>'from_lumens')::INTEGER, 100, '7: extra gastou');
  PERFORM pg_temp.assert_eq((r->>'from_plan')::INTEGER, 0, '7: mensal nao gastou');
  SELECT frozen_balance INTO frozen FROM public.user_node_balance WHERE user_id = u;
  PERFORM pg_temp.assert_eq(frozen, 1800, '7: congelado intacto');

  -- ── 8. Reativar libera so o que ainda vale ──────────────────
  u := pg_temp.mk_user('thaw');
  PERFORM public.grant_plan_nodes(u, 500, 'pro', 'grant_plan', 'sub_t8a');
  PERFORM public.grant_plan_nodes(u, 700, 'pro', 'grant_renewal', 'inv_t8b');
  -- O primeiro lote morre durante o congelamento.
  UPDATE public.plan_node_lots SET expires_at = NOW() - INTERVAL '1 hour'
   WHERE user_id = u AND source_id = 'sub_t8a';
  PERFORM public.start_nodes_grace(u, NOW() + INTERVAL '90 days');

  r := public.grant_plan_nodes(u, 0 + 1800, 'pro', 'grant_plan', 'sub_t8c');
  SELECT nodes_frozen_until INTO nearest FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(nearest, NULL::TIMESTAMPTZ, '8: descongelou');
  -- 700 que sobreviveram + 1800 do novo ciclo; os 500 vencidos NAO voltam.
  SELECT credits INTO got FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(got, 2500, '8: volta so o que nao venceu');

  -- ── 9. Passado o prazo, o congelado morre ───────────────────
  u := pg_temp.mk_user('dead');
  PERFORM public.grant_plan_nodes(u, 400, 'studio', 'grant_plan', 'sub_t9');
  PERFORM public.start_nodes_grace(u, NOW() + INTERVAL '90 days', NOW() - INTERVAL '1 day');
  got := public.expire_plan_nodes_for_user(u);
  PERFORM pg_temp.assert_eq(got, 400, '9: congelado vencido expirou');
  SELECT frozen_balance INTO frozen FROM public.user_node_balance WHERE user_id = u;
  PERFORM pg_temp.assert_eq(frozen, 0, '9: nada congelado sobra');

  -- ── 10. v1 (Starter) mantem 90 dias GASTAVEIS ───────────────
  u := pg_temp.mk_user('legacy');
  r := public.grant_plan_nodes(u, 750, 'starter', 'grant_plan', 'sub_t10');
  PERFORM pg_temp.assert_eq((r->>'rule_version')::TEXT, 'v1', '10: starter nasce v1');

  r := public.start_nodes_grace(u, NOW() + INTERVAL '90 days');
  PERFORM pg_temp.assert_eq((r->>'froze_v2')::BOOLEAN, FALSE, '10: conta v1 nao congela');
  SELECT credits INTO got FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(got, 750, '10: saldo v1 segue GASTAVEL apos cancelar');

  r := public.consume_nodes_v2(u, 50);
  PERFORM pg_temp.assert_eq((r->>'from_plan')::INTEGER, 50, '10: v1 cancelado ainda gasta');

  -- ── 11. v1 e v2 na MESMA conta ──────────────────────────────
  u := pg_temp.mk_user('mix');
  PERFORM public.grant_plan_nodes(u, 750, 'starter', 'grant_plan', 'sub_t11a');
  PERFORM public.grant_plan_nodes(u, 1800, 'pro',     'grant_renewal', 'inv_t11b');
  SELECT COUNT(*)::INTEGER INTO lots FROM public.plan_node_lots
   WHERE user_id = u AND rule_version = 'v1';
  PERFORM pg_temp.assert_eq(lots, 1, '11: um lote v1');
  SELECT COUNT(*)::INTEGER INTO lots FROM public.plan_node_lots
   WHERE user_id = u AND rule_version = 'v2';
  PERFORM pg_temp.assert_eq(lots, 1, '11: um lote v2');

  PERFORM public.start_nodes_grace(u, NOW() + INTERVAL '90 days');
  -- v2 congela, v1 continua gastavel: sobra exatamente o saldo v1.
  SELECT credits INTO got FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(got, 750, '11: so o v1 sobrevive ao cancelamento');
  SELECT frozen_balance INTO frozen FROM public.user_node_balance WHERE user_id = u;
  PERFORM pg_temp.assert_eq(frozen, 1800, '11: o v2 ficou congelado');

  -- ── 12. Idempotencia: mesma chave do Stripe = um lote ───────
  u := pg_temp.mk_user('idem');
  PERFORM public.grant_plan_nodes(u, 800, 'essence', 'grant_renewal', 'inv_dup');
  r := public.grant_plan_nodes(u, 800, 'essence', 'grant_renewal', 'inv_dup');
  PERFORM pg_temp.assert_eq((r->>'applied')::BOOLEAN, FALSE, '12: reentrega nao aplica');
  SELECT COUNT(*)::INTEGER INTO lots FROM public.plan_node_lots WHERE user_id = u;
  PERFORM pg_temp.assert_eq(lots, 1, '12: um lote so');
  SELECT credits INTO got FROM public.profiles WHERE id = u;
  PERFORM pg_temp.assert_eq(got, 800, '12: creditou uma vez');

  -- ── 13. Invariante: credits == soma dos lotes utilizaveis ───
  SELECT COUNT(*)::INTEGER INTO got
    FROM public.profiles p
   WHERE p.credits IS DISTINCT FROM (
     SELECT COALESCE(SUM(l.nodes_remaining), 0)::INTEGER
       FROM public.plan_node_lots l
      WHERE l.user_id = p.id AND l.status = 'active'
        AND public.plan_lot_is_usable(l.rule_version, l.expires_at,
                                      p.nodes_expire_at, p.nodes_frozen_until)
   )
     AND EXISTS (SELECT 1 FROM public.plan_node_lots WHERE user_id = p.id);
  PERFORM pg_temp.assert_eq(got, 0, '13: credits bate com os lotes em TODA conta');

  RAISE NOTICE 'TODOS OS TESTES PASSARAM';
END;
$TESTS$;

ROLLBACK;
