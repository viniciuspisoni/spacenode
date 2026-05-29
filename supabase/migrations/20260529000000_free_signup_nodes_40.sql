-- ─────────────────────────────────────────────────────────────
-- Free signup grant — 40 nodes
--
-- Novos cadastros ganham 40 nodes de teste. O grant é governado
-- pelo DEFAULT da coluna profiles.credits: handle_new_user() faz
-- INSERT sem informar `credits`, então a coluna assume o default.
--
-- O default já vale 40 em produção (ajustado via dashboard), mas
-- nunca foi versionado — um `db reset` o reverteria pro 12 legado
-- do supabase-schema.sql. Esta migration codifica o 40 para que
-- sobreviva a resets e ambientes novos. Idempotente: reaplicar é
-- seguro (apenas reafirma o default, não toca saldos existentes).
--
-- Alinha o backend com a copy da landing ("40 nodes grátis") e o
-- fallback DEFAULT_CREDITS em app/app/generate/page.tsx.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ALTER COLUMN credits SET DEFAULT 40;
