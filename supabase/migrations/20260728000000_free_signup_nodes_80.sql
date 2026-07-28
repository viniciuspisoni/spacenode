-- ─────────────────────────────────────────────────────────────
-- Free signup grant — 40 → 80 nodes
--
-- Novos cadastros passam a ganhar 80 nodes de teste. O grant é
-- governado pelo DEFAULT da coluna profiles.credits:
-- handle_new_user() faz INSERT sem informar `credits`, então a
-- coluna assume o default. Não mexer no corpo do trigger.
--
-- Só afeta linhas NOVAS: saldos de usuários existentes ficam
-- intactos. Idempotente: reaplicar apenas reafirma o default.
--
-- Manter em sincronia (não há fonte única):
--   1. este default / supabase-schema.sql
--   2. DEFAULT_CREDITS em app/app/generate/page.tsx (fallback de
--      criação de profile para usuário pré-existente)
--   3. copy "80 nodes grátis" na landing (Hero, Navbar, FinalCTA,
--      MobileCTA, SocialProof, PricingToggle, PlatformModules),
--      app/login/page.tsx e app/lp/[slug]/page.tsx
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ALTER COLUMN credits SET DEFAULT 80;
