-- Novos cadastros recebem 40 nodes. Saldos existentes não são alterados.
-- handle_new_user() omite credits e usa o default de public.profiles.
ALTER TABLE public.profiles
  ALTER COLUMN credits SET DEFAULT 40;

-- Landings administradas no banco podem conter a oferta anterior em
-- metadados e seções JSON. Preserva todas as demais edições feitas no painel.
UPDATE marketing.landing_pages
SET
  headline = replace(replace(headline, '80 nodes', '40 nodes'), '80 Nodes', '40 Nodes'),
  subheadline = replace(replace(subheadline, '80 nodes', '40 nodes'), '80 Nodes', '40 Nodes'),
  cta_label = replace(replace(cta_label, '80 nodes', '40 nodes'), '80 Nodes', '40 Nodes'),
  meta_title = replace(replace(meta_title, '80 nodes', '40 nodes'), '80 Nodes', '40 Nodes'),
  meta_description = replace(replace(meta_description, '80 nodes', '40 nodes'), '80 Nodes', '40 Nodes'),
  sections = replace(replace(sections::text, '80 nodes', '40 nodes'), '80 Nodes', '40 Nodes')::jsonb
WHERE
  headline ILIKE '%80 nodes%'
  OR subheadline ILIKE '%80 nodes%'
  OR cta_label ILIKE '%80 nodes%'
  OR meta_title ILIKE '%80 nodes%'
  OR meta_description ILIKE '%80 nodes%'
  OR sections::text ILIKE '%80 nodes%';

-- Criativos pausados e rascunhos no painel também devem refletir a oferta
-- antes de uma próxima publicação. Anúncios externos pausados não são editados.
UPDATE marketing.ads
SET
  primary_text = replace(replace(primary_text, '80 nodes', '40 nodes'), '80 Nodes', '40 Nodes'),
  headline = replace(replace(headline, '80 nodes', '40 nodes'), '80 Nodes', '40 Nodes'),
  description = replace(replace(description, '80 nodes', '40 nodes'), '80 Nodes', '40 Nodes')
WHERE
  primary_text ILIKE '%80 nodes%'
  OR headline ILIKE '%80 nodes%'
  OR description ILIKE '%80 nodes%';
