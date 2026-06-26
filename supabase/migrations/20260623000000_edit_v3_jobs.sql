-- Editar V3 — tabela de jobs (persistência completa do brief do fundador).
--
-- ⚠️ ADITIVA E NÃO-DESTRUTIVA. Cria apenas a tabela nova `edit_v3_jobs` + RLS +
-- índice. NÃO altera nenhuma tabela existente. Aguarda APROVAÇÃO EXPLÍCITA do
-- fundador antes de ser aplicada (protocolo: baseline dump → diff → aprovação).
-- O código (lib/edit-v3/persist.ts) é RESILIENTE: a rota funciona com OU sem
-- esta tabela (telemetria best-effort).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.edit_v3_jobs;

CREATE TABLE IF NOT EXISTS public.edit_v3_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,

  -- Ação de produto (as 4 do brief).
  action_type        text NOT NULL CHECK (action_type IN ('remove','swap_material','insert_element','refine_area')),
  status             text NOT NULL DEFAULT 'processing'
                       CHECK (status IN ('processing','completed','failed','rejected')),

  -- Entradas (brief: salvar source, mask, prompt).
  source_image_url   text NOT NULL,
  mask_url           text,
  prompt             text,
  instruction        text,

  -- Motor (brief: salvar model, provider).
  provider           text CHECK (provider IS NULL OR provider IN ('google','fal')),
  model              text,
  request_id         text,

  -- Resultado (brief: salvar result).
  result_image_url   text,

  -- Cobrança (debitado SOMENTE no sucesso).
  nodes_cost         integer NOT NULL DEFAULT 0 CHECK (nodes_cost >= 0),
  charged            boolean NOT NULL DEFAULT false,

  -- Controles.
  quality_mode       text CHECK (quality_mode IS NULL OR quality_mode IN ('standard','high')),
  preservation_mode  text CHECK (preservation_mode IS NULL OR preservation_mode IN ('maximum','standard')),
  intensity_mode     text CHECK (intensity_mode IS NULL OR intensity_mode IN ('subtle','standard','strong')),
  reference_count    integer NOT NULL DEFAULT 0,

  -- Métricas do gate (preservação fora da máscara / mudança dentro).
  out_of_mask_delta  numeric,
  in_mask_delta      numeric,
  mask_coverage      numeric,

  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS edit_v3_jobs_user_created_idx
  ON public.edit_v3_jobs (user_id, created_at DESC);

ALTER TABLE public.edit_v3_jobs ENABLE ROW LEVEL SECURITY;

-- O usuário lê o próprio histórico (escrita é só pelo service-role, que ignora RLS).
DROP POLICY IF EXISTS edit_v3_jobs_select_own ON public.edit_v3_jobs;
CREATE POLICY edit_v3_jobs_select_own
  ON public.edit_v3_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
