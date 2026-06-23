-- ─────────────────────────────────────────────────────────────
-- Spaces Preserve V2 — provenance source→generated + preservação
--
-- Aditivo e seguro de re-aplicar (ADD COLUMN IF NOT EXISTS). Todas as colunas
-- são nullable/defaulted: o caminho com a flag DESLIGADA não escreve nelas e
-- continua funcionando idêntico. A flag NEXT_PUBLIC_SPACES_PRESERVE_V2 só deve
-- ser ligada DEPOIS desta migration estar aplicada.
--
-- Princípio: a imagem upada é a autoridade do projeto. Cada vista gerada passa
-- a registrar de qual source veio (url/dimensões/hash/aspect), em que modo e
-- nível de preservação foi gerada, qual provider/model produziu, e o resultado
-- da checagem de preservação.
-- ─────────────────────────────────────────────────────────────

-- ── Provenance da imagem-fonte (Vista Mestre) ────────────────
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS source_image_url     text;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS source_width         integer;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS source_height        integer;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS source_aspect_ratio  numeric;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS source_hash          text;

-- ── Dimensões/aspecto da imagem gerada ───────────────────────
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS generated_width      integer;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS generated_height     integer;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS aspect_ratio         text;

-- ── Intenção / preservação ───────────────────────────────────
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS spaces_mode          text;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS preservation_level   text;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS provider             text;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS model                text;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS preservation_warning boolean NOT NULL DEFAULT false;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS preservation_check   jsonb;

-- ── Constraints brandos (permitem NULL = caminho legado) ─────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vistas_preservation_level_check'
  ) THEN
    ALTER TABLE public.vistas ADD CONSTRAINT vistas_preservation_level_check
      CHECK (preservation_level IS NULL OR preservation_level IN
        ('STRICT_SOURCE_LOCK','ARCHITECTURAL_DNA_LOCK','CONTROLLED_EXPLORATION'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vistas_spaces_mode_check'
  ) THEN
    ALTER TABLE public.vistas ADD CONSTRAINT vistas_spaces_mode_check
      CHECK (spaces_mode IS NULL OR spaces_mode IN
        ('luz','clima','material','detalhe','cena','camera'));
  END IF;
END $$;

-- Índice pra auditoria de warnings de preservação.
CREATE INDEX IF NOT EXISTS idx_vistas_preservation_warning
  ON public.vistas(space_id) WHERE preservation_warning = true;
