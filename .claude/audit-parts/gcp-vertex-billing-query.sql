-- Custo real do Vertex AI / Gemini no projeto gen-lang-client-0191517804.
-- Pré-requisito: Billing Export detalhado ativado (ver instruções no chat).
-- Rodar no BigQuery Console, no dataset onde o export foi configurado.
-- Trocar <PROJECT>.<DATASET>.<TABLE> pelo nome real
-- (ex: meu-projeto-billing.billing_export.gcp_billing_export_resource_v1_XXXXXX_XXXXXX_XXXXXX).

-- 1) Custo diário de Vertex AI (todos os SKUs: Gemini, Imagen, etc.)
SELECT
  DATE(usage_start_time) AS dia,
  service.description AS servico,
  sku.description AS sku,
  SUM(cost) AS custo_usd,
  SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS creditos_usd,
  SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS custo_liquido_usd,
  SUM(usage.amount) AS uso_quantidade,
  ANY_VALUE(usage.unit) AS unidade
FROM `<PROJECT>.<DATASET>.<TABLE>`
WHERE project.id = 'gen-lang-client-0191517804'
  AND service.description = 'Vertex AI'
  AND usage_start_time >= TIMESTAMP('2026-07-01')
GROUP BY dia, servico, sku
ORDER BY dia DESC, custo_usd DESC;

-- 2) Total do período, pra comparar direto com a estimativa de código ($0.134/img)
SELECT
  SUM(cost) AS custo_total_usd,
  COUNT(DISTINCT DATE(usage_start_time)) AS dias_com_uso
FROM `<PROJECT>.<DATASET>.<TABLE>`
WHERE project.id = 'gen-lang-client-0191517804'
  AND service.description = 'Vertex AI'
  AND usage_start_time >= TIMESTAMP('2026-07-01');
-- Divida custo_total_usd pelo número de renders com generation_log->>'provider' = 'gcp'
-- no mesmo período (Supabase) para chegar no custo real por imagem.
