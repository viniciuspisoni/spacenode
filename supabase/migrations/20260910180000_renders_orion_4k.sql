-- ─────────────────────────────────────────────────────────────
-- Orion · libera 4K no piloto interno (2026-09-10)
--
-- A migration 20260910120000 travou o piloto em 2K porque era a única
-- resolução medida na época. O 4K foi medido depois: 3840×1504 pedido e
-- entregue, 41,5 s, US$ 0,0697 (contra 2048×800 / 29,5 s / US$ 0,0414) — 3,5×
-- os pixels por 1,68× o custo, sem perda de fidelidade.
--
-- 3840 é o TETO por lado da Image API da OpenAI: o piloto não alcança os
-- 4096 px do "4K" de Vega/Pulsar. É 4K UHD, não o 4K dos motores públicos.
--
-- Muda SÓ a lista de resoluções aceitas para 'orion'. O resto da regra
-- continua: teste interno obrigatório e zero nodes. Motores públicos intocados.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.renders
  DROP CONSTRAINT IF EXISTS renders_orion_internal_only;

ALTER TABLE public.renders
  ADD CONSTRAINT renders_orion_internal_only
  CHECK (
    engine <> 'orion'
    OR (is_internal_test AND nodes_charged = 0 AND resolution IN ('2k', '4k'))
  );
