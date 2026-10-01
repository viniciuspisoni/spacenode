-- Conteúdo da LP SketchUp atualizado junto com o hero no código.
-- Guarda a headline anterior para não sobrescrever uma revisão editorial
-- feita no painel depois da preparação desta entrega.
update marketing.landing_pages
set
  headline = 'Do print do SketchUp ao render pronto para apresentar.',
  subheadline = 'Gere imagens fotorrealistas preservando geometria, perspectiva e proporções — sem escrever prompts.',
  cta_label = 'Criar meu primeiro render',
  meta_title = 'Do print do SketchUp ao render para apresentar · SpaceNode',
  meta_description = 'Gere imagens fotorrealistas a partir de prints do SketchUp, com foco em preservar geometria, perspectiva e proporções. Teste com 80 nodes grátis, sem cartão.',
  sections = (
    select jsonb_agg(
      case when item->>'kind' = 'pricing' then
        jsonb_set(
          item,
          '{note}',
          to_jsonb('Nodes são as unidades de uso da plataforma — um render HD parte de 10 nodes. Eles acumulam enquanto a assinatura estiver ativa e, pelas regras atuais, o saldo segue disponível por 90 dias após o cancelamento. Você pode testar com 80 nodes grátis, sem cartão. Ao escolher um plano, o cadastro segue para a assinatura.'::text)
        )
      else item end
      order by ordinal
    )
    from jsonb_array_elements(sections) with ordinality as entries(item, ordinal)
  )
where slug = 'print-do-sketchup'
  and headline = 'O print do SketchUp vira a imagem da reunião. Nada sai do lugar.';
