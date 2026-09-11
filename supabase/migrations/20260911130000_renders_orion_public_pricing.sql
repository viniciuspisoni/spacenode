-- ─────────────────────────────────────────────────────────────
-- Orion · vira motor público, cobrando nodes (2026-09-11)
--
-- Migration ADITIVA. APLICADA EM PRODUÇÃO em 2026-09-11, via Management API
-- (POST /v1/projects/{ref}/database/query). Nunca `supabase db push` neste
-- repo: ele aplicaria as migrations que estão paradas de propósito.
--
-- Pré-requisito: 20260910120000 (coluna is_internal_test, engine aceita
-- 'orion', renders_nodes_charged_rule) já está em produção. A 20260911120000
-- (4K no piloto) foi aplicada logo antes; esta é estritamente mais permissiva
-- e cobriria 2K+4K de qualquer forma.
--
-- O que muda: `renders_orion_internal_only` (que EXIGIA is_internal_test=true
-- e nodes_charged=0 em toda linha 'orion') dá lugar a uma regra só de
-- resolução. Orion passa a se comportar como os motores públicos:
-- nodes_charged > 0 vindo de `renders_nodes_charged_rule` (que continua
-- valendo, intocada) e is_internal_test=false por padrão.
--
-- A coluna `is_internal_test` e o isolamento das views de equipe
-- (workspace_generations/workspace_member_usage) NÃO são removidos — ficam
-- disponíveis pra uma futura rota de QA interna gratuita, hoje sem uso.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.renders
  DROP CONSTRAINT IF EXISTS renders_orion_internal_only;

ALTER TABLE public.renders
  ADD CONSTRAINT renders_orion_valid_resolution
  CHECK (engine <> 'orion' OR resolution IN ('2k', '4k'));
