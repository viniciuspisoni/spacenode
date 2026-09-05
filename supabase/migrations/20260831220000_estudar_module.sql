-- Módulo Estudar — estudos preliminares para ambientes reais.
--
-- ⚠️ ADITIVA E NÃO-DESTRUTIVA. Cria apenas as tabelas novas `estudos` e
-- `estudo_alternativas` + RLS + índices. NÃO altera nenhuma tabela existente.
-- Como as demais migrations do repo, este arquivo é o snapshot versionado do
-- que deve ser aplicado via MCP/SQL editor — NÃO rodar `supabase db push`.
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- Modelo: um `estudo` por fotografia enviada (briefing + máscara de
-- preservação + medida + cobrança); N `estudo_alternativas` por estudo —
-- as 3 iniciais (essencial/equilibrada/completa) + refinos localizados,
-- cada uma com o prompt estruturado e o arquivo gerado.
--
-- `source_type` já nasce com 'FLOOR_PLAN' no CHECK para o futuro estudo sobre
-- planta baixa; o MVP só grava 'PHOTO' (a rota rejeita o resto).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.estudo_alternativas;
--   DROP TABLE IF EXISTS public.estudos;

CREATE TABLE IF NOT EXISTS public.estudos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,

  -- Origem (MVP: só PHOTO; FLOOR_PLAN reservado para o futuro).
  source_type        text NOT NULL DEFAULT 'PHOTO'
                       CHECK (source_type IN ('PHOTO','FLOOR_PLAN')),
  status             text NOT NULL DEFAULT 'processing'
                       CHECK (status IN ('processing','completed','partial','failed')),

  -- Entradas do estudo.
  source_image_url   text NOT NULL,
  source_width       integer,
  source_height      integer,
  -- Máscara P&B dos elementos a preservar (branco = preservar), opcional.
  preserve_mask_url  text,
  -- Medida real de referência opcional: { descricao, valor, unidade }.
  medida             jsonb,
  -- Briefing estruturado completo (EstudoBriefing de lib/estudar/types.ts).
  briefing           jsonb NOT NULL,

  -- Alternativa escolhida pelo usuário na tela de resultados.
  escolhida          text CHECK (escolhida IS NULL OR escolhida IN ('essencial','equilibrada','completa')),
  -- Vínculo com o projeto (pastas do Histórico). Apagar a pasta não apaga o estudo.
  folder_id          uuid REFERENCES public.render_folders(id) ON DELETE SET NULL,
  -- Linha de `renders` (ambient 'estudo') criada ao salvar a proposta escolhida
  -- no Histórico/projeto — evita duplicar a cada salvamento. Sem FK de
  -- propósito (mesma convenção do edit_v3_jobs: acoplamento mínimo).
  saved_render_id    uuid,

  -- Cobrança (débito antes da geração; refund proporcional por alternativa falha).
  nodes_cost         integer NOT NULL DEFAULT 0 CHECK (nodes_cost >= 0),
  charged            boolean NOT NULL DEFAULT false,
  refunded_nodes     integer NOT NULL DEFAULT 0 CHECK (refunded_nodes >= 0),

  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS estudos_user_created_idx
  ON public.estudos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS estudos_folder_idx
  ON public.estudos (folder_id);

ALTER TABLE public.estudos ENABLE ROW LEVEL SECURITY;

-- O usuário lê os próprios estudos (escrita é só pelo service-role, que ignora RLS).
DROP POLICY IF EXISTS estudos_select_own ON public.estudos;
CREATE POLICY estudos_select_own
  ON public.estudos
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.estudo_alternativas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estudo_id          uuid NOT NULL REFERENCES public.estudos(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL,

  variante           text NOT NULL CHECK (variante IN ('essencial','equilibrada','completa')),
  -- 'inicial' = uma das 3 do estudo; 'refino' = refinamento localizado sobre parent_id.
  kind               text NOT NULL DEFAULT 'inicial' CHECK (kind IN ('inicial','refino')),
  parent_id          uuid REFERENCES public.estudo_alternativas(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed')),

  -- Prompt estruturado usado na geração (redigido só para admin nas leituras).
  prompt             text,
  -- Refino: instrução do usuário + máscara da região (branco = alterar).
  refine_instruction text,
  refine_mask_url    text,

  -- Resultado + motor.
  image_url          text,
  image_width        integer,
  image_height       integer,
  provider           text CHECK (provider IS NULL OR provider IN ('gcp','fal')),
  model              text,
  request_id         text,

  nodes_cost         integer NOT NULL DEFAULT 0 CHECK (nodes_cost >= 0),
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estudo_alternativas_estudo_idx
  ON public.estudo_alternativas (estudo_id, created_at);

ALTER TABLE public.estudo_alternativas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estudo_alternativas_select_own ON public.estudo_alternativas;
CREATE POLICY estudo_alternativas_select_own
  ON public.estudo_alternativas
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
