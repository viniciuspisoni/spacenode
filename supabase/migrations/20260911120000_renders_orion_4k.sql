-- ─────────────────────────────────────────────────────────────
-- Orion · habilita 4K no piloto interno (2026-09-11)
--
-- Migration ADITIVA. NÃO aplicada em produção nesta tarefa — a migration
-- 20260910120000 já está em produção e criou `renders_orion_internal_only`
-- exigindo resolution = '2k' pra toda linha 'orion'. Sem este ajuste, gerar
-- em 4K entrega a imagem mas o INSERT do histórico falha na CHECK.
--
-- 4K aqui é 4K UHD (3840 px no lado maior — teto real da Image API da
-- OpenAI), não os 4096 px do rótulo "4K" de Vega/Pulsar. A coluna
-- `resolution` já aceita '4k' desde 20260507000000; só a regra do piloto
-- Orion estava mais restritiva que o resto da tabela.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.renders
  DROP CONSTRAINT IF EXISTS renders_orion_internal_only;

ALTER TABLE public.renders
  ADD CONSTRAINT renders_orion_internal_only
  CHECK (
    engine <> 'orion'
    OR (is_internal_test AND nodes_charged = 0 AND resolution IN ('2k', '4k'))
  );
