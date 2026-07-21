-- ════════════════════════════════════════════════════════════════════════════
-- Seed do sistema de aquisição/tráfego pago: canais, públicos, guardrails,
-- landing pages iniciais (draft) e 1 campanha/experimento de exemplo.
--
-- DEPENDE de 20260718000000_marketing_ads_schema.sql (e do schema base
-- 20260713000000 + 20260713000001). NÃO aplicar em produção neste sprint.
-- NÃO é aplicado por db push.
--
-- Idempotente: ON CONFLICT DO NOTHING pelas chaves únicas (slug/identifier/key)
-- — não sobrescreve edições feitas depois pelo painel. Exceção documentada:
-- ad_experiments não tem unique em name, então o exemplo usa WHERE NOT EXISTS
-- (ON CONFLICT sem constraint não seria idempotente).
--
-- Copy segue docs/marketing/prohibited-content.md: nenhum número inventado,
-- nenhum depoimento, nenhum módulo desativado citado. Fatos utilizáveis:
-- 40 nodes grátis sem cartão · planos a partir de R$ 89/mês · preserva
-- geometria, proporções e perspectiva · aceita prints de SketchUp/Revit/
-- Archicad como imagem base (NUNCA "plugin"/"importação direta").
-- ════════════════════════════════════════════════════════════════════════════

-- ── ad_channels ────────────────────────────────────────────────────────────────
-- Só `meta` nasce enabled (leitura pronta em lib/meta/ads.ts). Os demais são
-- planejados — o painel os lista, mas nenhuma campanha publica sem canal ativo.

insert into marketing.ad_channels (slug, name, status, config) values
(
  'meta', 'Meta Ads (Facebook/Instagram)', 'enabled',
  '{"utm_source": "meta", "utm_medium": "paid_social"}'::jsonb
),
(
  'google_ads', 'Google Ads (Busca/YouTube)', 'planned',
  '{"utm_source": "google", "utm_medium": "cpc"}'::jsonb
),
(
  'instagram', 'Instagram (impulsionamento)', 'planned',
  '{"utm_source": "instagram", "utm_medium": "paid_social"}'::jsonb
),
(
  'linkedin_ads', 'LinkedIn Ads', 'planned',
  '{"utm_source": "linkedin", "utm_medium": "paid_social"}'::jsonb
),
(
  'tiktok_ads', 'TikTok Ads', 'planned',
  '{"utm_source": "tiktok", "utm_medium": "paid_social"}'::jsonb
)
on conflict (slug) do nothing;

-- ── ad_audiences ───────────────────────────────────────────────────────────────
-- Personas da matriz de experimentação. `pains` na ordem de prioridade — os
-- briefs de anúncio partem daqui; `tools` alimenta a promessa "prints como
-- imagem base" (nunca prometer plugin/importação direta).

insert into marketing.ad_audiences (slug, name, description, pains, tools) values
(
  'arquiteto_autonomo',
  'Arquiteto autônomo',
  'Atende do estudo preliminar à apresentação sozinho; visualização é gargalo de prazo e de custo.',
  '["horas esperando render", "imagem bonita que altera o projeto", "custo de renderista/render farm", "cliente que não entende o projeto"]'::jsonb,
  '["SketchUp", "Revit", "Archicad"]'::jsonb
),
(
  'designer_interiores',
  'Designer de interiores',
  'Vende atmosfera e materialidade; precisa que o cliente aprove acabamento antes da obra.',
  '["aprovação de materialidade e atmosfera", "retrabalho de pós-produção", "prazo de apresentação"]'::jsonb,
  '["SketchUp", "Archicad"]'::jsonb
),
(
  'escritorio_pequeno',
  'Escritório pequeno (2–10 pessoas)',
  'Vários projetos simultâneos; precisa de consistência visual entre quem produz e previsibilidade de custo.',
  '["volume e consistência entre a equipe", "coerência entre vistas", "custo por projeto"]'::jsonb,
  '["Revit", "Archicad", "SketchUp"]'::jsonb
),
(
  'usuario_sketchup',
  'Usuário de SketchUp',
  'Modela rápido e apresenta a partir de prints do modelo; desconfia de IA que deforma o desenho.',
  '["fluxo a partir de prints do modelo", "medo de a IA deformar a geometria"]'::jsonb,
  '["SketchUp"]'::jsonb
)
on conflict (slug) do nothing;

-- ── brand_rules: guardrails do tráfego pago ────────────────────────────────────
-- Motor de alertas (lib/marketing/ads/alerts.ts, loadGuardrails) lê os limites
-- DAQUI — mudar a operação = editar esta chave, não o código. Limiares de
-- amostra das métricas derivadas ficam em código (DEFAULT_THRESHOLDS de
-- lib/marketing/ads/metrics.ts) — não são configuráveis por aqui.

