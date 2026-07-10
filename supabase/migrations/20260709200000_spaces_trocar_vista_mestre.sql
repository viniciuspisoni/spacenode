-- Trocar Vista Mestre (2026-07-09)
--
-- Promover uma vista (com DNA extraído via multi-DNA) a Vista Mestre do Space:
-- vista_mestre_url + dna do Space passam a apontar pra vista promovida. A
-- mestre anterior NUNCA é perdida — vai pro histórico (ethos Preserve V2).
--
-- Colunas aditivas:
--   vista_mestre_history   append-only; cada entrada guarda url/dna/origem da
--                          mestre substituída + quando/por qual vista
--   vista_mestre_vista_id  vista atualmente promovida (NULL = mestre original
--                          do upload/render); dedupe no seletor de referência

ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS vista_mestre_history  jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS vista_mestre_vista_id uuid REFERENCES public.vistas(id) ON DELETE SET NULL;
