-- ─────────────────────────────────────────────────────────────
-- Extração de DNA passa a registrar o débito (2026-09-17)
--
-- As duas rotas de extração de DNA cobram 8 nodes
-- (`DNA_EXTRACTION_COST`, em lib/spaces/economy.ts — 8 desde que o
-- módulo nasceu, em 09/05/2026) e NÃO gravavam esse custo em lugar
-- nenhum: só marcavam `dna_extracted_at` e mudavam o status. Resultado:
-- o consumo era real, saía do saldo, e nenhum relatório enxergava.
--
-- Era a única lacuna que sobrou depois de
-- 20260917020000_node_usage_daily_todas_as_ferramentas.sql.
--
-- A cobrança NÃO muda: continua o mesmo `consume_workspace_nodes` com o
-- mesmo valor, no mesmo ponto. O que entra é o registro.
--
-- ── Por que uma coluna nova, e não `nodes_cost` ───────────────
--
-- Em `vistas` já existe `nodes_cost`, que é o custo de GERAR a vista e
-- já é contado pela node_usage_daily. A extração de DNA é um segundo
-- débito, em outro momento, sobre a mesma linha. Somar os dois na mesma
-- coluna misturaria duas cobranças distintas e estragaria o histórico
-- da geração. Por isso `dna_nodes_cost` é coluna própria, datada por
-- `dna_extracted_at` (que já existia nas duas tabelas) e não por
-- `created_at` — a extração costuma acontecer depois da criação.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS dna_nodes_cost INTEGER;
ALTER TABLE public.vistas ADD COLUMN IF NOT EXISTS dna_nodes_cost INTEGER;

COMMENT ON COLUMN public.spaces.dna_nodes_cost IS
  'Nodes debitados na extração de DNA deste Space. Gravado só em caso de '
  'sucesso — quando a extração falha, a rota estorna e a coluna fica NULL.';
COMMENT ON COLUMN public.vistas.dna_nodes_cost IS
  'Nodes debitados na extração de DNA desta vista. NÃO confundir com '
  'nodes_cost, que é o custo de gerar a vista — são dois débitos distintos.';

-- ── Backfill ─────────────────────────────────────────────────
--
-- `dna_extracted_at IS NOT NULL` é quase sempre a marca de uma extração
-- que deu certo, e portanto de 8 nodes que saíram do saldo. O valor é
-- seguro porque DNA_EXTRACTION_COST nunca mudou (conferido no git: 8 em
-- todas as revisões de lib/spaces/economy.ts desde f49d5b3f, 09/05/2026).
--
-- MAS a marca também é COPIADA, sem cobrança nenhuma, em dois lugares:
--
--   1. /api/spaces/[id]/duplicate — o Space novo herda `dna` e
--      `dna_extracted_at` do original. Não herda `dna_nodes_cost` (a
--      rota lista os campos um a um e esta coluna não está lá), então
--      daqui pra frente a cópia já nasce certa. Em 17/09/2026 nenhuma
--      cópia carregava a marca, então o backfill não precisa filtrar.
--
--   2. /api/spaces/[id]/promote-vista-mestre — transfere a marca da
--      VISTA para o SPACE, com o mesmo timestamp. Aí a mesma extração
--      paga uma vez aparece nas duas tabelas, e somar as duas conta o
--      dobro. O NOT EXISTS abaixo é o que evita isso: timestamp idêntico
--      ao da vista promovida = marca copiada, não extração própria.
--
-- Em 17/09/2026: 133 spaces + 4 vistas, menos 1 space com marca copiada
-- = 136 extrações reais, 1.088 nodes que estavam invisíveis.

UPDATE public.spaces s
   SET dna_nodes_cost = 8
 WHERE s.dna_extracted_at IS NOT NULL
   AND s.dna_nodes_cost IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.vistas v
      WHERE v.id = s.vista_mestre_vista_id
        AND v.dna_extracted_at = s.dna_extracted_at
   );

UPDATE public.vistas
   SET dna_nodes_cost = 8
 WHERE dna_extracted_at IS NOT NULL AND dna_nodes_cost IS NULL;

