-- ─────────────────────────────────────────────────────────────
-- Plano Essence (2026-09-12)
--
-- Novo plano público substituindo o Starter na vitrine (R$99/mês,
-- 800 nodes). O Starter vira legado: assinantes existentes continuam
-- pagando R$89 e recebendo 750 nodes normalmente (nada muda no
-- catálogo Stripe nem no id interno 'starter' — ver lib/plans.ts),
-- mas o plano some da vitrine de novas vendas.
--
-- Esta migration só amplia o CHECK de profiles.plan para aceitar o
-- novo valor 'essence'. É pequena, aditiva e reversível: basta rodar
-- de novo o DROP/ADD sem 'essence' para desfazer.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'starter', 'essence', 'pro', 'studio', 'office'));
