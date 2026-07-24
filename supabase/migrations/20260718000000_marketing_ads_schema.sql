-- ════════════════════════════════════════════════════════════════════════════
-- Sistema de aquisição / tráfego pago (marketing) — fundação.
--
-- Estende o schema `marketing` (20260713000000_marketing_schema.sql) com o
-- banco operacional de mídia paga: canais → campanhas → conjuntos → anúncios,
-- públicos, landing pages próprias, métricas diárias, eventos de aquisição
-- (atribuição first-party), matriz de experimentos, fila de aprovação humana,
-- alertas e relatórios. Docs em docs/marketing/ads-system.md; serviços em
-- lib/marketing/ads/; painel em /admin/marketing/ads (staff only).
--
-- MODELO DE ACESSO — idêntico ao schema base (deny-by-default):
--   • anon/authenticated NÃO têm USAGE no schema nem policies; RLS ligada em
--     todas as tabelas como segunda tranca. Todo acesso via service_role
--     (createAdminClient) atrás do gate isInternalStaff — exceto escrita de
--     eventos de aquisição, que também passa pelo servidor (rotas públicas
--     rate-limitadas usam o admin client; o browser nunca fala com o schema).
--   • FKs para dados de produto (auth.users) usam on delete set null; nenhuma
--     FK aponta para tabelas de produto além de auth.users — ids de produto
--     são polimórficos (uuid sem FK), padrão do schema base.
--
-- REGRAS DE PROCESSO GRAVADAS NO DESENHO (docs/marketing/prohibited-content.md §7):
--   • Campanha/anúncio pago NUNCA nasce ativo: o fluxo de status só alcança
--     `active` a partir de `published_paused`/`paused`, e a transição exige uma
--     ação aprovada em ad_pending_actions (lib/marketing/ads/workflow.ts +
--     service). O sistema recomenda; a ativação e o gasto são decisão humana.
--   • Métricas derivadas (CTR/CPC/CAC/ROAS) não são persistidas — calculadas
--     na leitura para nunca divergirem da fonte.
--
-- DEPLOY (fora deste sprint — NÃO aplicar em produção agora):
--   1. Aplicar 20260713000000 + 20260713000001 (schema base, ainda pendentes).
--   2. Aplicar esta migration + 20260718000001_marketing_ads_seed.sql.
--   3. Garantir `marketing` em API → Exposed schemas (dashboard Supabase).
--
-- Convenções espelhadas do schema base: uuid PK, timestamptz default now(),
-- trigger marketing.touch_updated_at, idempotente (IF NOT EXISTS / OR REPLACE /
-- DROP IF EXISTS). NÃO é aplicado por db push.
-- ════════════════════════════════════════════════════════════════════════════

-- Pré-requisito: schema + trigger function do sprint editorial. Recriados aqui
-- de forma idempotente para esta migration não depender de ordem em ambientes
-- novos (mesmo corpo da 20260713000000).
create schema if not exists marketing;

revoke all on schema marketing from public;
grant usage on schema marketing to service_role;
alter default privileges in schema marketing
  grant all on tables to service_role;
alter default privileges in schema marketing
  grant all on sequences to service_role;

