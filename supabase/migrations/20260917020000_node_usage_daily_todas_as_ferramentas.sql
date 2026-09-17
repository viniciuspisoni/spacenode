-- ─────────────────────────────────────────────────────────────
-- node_usage_daily passa a enxergar TODAS as ferramentas (2026-09-17)
--
-- A view nasceu em 20260509000000_spaces_block_1.sql cobrindo só
-- `renders` e `vistas` — na época, as duas únicas ferramentas que
-- cobravam. Desde então entraram Editar (v1, V3 e V4) e Blocos3D, e a
-- view nunca acompanhou: todo o consumo desses módulos ficou invisível.
--
-- O tamanho do erro, medido em 16/09/2026 na conta de uma assinante: no
-- ciclo 21/06–21/07 a view reportava 210 nodes contra 556 reais — 346
-- vinham do Editar. Quem lê "consumo" por aqui subestima o uso.
--
-- A view NÃO é fonte de verdade de saldo (isso é `profiles.credits` +
-- `node_ledger`), então o erro nunca afetou cobrança. É relatório: a
-- rota /api/users/me/usage mostra os 7 últimos dias ao usuário.
--
-- ── Consumo LÍQUIDO ───────────────────────────────────────────
--
-- Job que falha é cobrado na entrada e estornado depois (ver
-- lib/billing/refund-nodes.ts). Contar a cobrança bruta infla o número:
-- no dia 16/09 a mesma assinante tinha 112 nodes em jobs mas só 38 de
-- consumo real — 54 eram de 3 edições que falharam e foram estornadas.
-- Por isso cada fonte entra pelo seu próprio marcador de sucesso:
--
--   renders / vistas / edit_v3_jobs  → status = 'completed'
--   blocos3d_jobs                    → status = 'completed' AND NOT refunded
--   estudos                          → nodes_cost - refunded_nodes
--   edits                            → a linha só existe em caso de
--                                      sucesso (a rota insere DEPOIS do
--                                      resultado), então não há o que filtrar
--
-- ── O que fica de fora, e por quê ─────────────────────────────
--
-- `image_edit_attempts` — é TELEMETRIA da tentativa, não um débito
--   próprio. Toda cobrança que ela registra já aparece em `edits` (rota
--   /api/edits, que grava nas duas) ou em `vistas` (rota de editar vista,
--   que gera uma vista nova). Conferido: das 82 tentativas concluídas,
--   41 apontam para uma linha de `edits`, 32 para uma vista e 9 são
--   free fix de custo zero. Somá-la seria contar duas vezes.
--
-- `workspace_generations` — é VIEW sobre vistas + renders + edits.
--
-- `shots` — não tem user_id (só workspace_id) e está vazia.
--
-- `estudos` / `estudo_alternativas` — entram já preparadas, mas hoje
--   estão vazias: o módulo Estudar (PR #149) nunca foi para produção.
--
-- ── LACUNA CONHECIDA, sem conserto possível aqui ──────────────
--
-- A extração de DNA (/api/spaces/[id]/extract-dna e a de vistas) debita
-- 8 nodes por extração e NÃO grava o custo em lugar nenhum — só muda
-- `spaces.status` para 'dna_extracted'. Enquanto a rota não persistir o
-- custo, nenhuma view consegue capturar esse consumo. São ~170 spaces na
-- base, teto de ~1.360 nodes em toda a história da conta.
--
-- ── Compatibilidade ──────────────────────────────────────────
--
-- Mesma assinatura (user_id, day, nodes) e mesmo `security_invoker = on`
-- da original — cada tabela nova tem policy `select_own`, então o
-- usuário continua enxergando apenas o próprio consumo.
-- ─────────────────────────────────────────────────────────────

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
) sub
GROUP BY user_id, day;

COMMENT ON VIEW public.node_usage_daily IS
  'Consumo LÍQUIDO de nodes por usuário e dia, somando todas as ferramentas '
  'que cobram e já descontando jobs estornados. Relatório, não fonte de '
  'verdade de saldo — o saldo é profiles.credits + node_ledger. '
  'Não cobre a extração de DNA, que debita sem persistir o custo.';

GRANT SELECT ON public.node_usage_daily TO authenticated;
