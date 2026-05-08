-- ─────────────────────────────────────────────────────────────
-- Lock down ops/audit tables (RLS deny-all)
--
-- Supabase advisor flagged duas tabelas com RLS desligado e expostas
-- pra anon/authenticated:
--
--   1. pre_pricing_v2_balance_snapshot — snapshot one-shot dos saldos
--      antes da migração ×5 do Pricing v2. Vaza (user_id, saldo_antigo).
--   2. migration_audits — guard de idempotência de migrations one-shot.
--
-- Nenhuma das duas é lida por código de app (cliente ou server). Quem
-- escreve nelas:
--   - migration_audits → as próprias migrations, que rodam como `postgres`
--     (superuser bypassa RLS).
--   - pre_pricing_v2_balance_snapshot → idem, foi populada uma vez
--     durante o deploy de Pricing v2.
--
-- Estratégia: ENABLE ROW LEVEL SECURITY sem policies. Bloqueia tudo
-- de anon/authenticated. service_role e postgres bypassam por design,
-- então admin code e migrations futuras seguem funcionando.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.pre_pricing_v2_balance_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_audits                ENABLE ROW LEVEL SECURITY;
