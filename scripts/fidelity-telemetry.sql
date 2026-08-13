-- scripts/fidelity-telemetry.sql
--
-- Telemetria de fidelidade do Renderizar a partir de renders.generation_log
-- (JSONB). Rodar no SQL Editor do Supabase (leitura pura — nenhuma query
-- escreve). Estas são as leituras que informam as decisões pendentes:
--   · subir o gate RENDER_FIDELITY_MIN_SCORE de 0.50 → 0.75-0.80
--   · escolher o teto do gate de cor RENDER_FIDELITY_MAX_COLOR_DELTA
--   · A/B do edge map na 1ª tentativa (RENDER_FIDELITY_EDGE_FIRST)
--
-- Campos usados (gravados pelo /api/generate desde 2026-08-13):
--   generation_log.fidelity.final_score / min_score / attempts[] / semantic_audit
--   generation_log.{engine,resolution,seed,structural_boost,briefing_source}
--   attempts[].geometry.{score,edgeRecall,meanColorDelta,worstCellColorDelta}

-- ── 1. Distribuição do score final por engine × resolução (30 dias) ──────────
-- Guia do gate: se o p10 dos renders saudáveis está acima de 0.75, subir o
-- minScore pra 0.75 não gera retry-storm.
select
  generation_log->>'engine'                             as engine,
  generation_log->>'resolution'                          as resolution,
  count(*)                                               as renders,
  round(percentile_cont(0.10) within group (order by (generation_log->'fidelity'->>'final_score')::numeric)::numeric, 3) as p10,
  round(percentile_cont(0.50) within group (order by (generation_log->'fidelity'->>'final_score')::numeric)::numeric, 3) as p50,
  round(percentile_cont(0.95) within group (order by (generation_log->'fidelity'->>'final_score')::numeric)::numeric, 3) as p95
from renders
where created_at > now() - interval '30 days'
  and generation_log->'fidelity'->>'final_score' is not null
group by 1, 2
order by 1, 2;

-- ── 2. Taxa de retry e % abaixo do gate ───────────────────────────────────────
select
  count(*)                                                                  as renders,
  round(avg(jsonb_array_length(generation_log->'fidelity'->'attempts')), 2) as tentativas_medias,
  round(100.0 * count(*) filter (
    where jsonb_array_length(generation_log->'fidelity'->'attempts') > 1
  ) / greatest(count(*), 1), 1)                                             as pct_com_retry,
  round(100.0 * count(*) filter (
    where (generation_log->'fidelity'->>'final_score')::numeric
        < (generation_log->'fidelity'->>'min_score')::numeric
  ) / greatest(count(*), 1), 1)                                             as pct_abaixo_do_gate
from renders
where created_at > now() - interval '30 days'
  and generation_log->'fidelity'->>'final_score' is not null;

-- ── 3. A/B do edge map na 1ª tentativa ───────────────────────────────────────
-- Compara o score da PRIMEIRA tentativa com e sem edge map. Se o grupo "com"
-- não superar o "sem", desligar RENDER_FIDELITY_EDGE_FIRST.
with primeiras as (
  select
    (a->>'edge_map_used')::boolean            as edge_first,
    (a->'geometry'->>'score')::numeric        as score
  from renders,
       lateral jsonb_array_elements(generation_log->'fidelity'->'attempts') with ordinality as t(a, n)
  where created_at > now() - interval '30 days'
    and n = 1
    and a->'geometry'->>'score' is not null
)
select
  edge_first,
  count(*)                       as tentativas,
  round(avg(score), 3)           as score_medio,
  round(percentile_cont(0.5) within group (order by score)::numeric, 3) as p50
from primeiras
group by 1
order by 1;

-- ── 4. Drift de cor (ΔE) das entregas ────────────────────────────────────────
-- Calibra RENDER_FIDELITY_MAX_COLOR_DELTA: olhar o p95 do worst_cell em
-- renders SEM pedido de mudança (briefing preservado) — o teto deve ficar
-- acima do p95 saudável e abaixo dos outliers de recolor.
with entregas as (
  select
    (a->'geometry'->>'meanColorDelta')::numeric      as mean_de,
    (a->'geometry'->>'worstCellColorDelta')::numeric as worst_de
  from renders,
       lateral jsonb_array_elements(generation_log->'fidelity'->'attempts') as a
  where created_at > now() - interval '30 days'
    and a->'geometry'->>'meanColorDelta' is not null
)
select
  count(*)                                                                   as amostras,
  round(percentile_cont(0.5)  within group (order by mean_de)::numeric, 1)   as mean_de_p50,
  round(percentile_cont(0.95) within group (order by mean_de)::numeric, 1)   as mean_de_p95,
  round(percentile_cont(0.5)  within group (order by worst_de)::numeric, 1)  as worst_de_p50,
  round(percentile_cont(0.95) within group (order by worst_de)::numeric, 1)  as worst_de_p95
from entregas;

-- ── 5. Auditoria semântica (visão) ───────────────────────────────────────────
select
  count(*)                                            as auditados,
  round(100.0 * count(*) filter (
    where (generation_log->'fidelity'->'semantic_audit'->>'warning')::boolean
  ) / greatest(count(*), 1), 1)                       as pct_warning,
  round(avg((generation_log->'fidelity'->'semantic_audit'->>'score')::numeric), 2) as score_medio,
  round(avg((generation_log->'fidelity'->'semantic_audit'->'attributes'->>'aberturas')::numeric), 2)  as aberturas,
  round(avg((generation_log->'fidelity'->'semantic_audit'->'attributes'->>'volumetria')::numeric), 2) as volumetria,
  round(avg((generation_log->'fidelity'->'semantic_audit'->'attributes'->>'camera')::numeric), 2)     as camera,
  round(avg((generation_log->'fidelity'->'semantic_audit'->'attributes'->>'materiais')::numeric), 2)  as materiais
from renders
where created_at > now() - interval '30 days'
  and generation_log->'fidelity'->'semantic_audit' is not null
  and generation_log->'fidelity'->>'semantic_audit' != 'null';

-- ── 6. "Corrigir drift" (structural boost): uso e resultado ──────────────────
select
  (generation_log->>'structural_boost')::boolean as boost,
  count(*)                                       as renders,
  round(avg((generation_log->'fidelity'->>'final_score')::numeric), 3) as score_medio
from renders
where created_at > now() - interval '30 days'
  and generation_log->'fidelity'->>'final_score' is not null
group by 1
order by 1;

-- ── 7. Ampliar: fallback e fator atingido ────────────────────────────────────
select
  upscale_meta->>'mode_id'                           as modo,
  count(*)                                           as jobs,
  round(100.0 * count(*) filter (
    where (upscale_meta->>'fallback_used')::boolean
  ) / greatest(count(*), 1), 1)                      as pct_fallback,
  round(avg((upscale_meta->>'achieved_factor')::numeric), 2) as fator_medio
from renders
where created_at > now() - interval '30 days'
  and upscale_meta is not null
group by 1
order by 2 desc;

-- ── 8. Fonte do briefing (cache funcionando?) ────────────────────────────────
select
  generation_log->>'briefing_source' as fonte,
  count(*)                           as renders
from renders
where created_at > now() - interval '30 days'
  and generation_log->>'briefing_source' is not null
group by 1
order by 2 desc;