create or replace function marketing.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- ad_channels — canais de mídia (Meta, Google, …). Extensível por linha.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.ad_channels (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null unique,   -- meta | google_ads | instagram | linkedin_ads | tiktok_ads
  name        text        not null,
  status      text        not null default 'planned'
                          check (status in ('enabled', 'planned', 'disabled')),
  -- utm_source/utm_medium padrão do canal + limites de copy específicos.
  config      jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table marketing.ad_channels is
  'Canais de aquisição. enabled = disponível para planejar campanhas no painel; '
  'planned = previsto (LinkedIn/TikTok); a integração de publicação é sempre externa/aprovada.';

drop trigger if exists trg_mkt_ad_channels_updated_at on marketing.ad_channels;
create trigger trg_mkt_ad_channels_updated_at
  before update on marketing.ad_channels
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- ad_audiences — públicos/personas reutilizáveis
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.ad_audiences (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null unique,   -- arquiteto_autonomo | designer_interiores | …
  name        text        not null,
  description text,
  -- dores prioritárias (["horas esperando render", …]) e ferramentas
  -- (["SketchUp","Revit"]) usadas na matriz e nos briefs.
  pains       jsonb       not null default '[]'::jsonb,
  tools       jsonb       not null default '[]'::jsonb,
  -- direcionamento por canal (interesses/idades/regiões) — informativo; a
  -- aplicação no gerenciador é humana ou via ação aprovada.
  targeting   jsonb       not null default '{}'::jsonb,
  status      text        not null default 'active'
                          check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table marketing.ad_audiences is
  'Personas/públicos da matriz de experimentação (arquitetos autônomos, designers de interiores, '
  'pequenos escritórios, usuários de SketchUp/Revit/Archicad…).';

drop trigger if exists trg_mkt_ad_audiences_updated_at on marketing.ad_audiences;
create trigger trg_mkt_ad_audiences_updated_at
  before update on marketing.ad_audiences
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- ad_campaigns — campanhas (nível topo do plano de mídia)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.ad_campaigns (
  id                    uuid        primary key default gen_random_uuid(),
  name                  text        not null,
  identifier            text        not null unique,   -- SN_META_PROSPECCAO_… (lib/marketing/ads/naming.ts)
  channel_slug          text        not null references marketing.ad_channels(slug),
  -- frente estratégica (estrutura de 4 frentes do plano de aquisição)
  front                 text        not null default 'problema'
                                    check (front in ('problema', 'demonstracao', 'produto', 'conversao')),
  objective             text        not null default 'prospeccao'
                                    check (objective in ('prospeccao', 'demonstracao', 'conversao', 'remarketing', 'reconhecimento')),
  funnel_stage          text        not null default 'topo'
                                    check (funnel_stage in ('topo', 'meio', 'fundo', 'remarketing')),
  status                text        not null default 'draft'
                                    check (status in (
                                      'draft', 'pending_approval', 'approved', 'published_paused',
                                      'active', 'paused', 'completed', 'archived'
                                    )),
  hypothesis            text,                    -- hipótese da campanha (experimentos detalham por anúncio)
  daily_budget_cents    integer     check (daily_budget_cents is null or daily_budget_cents >= 0),
  lifetime_budget_cents integer     check (lifetime_budget_cents is null or lifetime_budget_cents >= 0),
  currency              text        not null default 'BRL',
  start_at              timestamptz,
  end_at                timestamptz,
  external_id           text,                    -- id no gerenciador (Meta/Google) quando existir
  notes                 text,
  created_by            uuid        references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table marketing.ad_campaigns is
  'Campanha de mídia paga. Transições de status em lib/marketing/ads/workflow.ts; `active` só é '
  'alcançável via ação humana aprovada (ad_pending_actions) — o sistema nunca ativa gasto sozinho.';

create index if not exists idx_mkt_ad_campaigns_status
  on marketing.ad_campaigns(status, updated_at desc);
create index if not exists idx_mkt_ad_campaigns_channel
  on marketing.ad_campaigns(channel_slug);

drop trigger if exists trg_mkt_ad_campaigns_updated_at on marketing.ad_campaigns;
create trigger trg_mkt_ad_campaigns_updated_at
  before update on marketing.ad_campaigns
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- ad_sets — conjuntos de anúncios (campanha × público × orçamento)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.ad_sets (
  id                 uuid        primary key default gen_random_uuid(),
  campaign_id        uuid        not null references marketing.ad_campaigns(id) on delete cascade,
  name               text        not null,
  identifier         text        not null unique,
  audience_id        uuid        references marketing.ad_audiences(id) on delete set null,
  daily_budget_cents integer     check (daily_budget_cents is null or daily_budget_cents >= 0),
  status             text        not null default 'draft'
                                 check (status in (
                                   'draft', 'pending_approval', 'approved', 'published_paused',
                                   'active', 'paused', 'completed', 'archived'
                                 )),
  targeting_summary  text,                     -- resumo humano do direcionamento aplicado
  external_id        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table marketing.ad_sets is
  'Conjunto de anúncios: um público + orçamento dentro de uma campanha.';

create index if not exists idx_mkt_ad_sets_campaign
  on marketing.ad_sets(campaign_id, updated_at desc);

drop trigger if exists trg_mkt_ad_sets_updated_at on marketing.ad_sets;
create trigger trg_mkt_ad_sets_updated_at
  before update on marketing.ad_sets
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- landing_pages — páginas de campanha servidas em /lp/[slug]
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.landing_pages (
  id               uuid        primary key default gen_random_uuid(),
  slug             text        not null unique,  -- /lp/{slug} — [a-z0-9-]
  name             text        not null,
  status           text        not null default 'draft'
                               check (status in ('draft', 'published', 'archived')),
  persona          text,                         -- slug de ad_audiences (informativo)
  pain             text,                         -- dor central da página
  headline         text,
  subheadline      text,
  cta_label        text,                         -- precisa estar nos CTAs aprovados (validado no app)
  -- seções configuráveis renderizadas por app/lp/[slug] (provas visuais,
  -- comparação antes/depois, módulos, FAQ curto…). Shape em lib/marketing/ads/types.ts.
  sections         jsonb       not null default '[]'::jsonb,
  meta_title       text,
  meta_description text,
  noindex          boolean     not null default true,  -- página de campanha não disputa SEO com a landing
  created_by       uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table marketing.landing_pages is
  'Landing pages de campanha (/lp/{slug}). Conteúdo estruturado em sections; só status=published '
  'é servida ao público. noindex por padrão — a landing principal é quem indexa.';

create index if not exists idx_mkt_landing_pages_status
  on marketing.landing_pages(status);

drop trigger if exists trg_mkt_landing_pages_updated_at on marketing.landing_pages;
create trigger trg_mkt_landing_pages_updated_at
  before update on marketing.landing_pages
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- ads — anúncios (unidade da matriz de experimentação)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.ads (
  id              uuid        primary key default gen_random_uuid(),
  ad_set_id       uuid        references marketing.ad_sets(id) on delete set null,
  campaign_id     uuid        references marketing.ad_campaigns(id) on delete cascade,
  -- vínculo editorial: criativo/copy nascem como briefing no sistema existente
  brief_id        uuid        references marketing.content_briefs(id) on delete set null,
  identifier      text        not null unique,  -- SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE_VIDEO01_COPY02
  -- dimensões da matriz de experimentação (persona/dor/promessa/formato/criativo/copy)
  persona         text,
  pain            text,
  promise         text,
  format          text,                          -- video | imagem | carrossel | story…
  creative_label  text,                          -- VIDEO01, IMG03…
  copy_variant    text,                          -- COPY01, COPY02…
  -- copy do anúncio (limites do brand_rules validados no app + brand-check)
  primary_text    text,
  headline        text,                          -- ≤ 40 chars (Meta)
  description     text,                          -- ≤ 30 chars (Meta)
  cta_button      text,                          -- SIGN_UP | LEARN_MORE (brand_rules.approved_ctas.botoes_anuncio)
  landing_page_id uuid        references marketing.landing_pages(id) on delete set null,
  destination_url text,                          -- URL final com UTMs (gerada por naming.ts)
  utm             jsonb       not null default '{}'::jsonb,  -- {source, medium, campaign, content, term}
  status          text        not null default 'draft'
                              check (status in (
                                'draft', 'ready_for_review', 'pending_approval', 'approved',
                                'published_paused', 'active', 'paused', 'ended', 'archived'
                              )),
  brand_check     jsonb,                         -- último resultado do verificador de marca
  external_id     text,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table marketing.ads is
  'Anúncio individual = célula da matriz (persona × dor × promessa × formato × criativo × copy × '
  'CTA × LP × canal × estágio). identifier único vira utm_content — é a chave de atribuição.';

create index if not exists idx_mkt_ads_campaign
  on marketing.ads(campaign_id, status);
create index if not exists idx_mkt_ads_ad_set
  on marketing.ads(ad_set_id);
create index if not exists idx_mkt_ads_status
  on marketing.ads(status, updated_at desc);

drop trigger if exists trg_mkt_ads_updated_at on marketing.ads;
create trigger trg_mkt_ads_updated_at
  before update on marketing.ads
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- ad_metrics_daily — métricas brutas por dia (manual/CSV hoje; API futura)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.ad_metrics_daily (
  id           uuid        primary key default gen_random_uuid(),
  metric_date  date        not null,
  level        text        not null check (level in ('campaign', 'ad_set', 'ad')),
  entity_id    uuid        not null,             -- id na tabela do nível (sem FK — nível dinâmico)
  channel_slug text,
  impressions  bigint      not null default 0 check (impressions >= 0),
  reach        bigint      check (reach is null or reach >= 0),
  clicks       integer     not null default 0 check (clicks >= 0),
  spend_cents  integer     not null default 0 check (spend_cents >= 0),
  -- conversões REPORTADAS pela plataforma de anúncio (a verdade de negócio
  -- vem de acquisition_events; manter separado evita dupla contagem)
  platform_leads integer   check (platform_leads is null or platform_leads >= 0),
  source       text        not null default 'manual'
                           check (source in ('manual', 'csv', 'api')),
  raw          jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (metric_date, level, entity_id)
);

comment on table marketing.ad_metrics_daily is
  'Uma linha por dia por entidade (campanha/conjunto/anúncio). Derivadas (CTR/CPC/CPM/CAC/ROAS) '
  'são calculadas na leitura (lib/marketing/ads/metrics.ts) — nunca persistidas.';

create index if not exists idx_mkt_ad_metrics_entity
  on marketing.ad_metrics_daily(level, entity_id, metric_date desc);
create index if not exists idx_mkt_ad_metrics_date
  on marketing.ad_metrics_daily(metric_date desc);

-- ════════════════════════════════════════════════════════════════════════════
-- acquisition_events — eventos de conversão first-party (atribuição)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.acquisition_events (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        references auth.users(id) on delete set null,  -- null p/ eventos anônimos (lp_view)
  event_type          text        not null
                                  check (event_type in (
                                    'lp_view', 'lp_cta_click', 'signup', 'first_generation',
                                    'project_created', 'checkout_started', 'subscription_started',
                                    'subscription_renewed', 'subscription_canceled'
                                  )),
  -- snapshot de atribuição no momento do evento (first-party; sem terceiros)
  utm                 jsonb       not null default '{}'::jsonb,  -- {source, medium, campaign, content, term, first_touch?}
  ad_identifier       text,                     -- utm_content normalizado → marketing.ads.identifier
  campaign_identifier text,                     -- utm_campaign normalizado
  landing_page_id     uuid        references marketing.landing_pages(id) on delete set null,
  referrer            text,
  plan_id             text,                     -- free|starter|pro|studio|office quando aplicável
  value_cents         integer,                  -- receita do evento (assinatura/renovação)
  metadata            jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

comment on table marketing.acquisition_events is
  'Funil first-party: visita de LP → cadastro (com UTM do cookie sn_attribution) → checkout → '
  'assinatura/renovação/cancelamento. Escrito SEMPRE pelo servidor (best-effort — nunca derruba '
  'o fluxo de produto). Ativação (1ª geração) é computada das tabelas de produto quando não instrumentada.';

-- Um único evento de cadastro por usuário (atribuição de signup é imutável).
create unique index if not exists uq_mkt_acq_signup_per_user
  on marketing.acquisition_events(user_id, event_type)
  where event_type in ('signup', 'first_generation');

create index if not exists idx_mkt_acq_events_type
  on marketing.acquisition_events(event_type, created_at desc);
create index if not exists idx_mkt_acq_events_ad
  on marketing.acquisition_events(ad_identifier)
  where ad_identifier is not null;
create index if not exists idx_mkt_acq_events_campaign
  on marketing.acquisition_events(campaign_identifier)
  where campaign_identifier is not null;
create index if not exists idx_mkt_acq_events_user
  on marketing.acquisition_events(user_id)
  where user_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- ad_experiments — matriz de experimentação (hipótese → conclusão → próxima ação)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.ad_experiments (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  hypothesis       text        not null,
  -- célula da matriz: {persona, pain, promise, format, creative, copy, cta,
  --                    landing_page, channel, funnel_stage}
  matrix           jsonb       not null default '{}'::jsonb,
  campaign_id      uuid        references marketing.ad_campaigns(id) on delete set null,
  ad_ids           uuid[]      not null default '{}',
  primary_metric   text        not null default 'cac'
                               check (primary_metric in ('ctr', 'cpc', 'cpm', 'cpa_signup', 'cac', 'roas', 'lp_conversion')),
  success_criteria text,                        -- ex.: "CAC ≤ R$120 com ≥10 assinaturas"
  status           text        not null default 'planned'
                               check (status in (
                                 'planned', 'running', 'validated', 'invalidated', 'inconclusive', 'abandoned'
                               )),
  conclusion       text,
  next_action      text,
  started_at       timestamptz,
  ended_at         timestamptz,
  created_by       uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table marketing.ad_experiments is
  'Registro de experimento: hipótese, célula da matriz, critério de sucesso, conclusão e próxima '
  'ação. validated/invalidated exigem conclusão preenchida (validado no service); inconclusive '
  'existe para amostras insuficientes — nunca concluir sem dado confiável.';

create index if not exists idx_mkt_ad_experiments_status
  on marketing.ad_experiments(status, updated_at desc);

drop trigger if exists trg_mkt_ad_experiments_updated_at on marketing.ad_experiments;
create trigger trg_mkt_ad_experiments_updated_at
  before update on marketing.ad_experiments
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- ad_pending_actions — fila de aprovação humana (nada muda campanha/gasto sem isto)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.ad_pending_actions (
  id               uuid        primary key default gen_random_uuid(),
  action_type      text        not null
                               check (action_type in (
                                 'publish_campaign', 'activate', 'pause', 'resume',
                                 'increase_budget', 'decrease_budget', 'edit_targeting',
                                 'archive_campaign', 'other'
                               )),
  entity_level     text        not null check (entity_level in ('campaign', 'ad_set', 'ad')),
  entity_id        uuid        not null,
  payload          jsonb       not null default '{}'::jsonb,  -- ex.: {daily_budget_cents: 5000}
  reason           text,                        -- por que o sistema/alguém recomenda a ação
  status           text        not null default 'pending'
                               check (status in ('pending', 'approved', 'rejected', 'executed', 'failed', 'canceled')),
  requested_by     uuid        references auth.users(id) on delete set null,  -- null = recomendação automática
  decided_by       uuid        references auth.users(id) on delete set null,
  decided_at       timestamptz,
  decision_notes   text,
  executed_at      timestamptz,
  execution_result jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table marketing.ad_pending_actions is
  'Fluxo de aprovação: publicar (sempre pausado), ativar, pausar, mudar orçamento/segmentação. '
  'O sistema cria recomendações (requested_by null); a decisão é sempre humana (decided_by). '
  'Execução automática (API do canal) só após approved — e registra execution_result.';

create index if not exists idx_mkt_ad_actions_status
  on marketing.ad_pending_actions(status, created_at desc);
create index if not exists idx_mkt_ad_actions_entity
  on marketing.ad_pending_actions(entity_level, entity_id);

drop trigger if exists trg_mkt_ad_actions_updated_at on marketing.ad_pending_actions;
create trigger trg_mkt_ad_actions_updated_at
  before update on marketing.ad_pending_actions
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- ad_alerts — anomalias e oportunidades detectadas
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.ad_alerts (
  id           uuid        primary key default gen_random_uuid(),
  alert_type   text        not null,   -- spend_no_conversion | cpc_spike | ctr_drop | lp_low_conversion |
                                       -- tracking_failure | budget_near_limit | cac_above_target |
                                       -- ad_fatigue | winner_scale_opportunity (catálogo em alerts.ts)
  severity     text        not null default 'warning'
                           check (severity in ('info', 'warning', 'critical')),
  entity_level text        check (entity_level in ('campaign', 'ad_set', 'ad', 'landing_page', 'system')),
  entity_id    uuid,
  message      text        not null,
  data         jsonb       not null default '{}'::jsonb,   -- números que sustentam o alerta
  status       text        not null default 'open'
                           check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table marketing.ad_alerts is
  'Alertas do motor de regras (lib/marketing/ads/alerts.ts): gasto sem conversão, CPC/CTR fora da '
  'faixa, LP fraca, falha de rastreamento, CAC acima da meta, fadiga, vencedor escalável. '
  'Alertas recomendam — a ação vira ad_pending_actions.';

create index if not exists idx_mkt_ad_alerts_status
  on marketing.ad_alerts(status, severity, created_at desc);

drop trigger if exists trg_mkt_ad_alerts_updated_at on marketing.ad_alerts;
create trigger trg_mkt_ad_alerts_updated_at
  before update on marketing.ad_alerts
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- ad_reports — relatórios periódicos gerados
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.ad_reports (
  id           uuid        primary key default gen_random_uuid(),
  period_start date        not null,
  period_end   date        not null,
  title        text        not null,
  summary_md   text        not null,            -- relatório legível (markdown)
  data         jsonb       not null default '{}'::jsonb,  -- números consolidados do período
  status       text        not null default 'final'
                           check (status in ('draft', 'final')),
  created_by   uuid        references auth.users(id) on delete set null,  -- null = geração automática
  created_at   timestamptz not null default now()
);

comment on table marketing.ad_reports is
  'Relatório do período: investimento, aquisição, vencedores/perdedores, hipóteses validadas e '
  'falhas, próximos testes, recomendação de orçamento. Gerado por lib/marketing/ads/report.ts; '
  'marca explicitamente métricas com amostra insuficiente.';

create index if not exists idx_mkt_ad_reports_period
  on marketing.ad_reports(period_end desc);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — ligada em tudo, SEM policies (deny-all p/ anon/authenticated;
-- service_role bypassa). Mesma segunda tranca do schema base.
-- ════════════════════════════════════════════════════════════════════════════
alter table marketing.ad_channels        enable row level security;
alter table marketing.ad_audiences       enable row level security;
alter table marketing.ad_campaigns       enable row level security;
alter table marketing.ad_sets            enable row level security;
alter table marketing.landing_pages      enable row level security;
alter table marketing.ads                enable row level security;
alter table marketing.ad_metrics_daily   enable row level security;
alter table marketing.acquisition_events enable row level security;
alter table marketing.ad_experiments     enable row level security;
alter table marketing.ad_pending_actions enable row level security;
alter table marketing.ad_alerts          enable row level security;
alter table marketing.ad_reports         enable row level security;

-- Garantia extra (idempotente) para as tabelas já criadas.
grant all on all tables    in schema marketing to service_role;
grant all on all sequences in schema marketing to service_role;
