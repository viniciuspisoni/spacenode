-- ─────────────────────────────────────────────────────────────
-- Orion · piloto interno do GPT Image 2.5 (2026-09-10)
--
-- Migration ADITIVA e mínima. NÃO aplicada em produção nesta tarefa —
-- rodar só no ambiente onde o teste interno vai acontecer.
--
-- O que muda em `renders`:
--   1. coluna `is_internal_test` (default false) — marcador confiável,
--      gravado pelo SERVIDOR (app/api/generate/route.ts), nunca pelo cliente.
--   2. `engine` passa a aceitar 'orion' (Vega/Pulsar/Quasar intactos).
--   3. `nodes_charged` deixa de ser sempre > 0: ZERO é permitido apenas em
--      linha marcada como teste interno. Motor público preserva a regra
--      comercial de sempre.
--   4. toda linha 'orion' EXIGE is_internal_test = true, nodes_charged = 0 e
--      resolution = '2k' (a única liberada no piloto). Nem um bug de código
--      consegue gravar uma geração do piloto como se fosse comercial.
--   5. as views de equipe passam a ignorar linhas internas — um workspace de
--      cliente nunca vê nem contabiliza o teste, mesmo que quem gerou seja
--      membro dele.
--
-- NÃO toca em `spaces` nem em `vistas` (Orion não existe lá), não altera
-- nenhum registro antigo e não muda nenhuma regra dos motores públicos.
-- ─────────────────────────────────────────────────────────────

-- ── 1. Marcador interno ──────────────────────────────────────

ALTER TABLE public.renders
  ADD COLUMN IF NOT EXISTS is_internal_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.renders.is_internal_test IS
  'Geração de teste interno (piloto Orion). Escrita só pelo servidor, após '
  'isInternalStaff + ORION_INTERNAL_ENABLED. Isola do histórico de equipe, '
  'das views de uso e da cobrança.';

-- Índice parcial: as linhas internas são poucas; os filtros das views só
-- precisam achar/excluir esse punhado.
CREATE INDEX IF NOT EXISTS idx_renders_internal_test
  ON public.renders(user_id, created_at DESC)
  WHERE is_internal_test;

-- ── 2. engine aceita 'orion' ─────────────────────────────────
--
-- A CHECK original veio de 20260507000000 como constraint de COLUNA
-- (`renders_engine_check`). Se aquele ADD COLUMN foi no-op num banco onde a
-- coluna já existia, o nome pode ser outro — o laço abaixo derruba qualquer
-- CHECK que ainda liste só os três motores, preservando explicitamente a
-- `renders_valid_engine_resolution` (regra HD × Vega/Quasar, que continua
-- valendo e não afeta Orion, 2K-only).

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.renders'::regclass
       AND contype  = 'c'
       AND conname <> 'renders_valid_engine_resolution'
       AND pg_get_constraintdef(oid) ILIKE '%engine%'
       AND pg_get_constraintdef(oid) NOT ILIKE '%orion%'
  LOOP
    EXECUTE format('ALTER TABLE public.renders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.renders
  ADD CONSTRAINT renders_engine_allowed
  CHECK (engine IN ('vega', 'quasar', 'pulsar', 'orion'));

-- ── 3. nodes_charged: > 0 no comercial, = 0 só no teste interno ──

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.renders'::regclass
       AND contype  = 'c'
       AND conname <> 'renders_nodes_charged_rule'
       AND pg_get_constraintdef(oid) ILIKE '%nodes_charged%'
  LOOP
    EXECUTE format('ALTER TABLE public.renders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.renders
  ADD CONSTRAINT renders_nodes_charged_rule
  CHECK (
    CASE WHEN is_internal_test THEN nodes_charged = 0
         ELSE nodes_charged > 0
    END
  );

-- ── 4. Regras do piloto Orion ────────────────────────────────

ALTER TABLE public.renders
  DROP CONSTRAINT IF EXISTS renders_orion_internal_only;

ALTER TABLE public.renders
  ADD CONSTRAINT renders_orion_internal_only
  CHECK (
    engine <> 'orion'
    OR (is_internal_test AND nodes_charged = 0 AND resolution = '2k')
  );

-- ── 5. Isolamento nas views de equipe ────────────────────────
--
-- Mesmas colunas e mesmas permissões de antes; muda só o WHERE de `renders`.
-- (node_usage_daily já ignora nodes_charged = 0, então o piloto sai de fora
-- do gráfico de consumo sem precisar de alteração.)

CREATE OR REPLACE VIEW public.workspace_generations
WITH (security_invoker = on) AS
  SELECT v.workspace_id, v.user_id, v.id AS generation_id, 'vista'::text AS kind,
         v.space_id AS project_id, v.image_url AS url, v.engine AS tool,
         v.nodes_cost AS nodes, v.is_favorited, v.review_status, v.created_at
  FROM public.vistas v WHERE v.workspace_id IS NOT NULL
  UNION ALL
  SELECT r.workspace_id, r.user_id, r.id, 'render'::text, NULL::uuid, r.output_url, r.engine,
         r.nodes_charged, false, r.review_status, r.created_at
  FROM public.renders r
  WHERE r.workspace_id IS NOT NULL AND NOT r.is_internal_test
  UNION ALL
  SELECT e.workspace_id, e.user_id, e.id, 'edit'::text, NULL::uuid, e.result_image_url, e.engine,
         e.nodes_cost, false, e.review_status, e.created_at
  FROM public.edits e WHERE e.workspace_id IS NOT NULL;

REVOKE ALL    ON public.workspace_generations FROM anon, authenticated;
GRANT  SELECT ON public.workspace_generations TO service_role;

CREATE OR REPLACE VIEW public.workspace_member_usage
WITH (security_invoker = on) AS
WITH gen AS (
  SELECT workspace_id, user_id, nodes_cost     AS nodes, is_favorited AS fav, review_status AS review, created_at
  FROM public.vistas  WHERE workspace_id IS NOT NULL
  UNION ALL
  SELECT workspace_id, user_id, nodes_charged, false,        review_status, created_at
  FROM public.renders WHERE workspace_id IS NOT NULL AND NOT is_internal_test
  UNION ALL
  SELECT workspace_id, user_id, nodes_cost,    false,        review_status, created_at
  FROM public.edits   WHERE workspace_id IS NOT NULL
)
SELECT
  workspace_id,
  user_id,
  count(*)                                     AS images,
  coalesce(sum(nodes), 0)                      AS nodes,
  count(*) filter (WHERE fav)                  AS favoritas,
  count(*) filter (WHERE review = 'approved')  AS aprovadas,
  count(*) filter (WHERE review = 'discarded') AS descartadas,
  max(created_at)                              AS last_activity
FROM gen
GROUP BY workspace_id, user_id;

REVOKE ALL    ON public.workspace_member_usage FROM anon, authenticated;
GRANT  SELECT ON public.workspace_member_usage TO service_role;
