-- ─────────────────────────────────────────────────────────────
-- Spaces Reference Flow — separação explícita das referências
--
-- Refatoração do fluxo de geração do Spaces em 3 etapas
-- (Referência → Ação → Gerar). Cada vista passa a registrar:
--
--   reference_kind     de onde veio a REFERÊNCIA GEOMÉTRICA da geração:
--                        'vista_mestre' — a mestre do Space (default histórico)
--                        'print'        — novo print enviado pelo usuário
--                        'vista'        — imagem do histórico do próprio Space
--   identity_image_url imagem usada como REFERÊNCIA DE IDENTIDADE VISUAL
--                        (Image #2) quando difere da geométrica. NULL quando a
--                        geração usou uma imagem só (geometria = identidade).
--   user_instruction   instrução livre do usuário (direção personalizada da
--                        Nova Vista, ou o pedido do Ajustar Materiais).
--
-- A URL da referência geométrica em si já é gravada em source_image_url
-- (Preserve V2) / source_sketch_url (prints, legado do eixo Ângulo), e a
-- referência do histórico em reference_vista_id (multi-DNA). Este migration é
-- aditivo e seguro de re-aplicar.
--
-- Também amplia o CHECK de vistas.axis com 'material' (ação Ajustar Materiais,
-- que estreia neste fluxo). O valor já era previsto em vistas.spaces_mode.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS reference_kind     text;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS identity_image_url text;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS user_instruction   text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vistas_reference_kind_check'
  ) THEN
    ALTER TABLE public.vistas ADD CONSTRAINT vistas_reference_kind_check
      CHECK (reference_kind IS NULL OR reference_kind IN ('vista_mestre','print','vista'));
  END IF;
END $$;

-- axis: constraint inline do CREATE TABLE (20260509000000_spaces_block_1) tem
-- o nome padrão vistas_axis_check. Recriada com o novo valor 'material'.
ALTER TABLE public.vistas DROP CONSTRAINT IF EXISTS vistas_axis_check;
ALTER TABLE public.vistas ADD CONSTRAINT vistas_axis_check
  CHECK (axis IN ('iluminacao','angulo','horario','detalhe','material'));
