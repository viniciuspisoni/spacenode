-- Blocos 3D — tier 'premium' (Meshy v5 multi-image via fal) no CHECK de quality.
--
-- ⚠️ ADITIVA. Só recria o CHECK constraint com o valor novo; valores antigos
-- ('draft','standard','high') continuam válidos pro histórico.
--
-- Catálogo 2026-07-17 (decisão do fundador após testes reais):
--   standard = Tripo v2.5 HD · high = Rodin · premium = Meshy v5 (via fal,
--   sem assinatura — multiview nativo + todos os formatos). O tier 'draft'
--   (Trellis) saiu do catálogo; o valor fica aceito pra linhas históricas.
--
-- ROLLBACK:
--   ALTER TABLE public.blocos3d_jobs DROP CONSTRAINT blocos3d_jobs_quality_check;
--   ALTER TABLE public.blocos3d_jobs ADD CONSTRAINT blocos3d_jobs_quality_check
--     CHECK (quality IN ('draft','standard','high'));

ALTER TABLE public.blocos3d_jobs
  DROP CONSTRAINT IF EXISTS blocos3d_jobs_quality_check;

ALTER TABLE public.blocos3d_jobs
  ADD CONSTRAINT blocos3d_jobs_quality_check
  CHECK (quality IN ('draft','standard','high','premium'));