insert into marketing.brand_rules (key, value, description) values
(
  'ads_guardrails',
  '{
    "cac_target_cents": 20000,
    "spend_no_conversion_cents": 10000,
    "cpc_spike_ratio": 1.5,
    "ctr_drop_ratio": 0.6,
    "lp_min_views": 200,
    "lp_min_conversion": 0.02,
    "budget_alert_share": 0.85,
    "fatigue_ratio": 0.7
  }'::jsonb,
  'Guardrails de mídia paga lidos pelo motor de alertas (lib/marketing/ads/alerts.ts): meta de CAC, teto de gasto sem conversão, razões de anomalia (CPC/CTR/fadiga), mínimos de LP e fração de alerta de orçamento. Alertas recomendam — nunca executam.'
)
on conflict (key) do nothing;

-- ── landing_pages ──────────────────────────────────────────────────────────────
-- Nascem draft: publicar (status published) é decisão humana no painel.
-- Pares de antes/depois usam APENAS arquivos conferidos de public/ —
-- gallery-casa-* e gallery-comercial-* estão com nomes trocados no disco
-- (before↔after) e NÃO entram aqui até serem renomeados.

insert into marketing.landing_pages
  (slug, name, status, persona, pain, headline, subheadline, cta_label, sections, meta_title, meta_description) values
(
  'render-sem-espera',
  'LP · Render sem espera (arquiteto autônomo)',
  'draft',
  'arquiteto_autonomo',
  'horas esperando render',
  'Do modelo à imagem apresentável. Sem fila de render.',
  'Envie um print do seu modelo de SketchUp, Revit ou Archicad e gere imagens que preservam geometria, proporções e perspectiva. 40 nodes grátis, sem cartão.',
  'Comece grátis',
  '[
    {
      "kind": "value_props",
      "items": [
        {
          "title": "Sem fila de render",
          "body": "Gere a imagem de apresentação direto no navegador, a partir de um print do seu modelo — sem depender de renderista externo nem de render farm."
        },
        {
          "title": "O projeto continua o seu",
          "body": "O fluxo preserva geometria, proporções e perspectiva do insumo enviado. A imagem melhora; o projeto não muda."
        },
        {
          "title": "Comece sem cartão",
          "body": "Todo cadastro começa com 40 nodes grátis, sem cartão. Planos a partir de R$ 89/mês quando fizer sentido escalar."
        }
      ]
    },
    {
      "kind": "before_after",
      "pairs": [
        { "before": "/gallery-living-before.jpg", "after": "/gallery-living-after.jpg", "label": "Living" },
        { "before": "/gallery-coworking-before.jpg", "after": "/gallery-coworking-after.jpg", "label": "Coworking" }
      ]
    },
    {
      "kind": "how_it_works",
      "steps": [
        {
          "title": "Envie um print do modelo",
          "body": "Exporte uma imagem do SketchUp, Revit ou Archicad e faça o upload — a plataforma usa o print como imagem base."
        },
        {
          "title": "Escolha motor e atmosfera",
          "body": "Defina acabamento, iluminação e atmosfera da cena. A geração parte sempre do seu insumo."
        },
        {
          "title": "Apresente",
          "body": "Revise o resultado e baixe a imagem pronta para reunião, prancha ou proposta."
        }
      ]
    },
    {
      "kind": "faq",
      "items": [
        {
          "q": "Preciso de cartão de crédito para testar?",
          "a": "Não. Todo cadastro começa com 40 nodes grátis, sem cartão."
        },
        {
          "q": "Funciona com SketchUp, Revit e Archicad?",
          "a": "Sim — a plataforma aceita prints do modelo como imagem base. Não há plugin nem importação direta de arquivo."
        },
        {
          "q": "A imagem gerada altera o meu projeto?",
          "a": "O fluxo foi desenhado para preservar geometria, proporções e perspectiva do insumo enviado. Você revisa cada imagem antes de apresentar."
        }
      ]
    }
  ]'::jsonb,
  'SpaceNode — do modelo à imagem apresentável, sem fila de render',
  'Envie um print do seu modelo de SketchUp, Revit ou Archicad e gere imagens de apresentação que preservam geometria, proporções e perspectiva. 40 nodes grátis, sem cartão.'
),
(
  'fidelidade-ao-projeto',
  'LP · Fidelidade ao projeto',
  'draft',
  'arquiteto_autonomo',
  'IA genérica que altera o projeto',
  'A imagem muda. O seu projeto, não.',
  'Geração de imagem para arquitetura que preserva geometria, proporções e perspectiva — e mantém a coerência entre as vistas do mesmo ambiente com o Spaces.',
  'Comece grátis',
  '[
    {
      "kind": "value_props",
      "items": [
        {
          "title": "Geometria preservada",
          "body": "O insumo enviado é a autoridade: geometria, proporções e perspectiva são preservadas na imagem final."
        },
        {
          "title": "Coerência entre vistas",
          "body": "Com o Spaces, as vistas do mesmo ambiente compartilham o mesmo DNA visual — materiais e atmosfera coerentes de um ângulo a outro."
        },
        {
          "title": "Controle de quem projeta",
          "body": "Você define insumo, atmosfera e acabamento, e revisa cada imagem antes de apresentar. A tecnologia é meio; o assunto é o projeto."
        }
      ]
    },
    {
      "kind": "before_after",
      "pairs": [
        { "before": "/gallery-banheiro-before.jpg", "after": "/gallery-banheiro-after.jpg", "label": "Banheiro" },
        { "before": "/gallery-industrial-before.jpg", "after": "/gallery-industrial-after.jpg", "label": "Industrial" }
      ]
    },
    {
      "kind": "how_it_works",
      "steps": [
        {
          "title": "Envie um print do modelo",
          "body": "Exporte uma imagem do SketchUp, Revit ou Archicad e faça o upload — a plataforma usa o print como imagem base."
        },
        {
          "title": "Escolha motor e atmosfera",
          "body": "Defina acabamento, iluminação e atmosfera da cena. A geração parte sempre do seu insumo."
        },
        {
          "title": "Apresente",
          "body": "Revise o resultado e baixe a imagem pronta para reunião, prancha ou proposta."
        }
      ]
    },
    {
      "kind": "faq",
      "items": [
        {
          "q": "O que acontece com as proporções do meu modelo?",
          "a": "O fluxo preserva geometria, proporções e perspectiva do insumo enviado — a imagem final respeita o desenho."
        },
        {
          "q": "Como funciona a coerência entre vistas?",
          "a": "No Spaces, as vistas de um mesmo ambiente compartilham o mesmo DNA visual, mantendo materiais e atmosfera coerentes entre os ângulos."
        },
        {
          "q": "Quanto custa para começar?",
          "a": "Nada: todo cadastro começa com 40 nodes grátis, sem cartão. Planos a partir de R$ 89/mês."
        }
      ]
    }
  ]'::jsonb,
  'SpaceNode — a imagem muda, o seu projeto não',
  'Imagens de apresentação que preservam geometria, proporções e perspectiva do seu modelo, com coerência entre vistas do mesmo ambiente. Comece com 40 nodes grátis, sem cartão.'
)
on conflict (slug) do nothing;

