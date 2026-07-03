-- 20260703120000_rls_column_lockdown_profiles_vistas.sql
--
-- CR-1 da auditoria de segurança (docs/AUDITORIA-SEGURANCA-2026-07-03.md):
-- trava de COLUNA (column-level privilege) em public.profiles e public.vistas.
--
-- ── PROBLEMA (ANTES) ────────────────────────────────────────────────────────
-- As policies de UPDATE `users_update_own_profile` (profiles) e `vistas_update_own`
-- (vistas) restringem a LINHA (auth.uid() = id / user_id) mas NÃO as COLUNAS.
-- Como o papel `authenticated` tem UPDATE na tabela inteira, qualquer usuário
-- logado altera pelo PostgREST colunas sensíveis da PRÓPRIA linha:
--   profiles.credits / profiles.plan / profiles.stripe_*  → auto-concessão de saldo/plano
--   vistas.free_fixes_used / nodes_cost / review_status    → burla de cota grátis e de relatórios da Equipe
--
-- ── SOLUÇÃO (DEPOIS) ────────────────────────────────────────────────────────
-- REVOKE do UPDATE de tabela e GRANT apenas das colunas que o CLIENTE (browser,
-- papel `authenticated`) legitimamente edita hoje. As colunas sensíveis passam a
-- ser graváveis SÓ pelo service_role (webhook Stripe + RPCs consume/refund), que
-- IGNORA grants de coluna. A policy de RLS (escopo de LINHA) permanece intacta —
-- as duas camadas passam a valer juntas: LINHA (policy) E COLUNA (grant).
--
-- Colunas editadas pelo browser hoje (mapeado por grep no client em 2026-07-03):
--   profiles → theme_preference        (lib/theme/ThemeProvider.tsx)
--              project_materials        (app/app/generate/GenerateClient.tsx)
--              project_config           (app/app/generate/GenerateClient.tsx)
--   vistas   → is_favorited             (app/api/vistas/[vistaId]/favorite/route.ts)
--              dna_verified             (app/api/vistas/[vistaId]/verify-dna/route.ts)
--              dna_verification_details (app/api/vistas/[vistaId]/verify-dna/route.ts)
--   (favorite e verify-dna usam o client RLS `createClient`, por isso precisam do GRANT.)
--
-- NÃO afetado por esta migration:
--   • webhook Stripe e RPCs consume/refund → usam service_role (bypassam grants de coluna).
--   • renders → a RLS de renders NÃO tem policy de UPDATE (o browser já não consegue
--     alterar nenhuma coluna); todo UPDATE em renders é via service_role com .eq(user_id).
--     Nada a fazer aqui.
--   • demais escritas em vistas (status, nodes_cost, review_status, free_fixes_used,
--     image_url, dna_*, edit_*…) → 100% via service_role. Não precisam de grant.
--
-- ── PRÉ-REQUISITO ANTES DE APLICAR ──────────────────────────────────────────
-- Confirmar que as colunas do GRANT existem em produção (project_materials vem de
-- migration-materials.sql, já aplicada). Um GRANT em coluna inexistente falha.
-- Opcional (verificação do estado atual antes/depois):
--   SELECT grantee, privilege_type, column_name
--   FROM information_schema.column_privileges
--   WHERE table_name IN ('profiles','vistas') AND grantee = 'authenticated';
--
-- ── REVERSÃO ────────────────────────────────────────────────────────────────
--   GRANT UPDATE ON public.profiles TO authenticated;
--   GRANT UPDATE ON public.vistas   TO authenticated;
-- (restaura o UPDATE de tabela — estado anterior a esta migration.)

-- ── profiles ────────────────────────────────────────────────────────────────
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (theme_preference, project_materials, project_config)
  ON public.profiles TO authenticated;

-- ── vistas ──────────────────────────────────────────────────────────────────
REVOKE UPDATE ON public.vistas FROM authenticated;
GRANT  UPDATE (is_favorited, dna_verified, dna_verification_details)
  ON public.vistas TO authenticated;
