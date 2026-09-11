-- Editar — alarga dois CHECKs de `edit_v3_jobs` (aprovado pelo fundador 2026-09-10).
--
-- ⚠️ ADITIVA E NÃO-DESTRUTIVA. Só relaxa dois CHECKs existentes; nenhuma coluna
-- é criada, alterada ou removida, e nenhuma linha é tocada. Alargar um CHECK
-- não pode rejeitar dado que já está lá.
--
-- POR QUE
--
-- 1. `provider`: a tabela nasceu no mundo Google-first e só aceitava
--    'google'/'fal'. Desde 2026-09-10 o Editar roda no Seedream 5.0 Pro pela
--    ModelArk (EDIT_V3_ENGINE=seedream + EDIT_V3_SEEDREAM_ROUTE=ark) porque o
--    projeto Google está com billing desativado. O pipeline grava
--    provider='ark' — que o CHECK rejeitava. Como lib/edit-v3/persist.ts é
--    best-effort, a edição SAÍA CERTA para o usuário mas o job ficava preso em
--    'processing' sem result_image_url, e a aba Edições do Histórico (que lê
--    status='completed') não a mostrava. É o mesmo sintoma que a #107 corrigiu.
--
-- 2. `action_type`: o Editar V4 acrescenta a ação 'replace_object' (substituir
--    um objeto por outro, com referência) às quatro do brief original.
--
-- ROLLBACK (só passa se ainda não houver linha com os valores novos):
--   ALTER TABLE public.edit_v3_jobs DROP CONSTRAINT edit_v3_jobs_provider_check;
--   ALTER TABLE public.edit_v3_jobs ADD CONSTRAINT edit_v3_jobs_provider_check
--     CHECK (provider IS NULL OR provider IN ('google','fal'));
--   ALTER TABLE public.edit_v3_jobs DROP CONSTRAINT edit_v3_jobs_action_type_check;
--   ALTER TABLE public.edit_v3_jobs ADD CONSTRAINT edit_v3_jobs_action_type_check
--     CHECK (action_type IN ('remove','swap_material','insert_element','refine_area'));

ALTER TABLE public.edit_v3_jobs
  DROP CONSTRAINT IF EXISTS edit_v3_jobs_provider_check;
ALTER TABLE public.edit_v3_jobs
  ADD CONSTRAINT edit_v3_jobs_provider_check
  CHECK (provider IS NULL OR provider IN ('google', 'fal', 'ark'));

ALTER TABLE public.edit_v3_jobs
  DROP CONSTRAINT IF EXISTS edit_v3_jobs_action_type_check;
ALTER TABLE public.edit_v3_jobs
  ADD CONSTRAINT edit_v3_jobs_action_type_check
  CHECK (action_type IN ('remove', 'swap_material', 'insert_element', 'refine_area', 'replace_object'));
