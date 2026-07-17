-- Blocos 3D — jobs de geração imagem → modelo 3D (providers: fal + Meshy).
--
-- ⚠️ ADITIVA E NÃO-DESTRUTIVA. Cria a tabela nova `blocos3d_jobs` + RLS +
-- índice e ESTENDE o allowlist de MIME do bucket `spacenode-media` para os
-- formatos de modelo 3D. Não altera nenhuma tabela existente.
--
-- Arquitetura (padrão fila + polling, a evolução recomendada no /api/video):
--   POST /api/blocos3d           → debita nodes, cria task no provider, insere job
--   GET  /api/blocos3d/[jobId]   → consulta o provider; em sucesso re-hospeda
--                                  os modelos no bucket `spacenode-media` e marca
--                                  completed; em falha estorna (uma única vez).
--
-- Os arquivos ficam em `{user_id}/blocos3d/...` — as policies owner-scoped do
-- bucket (migration 20260703130000) já cobrem esse prefixo.
--
-- Por que tabela própria e NÃO `renders` (deliberado, precedente edit_v3_jobs):
-- o output é um MODELO 3D, não imagem — o histórico global e o dashboard
-- renderizam <img src=output_url> e quebrariam com um .glb. O módulo tem
-- histórico próprio na página. Follow-up possível: espelhar a thumbnail em
-- `renders` na conclusão pra aparecer no histórico unificado.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.blocos3d_jobs;
--   (allowlist de MIME: reverter manualmente se necessário — é só aditivo.)

CREATE TABLE IF NOT EXISTS public.blocos3d_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,

  status             text NOT NULL DEFAULT 'processing'
                       CHECK (status IN ('processing','completed','failed')),

  -- Motor (catálogo em lib/blocos3d/config.ts — fonte única de verdade).
  provider           text NOT NULL DEFAULT 'fal'
                       CHECK (provider IN ('fal','meshy')),
  engine             text NOT NULL,    -- endpoint/modelo do provider
  provider_task_id   text,             -- request_id (fal) / task id (meshy)

  -- Entrada.
  input_image_url    text NOT NULL,
  quality            text NOT NULL DEFAULT 'standard'
                       CHECK (quality IN ('draft','standard','high')),
  options            jsonb,            -- texture_prompt, params do provider…

  -- Progresso reportado pelo provider (0–100; fal não reporta — fica 0 e a UI
  -- sintetiza pela estimativa), atualizado a cada poll.
  progress           integer NOT NULL DEFAULT 0,

  -- Saída re-hospedada no bucket `spacenode-media` (keys, não URLs — bucket é
  -- privado desde a criação; a emissão assina com signStorageKey).
  model_glb_key      text,
  model_fbx_key      text,
  model_obj_key      text,
  model_usdz_key     text,
  thumbnail_key      text,
  -- Fallback: URLs do provider (expiram — só rede de segurança).
  provider_model_urls jsonb,

  -- Cobrança (débito ANTES da criação da task; refund verificado em falha).
  nodes_cost         integer NOT NULL DEFAULT 0 CHECK (nodes_cost >= 0),
  charged            boolean NOT NULL DEFAULT false,
  refunded           boolean NOT NULL DEFAULT false,

  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS blocos3d_jobs_user_created_idx
  ON public.blocos3d_jobs (user_id, created_at DESC);

ALTER TABLE public.blocos3d_jobs ENABLE ROW LEVEL SECURITY;

-- O usuário lê o próprio histórico (escrita é só pelo service-role, que ignora RLS).
DROP POLICY IF EXISTS blocos3d_jobs_select_own ON public.blocos3d_jobs;
CREATE POLICY blocos3d_jobs_select_own
  ON public.blocos3d_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ── Bucket `spacenode-media`: aceitar formatos de modelo 3D ──────────────────
-- MIMEs declarados pelo rehost server-side (string-match literal do Storage).
-- Sem `application/octet-stream` de propósito: manter o allowlist estrito
-- (as policies do bucket permitem INSERT owner-scoped a authenticated).
UPDATE storage.buckets
   SET allowed_mime_types = (
     SELECT ARRAY(
       SELECT DISTINCT unnest(
         COALESCE(allowed_mime_types, ARRAY[]::text[]) ||
         ARRAY['model/gltf-binary','model/fbx','model/obj','model/vnd.usdz+zip']
       )
     )
   )
 WHERE id = 'spacenode-media';