-- ── Campanha de exemplo (draft) ────────────────────────────────────────────────
-- Serve de referência de preenchimento no painel. Sem orçamento de propósito:
-- orçamento entra quando a campanha for real, via fluxo de aprovação.

insert into marketing.ad_campaigns
  (name, identifier, channel_slug, front, objective, funnel_stage, status, hypothesis) values
(
  'Prospecção · Arquitetos autônomos · Fidelidade',
  'SN_META_PROSPECCAO_ARQUITETO',
  'meta',
  'problema',
  'prospeccao',
  'topo',
  'draft',
  'Arquitetos autônomos respondem mais à dor de fidelidade (IA genérica que altera o projeto) do que à promessa de velocidade: anúncio com prova de geometria preservada gera cadastro a custo aceitável.'
)
on conflict (identifier) do nothing;

-- ── Experimento de exemplo (planned) ───────────────────────────────────────────
-- ad_experiments não tem unique em name — idempotência via WHERE NOT EXISTS
-- (ON CONFLICT DO NOTHING sem constraint duplicaria a linha a cada aplicação).
-- campaign_id resolvido por sub-select no identifier da campanha acima.

insert into marketing.ad_experiments
  (name, hypothesis, matrix, campaign_id, primary_metric, success_criteria, status)
select
  'Fidelidade preservada · Arquiteto autônomo · Meta topo',
  'Para arquitetos autônomos em topo de funil no Meta, a promessa "preserva geometria" converte cadastro a custo por cadastro menor do que promessas de velocidade.',
  '{
    "persona": "arquiteto_autonomo",
    "pain": "imagem bonita que altera o projeto",
    "promise": "preserva geometria",
    "channel": "meta",
    "funnel_stage": "topo"
  }'::jsonb,
  (select id from marketing.ad_campaigns where identifier = 'SN_META_PROSPECCAO_ARQUITETO'),
  'cpa_signup',
  'Custo por cadastro ≤ R$ 40 com ≥ 10 cadastros',
  'planned'
where not exists (
  select 1 from marketing.ad_experiments
  where name = 'Fidelidade preservada · Arquiteto autônomo · Meta topo'
);
