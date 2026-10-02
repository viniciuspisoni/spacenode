-- Complemento de 20261001222051_free_signup_nodes_80_restore.
--
-- A volta das frases de oferta diferenciava maiúsculas e não pegou "40 Nodes
-- Grátis" (headline em Title Case de um rascunho de anúncio, conferido em
-- produção depois da aplicação). Mesma troca, agora sem diferenciar
-- maiúsculas e preservando a grafia do restante da frase. Continua restrita
-- à oferta de cadastro ("N nodes grátis", "com N nodes").
UPDATE marketing.landing_pages
SET
  headline = regexp_replace(regexp_replace(headline,
    '\m40(\s+nodes\s+gr[aá]tis)', '80\1', 'gi'), '(\mcom\s+)40(\s+nodes)', '\180\2', 'gi'),
  subheadline = regexp_replace(regexp_replace(subheadline,
    '\m40(\s+nodes\s+gr[aá]tis)', '80\1', 'gi'), '(\mcom\s+)40(\s+nodes)', '\180\2', 'gi'),
  cta_label = regexp_replace(regexp_replace(cta_label,
    '\m40(\s+nodes\s+gr[aá]tis)', '80\1', 'gi'), '(\mcom\s+)40(\s+nodes)', '\180\2', 'gi'),
  meta_title = regexp_replace(regexp_replace(meta_title,
    '\m40(\s+nodes\s+gr[aá]tis)', '80\1', 'gi'), '(\mcom\s+)40(\s+nodes)', '\180\2', 'gi'),
  meta_description = regexp_replace(regexp_replace(meta_description,
    '\m40(\s+nodes\s+gr[aá]tis)', '80\1', 'gi'), '(\mcom\s+)40(\s+nodes)', '\180\2', 'gi'),
  sections = regexp_replace(regexp_replace(sections::text,
    '\m40(\s+nodes\s+gr[aá]tis)', '80\1', 'gi'), '(\mcom\s+)40(\s+nodes)', '\180\2', 'gi')::jsonb
WHERE
  concat_ws(' ', headline, subheadline, cta_label, meta_title, meta_description, sections::text)
    ~* '(\m40\s+nodes\s+gr[aá]tis|\mcom\s+40\s+nodes)';

UPDATE marketing.ads
SET
  primary_text = regexp_replace(regexp_replace(primary_text,
    '\m40(\s+nodes\s+gr[aá]tis)', '80\1', 'gi'), '(\mcom\s+)40(\s+nodes)', '\180\2', 'gi'),
  headline = regexp_replace(regexp_replace(headline,
    '\m40(\s+nodes\s+gr[aá]tis)', '80\1', 'gi'), '(\mcom\s+)40(\s+nodes)', '\180\2', 'gi'),
  description = regexp_replace(regexp_replace(description,
    '\m40(\s+nodes\s+gr[aá]tis)', '80\1', 'gi'), '(\mcom\s+)40(\s+nodes)', '\180\2', 'gi')
WHERE
  concat_ws(' ', primary_text, headline, description) ~* '(\m40\s+nodes\s+gr[aá]tis|\mcom\s+40\s+nodes)';
