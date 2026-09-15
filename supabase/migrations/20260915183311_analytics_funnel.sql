-- ════════════════════════════════════════════════════════════════════════════
-- Funil de conversão completo — extensão de marketing.acquisition_events.
--
-- A tabela (20260718000000_marketing_ads_schema.sql) já guarda o funil de
-- dinheiro (signup/checkout/subscription). Esta migration a promove a event
-- store único do funil de produto + aquisição (catálogo em lib/analytics/
-- events.ts, docs em docs/ANALYTICS.md):
--
--   • anonymous_id — cookie first-party sn_aid; liga a jornada anônima
--     (landing_view/cta_clicked/…) ao user_id via evento de signup, sem
--     duplicar a jornada.
--   • page — path interno onde o evento aconteceu (sem querystring).
--   • offer_id — oferta aplicada/anunciada (ex.: launch50) p/ funil por oferta.
--   • dedupe_key — idempotência de eventos server-side (retry de webhook do
--     Stripe, reenvio do coletor): índice ÚNICO parcial; INSERT duplicado cai
--     em 23505, que recordAcquisitionEvent já trata como sucesso silencioso.
--   • CHECK de event_type ampliado com os novos eventos do catálogo. Aliases
--     de storage preservam os nomes legados que o painel /admin/marketing/ads
--     consome: signup_completed→signup, subscription_cancelled→
--     subscription_canceled (ver lib/analytics/events.ts).
--
-- MODELO DE ACESSO: inalterado — RLS ligada sem policies (deny-all para
-- anon/authenticated); toda escrita/leitura via service_role no servidor.
-- Idempotente (IF NOT EXISTS / DROP IF EXISTS), padrão do schema marketing.
-- ════════════════════════════════════════════════════════════════════════════

alter table marketing.acquisition_events
  add column if not exists anonymous_id text,
  add column if not exists page         text,
  add column if not exists offer_id     text,
  add column if not exists dedupe_key   text;

comment on column marketing.acquisition_events.anonymous_id is
  'Id anônimo first-party (cookie sn_aid, uuid). Presente em eventos pré-login e no evento de '
  'signup — é o join que associa a jornada anônima ao user_id sem duplicar a jornada.';
comment on column marketing.acquisition_events.page is
  'Path interno onde o evento aconteceu (sem querystring, sem host).';
comment on column marketing.acquisition_events.offer_id is
  'Oferta envolvida no evento (ex.: launch50). Em eventos de dinheiro é a oferta APLICADA '
  '(verdade do Stripe); em cta_clicked é a anunciada no momento do clique.';
comment on column marketing.acquisition_events.dedupe_key is
  'Chave de idempotência de eventos server-side (ex.: checkout:{session_id}). Índice único '
  'parcial garante que retries do Stripe/coletor não dupliquem conversão.';

-- CHECK ampliado. O nome do constraint é o gerado pelo Postgres para o CHECK
-- inline da migration original.
alter table marketing.acquisition_events
  drop constraint if exists acquisition_events_event_type_check;
alter table marketing.acquisition_events
  add constraint acquisition_events_event_type_check check (event_type in (
    -- legados (dados/painel existentes)
    'lp_view', 'lp_cta_click', 'signup', 'first_generation',
    'project_created', 'checkout_started', 'subscription_started',
    'subscription_renewed', 'subscription_canceled',
    -- funil de aquisição (landing principal)
    'landing_view', 'cta_clicked', 'plans_viewed',
    -- cadastro/onboarding
    'signup_started', 'onboarding_completed',
    -- produto
    'image_uploaded', 'generation_started', 'generation_completed',
    'generation_failed', 'result_approved', 'result_rejected',
    'result_downloaded',
    -- dinheiro (webhook)
    'checkout_completed'
  ));

create unique index if not exists uq_mkt_acq_events_dedupe
  on marketing.acquisition_events(dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_mkt_acq_events_anon
  on marketing.acquisition_events(anonymous_id, created_at)
  where anonymous_id is not null;
