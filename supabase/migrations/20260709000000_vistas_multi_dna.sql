-- Multi-DNA por Space (2026-07-09)
--
-- Uma vista gerada pode ter DNA próprio extraído (mesma Vision stack e custo da
-- extração do Space) e virar "referência": nas próximas gerações o usuário
-- escolhe qual imagem é a autoridade de DNA + fonte — Vista Mestre (default,
-- comportamento histórico) ou qualquer vista-referência.
--
-- Colunas aditivas, sempre nullable/default — caminho legado não preenche nada.
--   dna                jsonb SpaceDnaPayload (visual + briefing), shape idêntico a spaces.dna
--   dna_extracted_at   quando a extração concluiu
--   dna_extracting     guard atômico contra double-submit do débito (AL-6)
--   reference_vista_id de qual referência esta vista foi gerada (NULL = Vista Mestre)

ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS dna                jsonb;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS dna_extracted_at   timestamptz;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS dna_extracting     boolean NOT NULL DEFAULT false;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS reference_vista_id uuid REFERENCES public.vistas(id) ON DELETE SET NULL;

-- Listagem das referências de um Space (vistas com DNA extraído).
CREATE INDEX IF NOT EXISTS idx_vistas_dna_refs ON public.vistas(space_id) WHERE dna IS NOT NULL;