-- ── node_usage_daily com as duas fontes novas ────────────────
--
-- Mesma assinatura (user_id, day, nodes) e mesmo `security_invoker = on`.
-- `spaces` e `vistas` já têm policy `select_own`, então o usuário
-- continua enxergando apenas o próprio consumo.

CREATE OR REPLACE VIEW public.node_usage_daily WITH (security_invoker = on) AS
SELECT
  user_id,
  day,
  SUM(nodes)::integer AS nodes
FROM (
  -- Renderizar, e também Ampliar, Animar e Apresentar: essas rotas
  -- gravam o job em `renders`.
  SELECT user_id, date_trunc('day', created_at)::date AS day, nodes_charged AS nodes
    FROM public.renders
   WHERE status = 'completed' AND nodes_charged > 0

  UNION ALL

  -- Vistas de Spaces (inclui a vista nova gerada ao editar uma vista).
  SELECT user_id, date_trunc('day', created_at)::date AS day, nodes_cost AS nodes
    FROM public.vistas
   WHERE status = 'completed' AND nodes_cost > 0

  UNION ALL

  -- Editar v1/v2. Sem coluna de status de propósito: a rota insere a
  -- linha só depois do resultado pronto, então existir = ter consumido.
  SELECT user_id, date_trunc('day', created_at)::date AS day, nodes_cost AS nodes
    FROM public.edits
   WHERE nodes_cost > 0

  UNION ALL

  -- Editar V3 e V4 — os dois gravam aqui (ver app/api/edit-v4/route.ts).
  SELECT user_id, date_trunc('day', created_at)::date AS day, nodes_cost AS nodes
    FROM public.edit_v3_jobs
   WHERE status = 'completed' AND nodes_cost > 0

  UNION ALL

  -- Blocos3D: tem marcação própria de estorno, além do status.
  SELECT user_id, date_trunc('day', created_at)::date AS day, nodes_cost AS nodes
    FROM public.blocos3d_jobs
   WHERE status = 'completed' AND NOT refunded AND nodes_cost > 0

  UNION ALL

  -- Estudar: estorno é PARCIAL (refunded_nodes), então é subtração, não
  -- filtro. GREATEST protege de um estorno maior que a cobrança.
  SELECT user_id, date_trunc('day', created_at)::date AS day,
         GREATEST(nodes_cost - COALESCE(refunded_nodes, 0), 0) AS nodes
    FROM public.estudos
   WHERE status = 'completed'
     AND GREATEST(nodes_cost - COALESCE(refunded_nodes, 0), 0) > 0

  UNION ALL

  SELECT user_id, date_trunc('day', created_at)::date AS day, nodes_cost AS nodes
    FROM public.estudo_alternativas
   WHERE status = 'completed' AND nodes_cost > 0

  UNION ALL

  -- Extração de DNA de um Space. Datada pela extração, não pela criação
  -- do Space: um Space pode ficar dias em draft antes de extrair.
  SELECT user_id, date_trunc('day', dna_extracted_at)::date AS day, dna_nodes_cost AS nodes
    FROM public.spaces
   WHERE dna_extracted_at IS NOT NULL AND dna_nodes_cost > 0

  UNION ALL

  -- Extração de DNA de uma vista. É um débito SEPARADO do nodes_cost
  -- da mesma linha, que já entrou lá em cima — colunas e datas
  -- diferentes, sem sobreposição.
  SELECT user_id, date_trunc('day', dna_extracted_at)::date AS day, dna_nodes_cost AS nodes
    FROM public.vistas
   WHERE dna_extracted_at IS NOT NULL AND dna_nodes_cost > 0
) sub
GROUP BY user_id, day;

COMMENT ON VIEW public.node_usage_daily IS
  'Consumo LÍQUIDO de nodes por usuário e dia, somando todas as ferramentas '
  'que cobram (inclusive extração de DNA) e já descontando jobs estornados. '
  'Relatório, não fonte de verdade de saldo — o saldo é profiles.credits '
  'mais o node_ledger.';

GRANT SELECT ON public.node_usage_daily TO authenticated;
