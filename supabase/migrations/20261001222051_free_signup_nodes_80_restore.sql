-- Novos cadastros voltam a receber 80 nodes (decisão de produto de
-- 01/10/2026, desfazendo 20261001150323_free_signup_nodes_40).
--
-- O grant é o DEFAULT de public.profiles.credits: handle_new_user() faz o
-- INSERT sem `credits`. Só afeta linhas NOVAS — nenhum saldo existente é
-- alterado aqui. Quem se cadastrou enquanto o default era 40 NÃO recebe
-- complemento automático; isso é decisão manual (ver a descrição do PR).
--
-- Manter em sincronia: FREE_SIGNUP_NODES em lib/plans.ts, supabase-schema.sql
-- e a copy da landing/app — tests/free-signup-nodes.test.ts confere os três.
ALTER TABLE public.profiles
  ALTER COLUMN credits SET DEFAULT 80;

-- A migration anterior trocou '80 nodes' por '40 nodes' nos conteúdos do
-- painel. A volta mexe SÓ nas frases da oferta de cadastro ("N nodes
-- grátis", "com N nodes") para não reescrever um custo de geração que por
-- acaso fale em 40 nodes. Edições feitas no painel ficam preservadas.
UPDATE marketing.landing_pages
SET
  headline = replace(replace(replace(replace(headline,
    '40 nodes grátis', '80 nodes grátis'), '40 Nodes grátis', '80 Nodes grátis'),
    'com 40 nodes', 'com 80 nodes'), 'com 40 Nodes', 'com 80 Nodes'),
  subheadline = replace(replace(replace(replace(subheadline,
    '40 nodes grátis', '80 nodes grátis'), '40 Nodes grátis', '80 Nodes grátis'),
    'com 40 nodes', 'com 80 nodes'), 'com 40 Nodes', 'com 80 Nodes'),
  cta_label = replace(replace(replace(replace(cta_label,
    '40 nodes grátis', '80 nodes grátis'), '40 Nodes grátis', '80 Nodes grátis'),
    'com 40 nodes', 'com 80 nodes'), 'com 40 Nodes', 'com 80 Nodes'),
  meta_title = replace(replace(replace(replace(meta_title,
    '40 nodes grátis', '80 nodes grátis'), '40 Nodes grátis', '80 Nodes grátis'),
    'com 40 nodes', 'com 80 nodes'), 'com 40 Nodes', 'com 80 Nodes'),
  meta_description = replace(replace(replace(replace(meta_description,
    '40 nodes grátis', '80 nodes grátis'), '40 Nodes grátis', '80 Nodes grátis'),
    'com 40 nodes', 'com 80 nodes'), 'com 40 Nodes', 'com 80 Nodes'),
  sections = replace(replace(replace(replace(sections::text,
    '40 nodes grátis', '80 nodes grátis'), '40 Nodes grátis', '80 Nodes grátis'),
    'com 40 nodes', 'com 80 nodes'), 'com 40 Nodes', 'com 80 Nodes')::jsonb
WHERE
  concat_ws(' ', headline, subheadline, cta_label, meta_title, meta_description, sections::text)
    ~* '(40 nodes grátis|com 40 nodes)';

UPDATE marketing.ads
SET
  primary_text = replace(replace(replace(replace(primary_text,
    '40 nodes grátis', '80 nodes grátis'), '40 Nodes grátis', '80 Nodes grátis'),
    'com 40 nodes', 'com 80 nodes'), 'com 40 Nodes', 'com 80 Nodes'),
  headline = replace(replace(replace(replace(headline,
    '40 nodes grátis', '80 nodes grátis'), '40 Nodes grátis', '80 Nodes grátis'),
    'com 40 nodes', 'com 80 nodes'), 'com 40 Nodes', 'com 80 Nodes'),
  description = replace(replace(replace(replace(description,
    '40 nodes grátis', '80 nodes grátis'), '40 Nodes grátis', '80 Nodes grátis'),
    'com 40 nodes', 'com 80 nodes'), 'com 40 Nodes', 'com 80 Nodes')
WHERE
  concat_ws(' ', primary_text, headline, description) ~* '(40 nodes grátis|com 40 nodes)';
