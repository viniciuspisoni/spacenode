-- Contagem de gerações via Gemini/Vertex (GCP) por dia, no Supabase.
-- Rodar junto com a query 2 de gcp-vertex-billing-query.sql (mesmo período)
-- para chegar no custo real por imagem: custo_total_usd (BigQuery) / qtd_imagens_gcp (aqui).

select
  date(created_at) as dia,
  count(*) as qtd_imagens_gcp,
  sum(nodes_charged) as nodes_cobrados,
  round(sum(nodes_charged) * 0.0135, 2) as receita_piso_usd,     -- node = R$0,0729 / FX 5.4
  round(sum(nodes_charged) * 0.0185, 2) as receita_mediana_usd,  -- node = R$0,10 / FX 5.4
  round(count(*) * 0.134, 2) as custo_estimado_usd                -- estimativa de código (não medida), só pra referência
from renders
where generation_log->>'provider' = 'gcp'
group by dia
order by dia desc;

-- Mesma coisa incluindo `vistas` (Spaces) e `edits` (vertex/imagen-edit), se quiser o total da plataforma:
--
-- select 'renders' as origem, date(created_at) as dia, count(*) as qtd
-- from renders where generation_log->>'provider' = 'gcp' group by 1,2
-- union all
-- select 'vistas', date(created_at), count(*)
-- from vistas where provider = 'gcp' group by 1,2
-- union all
-- select 'edits', date(created_at), count(*)
-- from edits where engine = 'vertex/imagen-edit' group by 1,2
-- order by 2 desc, 1;
