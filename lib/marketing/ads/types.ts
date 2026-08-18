// lib/marketing/ads/types.ts
//
// Tipos do sistema de aquisição/tráfego pago (schema marketing.ad_*).
// Mesmo racional de lib/marketing/types.ts: o schema não tem types gerados
// (não é exposto no client); estes tipos são o contrato usado por
// lib/marketing/ads/service.ts, pelas rotas /api/admin/marketing/ads/* e pelo
// painel /admin/marketing/ads. Statuses e transições: ./workflow.ts.

import type {
  AdStatus,
  ActionStatus,
  AlertStatus,
  CampaignStatus,
  ExperimentStatus,
} from './workflow'
import type { DerivedMetrics, RawTotals } from './metrics'
import type { UtmParams } from './naming'
import type { BrandCheckSnapshot } from '../types'

// ── Entidades (espelho 1:1 das tabelas) ────────────────────────────────────────

export type ChannelStatus = 'enabled' | 'planned' | 'disabled'

export interface AdChannel {
  id: string
  slug: string
  name: string
  status: ChannelStatus
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AdAudience {
  id: string
  slug: string
  name: string
  description: string | null
  pains: string[]
  tools: string[]
  targeting: Record<string, unknown>
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}

export type CampaignFront = 'problema' | 'demonstracao' | 'produto' | 'conversao'
export type CampaignObjective = 'prospeccao' | 'demonstracao' | 'conversao' | 'remarketing' | 'reconhecimento'
export type FunnelStage = 'topo' | 'meio' | 'fundo' | 'remarketing'

export interface AdCampaign {
  id: string
  name: string
  identifier: string
  channel_slug: string
  front: CampaignFront
  objective: CampaignObjective
  funnel_stage: FunnelStage
  status: CampaignStatus
  hypothesis: string | null
  daily_budget_cents: number | null
  lifetime_budget_cents: number | null
  currency: string
  start_at: string | null
  end_at: string | null
  external_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AdSet {
  id: string
  campaign_id: string
  name: string
  identifier: string
  audience_id: string | null
  daily_budget_cents: number | null
  status: CampaignStatus
  targeting_summary: string | null
  external_id: string | null
  created_at: string
  updated_at: string
}

export interface Ad {
  id: string
  ad_set_id: string | null
  campaign_id: string
  brief_id: string | null
  identifier: string
  persona: string | null
  pain: string | null
  promise: string | null
  format: string | null
  creative_label: string | null
  copy_variant: string | null
  primary_text: string | null
  headline: string | null
  description: string | null
  cta_button: string | null
  landing_page_id: string | null
  destination_url: string | null
  utm: Partial<UtmParams>
  status: AdStatus
  brand_check: BrandCheckSnapshot | null
  external_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type LandingPageStatus = 'draft' | 'published' | 'archived'

/** Seção configurável renderizada por app/lp/[slug]/page.tsx. A união é
 *  fechada — seção desconhecida é ignorada na renderização. */
export type LandingSection =
  | { kind: 'value_props'; items: Array<{ title: string; body: string }> }
  | { kind: 'before_after'; pairs: Array<{ before: string; after: string; label?: string }> }
  | { kind: 'modules'; module_ids: string[] }               // ids de lib/nav/modules-config (só enabled)
  | { kind: 'how_it_works'; steps: Array<{ title: string; body: string }> }
  | { kind: 'faq'; items: Array<{ q: string; a: string }> }
  | { kind: 'quote'; text: string; attribution?: string }   // NUNCA depoimento inventado

export interface LandingPage {
  id: string
  slug: string
  name: string
  status: LandingPageStatus
  persona: string | null
  pain: string | null
  headline: string | null
  subheadline: string | null
  cta_label: string | null
  sections: LandingSection[]
  meta_title: string | null
  meta_description: string | null
  noindex: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type MetricLevel = 'campaign' | 'ad_set' | 'ad'
export type MetricSource = 'manual' | 'csv' | 'api'

export interface AdMetricDaily {
  id: string
  metric_date: string           // YYYY-MM-DD
  level: MetricLevel
  entity_id: string
  channel_slug: string | null
  impressions: number
  reach: number | null
  clicks: number
  spend_cents: number
  platform_leads: number | null
  source: MetricSource
  raw: Record<string, unknown>
  created_at: string
}

export type AcquisitionEventType =
  | 'lp_view'
  | 'lp_cta_click'
  | 'signup'
  | 'first_generation'
  | 'project_created'
  | 'checkout_started'
  | 'subscription_started'
  | 'subscription_renewed'
  | 'subscription_canceled'
  // Funil completo (migration 20260818000000; catálogo em lib/analytics/events.ts —
  // signup_completed/subscription_cancelled são ALIASES dos nomes legados acima).
  | 'landing_view'
  | 'cta_clicked'
  | 'plans_viewed'
  | 'signup_started'
  | 'onboarding_completed'
  | 'image_uploaded'
  | 'generation_started'
  | 'generation_completed'
  | 'generation_failed'
  | 'result_approved'
  | 'result_rejected'
  | 'result_downloaded'
  | 'checkout_completed'

export interface AcquisitionEvent {
  id: string
  user_id: string | null
  event_type: AcquisitionEventType
  utm: Record<string, unknown>
  ad_identifier: string | null
  campaign_identifier: string | null
  landing_page_id: string | null
  referrer: string | null
  plan_id: string | null
  value_cents: number | null
  metadata: Record<string, unknown>
  // Colunas do funil completo (migration 20260818000000)
  anonymous_id: string | null
  page: string | null
  offer_id: string | null
  dedupe_key: string | null
  created_at: string
}

export type ExperimentPrimaryMetric =
  | 'ctr' | 'cpc' | 'cpm' | 'cpa_signup' | 'cac' | 'roas' | 'lp_conversion'

/** Célula da matriz de experimentação. */
export interface ExperimentMatrix {
  persona?: string
  pain?: string
  promise?: string
  format?: string
  creative?: string
  copy?: string
  cta?: string
  landing_page?: string
  channel?: string
  funnel_stage?: string
}

export interface AdExperiment {
  id: string
  name: string
  hypothesis: string
  matrix: ExperimentMatrix
  campaign_id: string | null
  ad_ids: string[]
  primary_metric: ExperimentPrimaryMetric
  success_criteria: string | null
  status: ExperimentStatus
  conclusion: string | null
  next_action: string | null
  started_at: string | null
  ended_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ActionType =
  | 'publish_campaign' | 'activate' | 'pause' | 'resume'
  | 'increase_budget' | 'decrease_budget' | 'edit_targeting'
  | 'archive_campaign' | 'other'

export type ActionEntityLevel = 'campaign' | 'ad_set' | 'ad'

export interface AdPendingAction {
  id: string
  action_type: ActionType
  entity_level: ActionEntityLevel
  entity_id: string
  payload: Record<string, unknown>
  reason: string | null
  status: ActionStatus
  requested_by: string | null
  decided_by: string | null
  decided_at: string | null
  decision_notes: string | null
  executed_at: string | null
  execution_result: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertEntityLevel = 'campaign' | 'ad_set' | 'ad' | 'landing_page' | 'system'

export interface AdAlert {
  id: string
  alert_type: string
  severity: AlertSeverity
  entity_level: AlertEntityLevel | null
  entity_id: string | null
  message: string
  data: Record<string, unknown>
  status: AlertStatus
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface AdReport {
  id: string
  period_start: string
  period_end: string
  title: string
  summary_md: string
  data: Record<string, unknown>
  status: 'draft' | 'final'
  created_by: string | null
  created_at: string
}

// ── Agregados de leitura (painel/relatório) ────────────────────────────────────

/** Funil consolidado de um recorte (período e/ou campanha). */
export interface FunnelSnapshot {
  totals: RawTotals
  derived: DerivedMetrics
  /** Recorte temporal usado. */
  period_start: string
  period_end: string
}

export interface CampaignWithStats extends AdCampaign {
  totals: RawTotals
  derived: DerivedMetrics
  ads_count: number
}

export interface AdWithStats extends Ad {
  totals: RawTotals
  derived: DerivedMetrics
}

export interface AdsDashboardData {
  funnel: FunnelSnapshot
  campaigns: CampaignWithStats[]
  openAlerts: AdAlert[]
  pendingActions: AdPendingAction[]
  runningExperiments: AdExperiment[]
  latestReport: AdReport | null
  /** Aviso quando o schema marketing ainda não foi aplicado/exposto. */
  degraded?: string
}

// ── Contrato do gerador de briefs de anúncio (IA) ──────────────────────────────

/** Saída estruturada do gerador (lib/marketing/ads/generation.ts). Sempre entra
 *  como rascunho — revisão humana obrigatória. */
export interface GeneratedAdBrief {
  hypothesis: string
  audience: string
  funnel_stage: string
  concept: string
  script: string
  primary_text: string        // 1ª linha ≤125 chars visíveis; total ~300
  headline: string            // ≤ 40 chars
  description: string         // ≤ 30 chars
  cta_button: string          // SIGN_UP | LEARN_MORE
  visual_direction: string
  format: string
  utm_content_hint: string    // sugestão de sufixo CRIATIVO/COPY do identificador
  success_criteria: string
  risk_flags: string[]
}

// ════════════════════════════════════════════════════════════════════════════
// CONTRATO DO SERVICE (lib/marketing/ads/service.ts)
//
// Implementação obrigatória — todas server-only, recebendo o admin client
// (service role) autorizado por getMarketingStaffContext, acessando o banco
// via admin.schema('marketing'), lançando Error com mensagem PT-BR em
// validação/fluxo (vira 400 no errorResponse). Transições de status passam
// pelos asserts de ./workflow.ts. Paginação por limit fixo (≤500).
//
//   Canais/públicos:
//     listChannels(admin): Promise<AdChannel[]>
//     listAudiences(admin): Promise<AdAudience[]>
//     createAudience(admin, input, userId): Promise<AdAudience>
//
//   Campanhas:
//     listCampaigns(admin, filters?: { status?; channel?; front? }): Promise<AdCampaign[]>
//     getCampaign(admin, id): Promise<AdCampaign>
//     createCampaign(admin, input: CreateCampaignInput, userId): Promise<AdCampaign>
//     updateCampaign(admin, id, patch): Promise<AdCampaign>        // allowlist; sem status
//     advanceCampaign(admin, id, to, opts?: { approvedActionId? }): Promise<void>
//        → assertCampaignTransition; se transitionRequiresApproval(from,to),
//          exige opts.approvedActionId apontando para ad_pending_actions com
//          status 'approved' e entity_id = id (senão Error).
//
//   Conjuntos:
//     listAdSets(admin, campaignId): Promise<AdSet[]>
//     createAdSet(admin, input, userId?): Promise<AdSet>
//
//   Anúncios:
//     listAds(admin, filters?: { campaignId?; status? }): Promise<Ad[]>
//     getAd(admin, id): Promise<Ad>
//     createAd(admin, input: CreateAdInput, userId): Promise<Ad>
//        → gera identifier via naming.buildIdentifier + sufixos, monta utm via
//          naming.buildUtmParams, destination_url via appendUtmToUrl.
//     updateAd(admin, id, patch): Promise<Ad>                      // allowlist; editável só draft/ready_for_review
//     advanceAd(admin, id, to, opts?: { approvedActionId? }): Promise<void>
//     runAdBrandCheck(admin, adId, userId): Promise<BrandCheckResult>  // reusa ../brand-check
//
//   Landing pages:
//     listLandingPages(admin): Promise<LandingPage[]>
//     getLandingPageBySlug(admin, slug, opts?: { publishedOnly?: boolean }): Promise<LandingPage | null>
//     createLandingPage(admin, input, userId): Promise<LandingPage>
//     updateLandingPage(admin, id, patch): Promise<LandingPage>
//
//   Métricas:
//     upsertDailyMetrics(admin, rows: MetricUpsertRow[]): Promise<{ upserted: number }>
//        → upsert por (metric_date, level, entity_id); valida números ≥ 0.
//     getFunnelSnapshot(admin, opts: { periodStart; periodEnd; campaignId? }): Promise<FunnelSnapshot>
//        → agrega ad_metrics_daily + acquisition_events; ativação computada de
//          acquisition_events.first_generation QUANDO houver, senão via join
//          nas tabelas de produto (renders/vistas por user_id dos signups).
//     getCampaignsWithStats(admin, opts): Promise<CampaignWithStats[]>
//     getAdsWithStats(admin, campaignId, opts): Promise<AdWithStats[]>
//     getAdsDashboardData(admin): Promise<AdsDashboardData>
//        → best-effort: se o schema não estiver aplicado/exposto (PostgREST
//          406/42P01), devolve estrutura vazia com `degraded` preenchido em
//          vez de lançar.
//
//   Experimentos:
//     listExperiments(admin, filters?): Promise<AdExperiment[]>
//     createExperiment(admin, input, userId): Promise<AdExperiment>
//     updateExperiment(admin, id, patch): Promise<AdExperiment>
//        → status via assertExperimentTransition; concluir em validated/
//          invalidated exige conclusion não-vazia.
//
//   Aprovação:
//     listPendingActions(admin, filters?: { status? }): Promise<AdPendingAction[]>
//     requestAction(admin, input: RequestActionInput, requestedBy: string | null): Promise<AdPendingAction>
//     decideAction(admin, actionId, deciderId, decision: 'approved'|'rejected', notes?): Promise<AdPendingAction>
//     markActionExecuted(admin, actionId, result): Promise<void>
//
//   Alertas:
//     listAlerts(admin, filters?: { status? }): Promise<AdAlert[]>
//     createAlerts(admin, alerts: NewAlert[]): Promise<number>     // dedupe: não recria alerta open igual
//     setAlertStatus(admin, id, status: AlertStatus): Promise<void>
//
//   Relatórios:
//     listReports(admin, limit?): Promise<AdReport[]>
//     saveReport(admin, report: NewReport, userId: string | null): Promise<AdReport>
//
//   Eventos de aquisição (server-only, best-effort — NUNCA lançam para o caller
//   de produto; capturam erro e console.warn):
//     recordAcquisitionEvent(admin, event: NewAcquisitionEvent): Promise<void>
//     bindSignupAttribution(admin, userId, snapshot: AttributionSnapshot | null, meta?): Promise<void>
//        → insert on conflict do nothing (índice parcial uq_mkt_acq_signup_per_user).
// ════════════════════════════════════════════════════════════════════════════

export interface CreateCampaignInput {
  name: string
  channel_slug: string
  front: CampaignFront
  objective: CampaignObjective
  funnel_stage: FunnelStage
  persona: string               // segmento do identificador
  hypothesis?: string | null
  daily_budget_cents?: number | null
  lifetime_budget_cents?: number | null
  notes?: string | null
}

export interface CreateAdSetInput {
  campaign_id: string
  name: string
  audience_id?: string | null
  audience_segment?: string | null   // segmento do identificador (PUBLICO)
  daily_budget_cents?: number | null
  targeting_summary?: string | null
}

export interface CreateAdInput {
  campaign_id: string
  ad_set_id?: string | null
  brief_id?: string | null
  persona?: string | null
  pain?: string | null
  promise?: string | null
  format?: string | null
  creative_label?: string | null     // VIDEO01…
  copy_variant?: string | null       // COPY01…
  primary_text?: string | null
  headline?: string | null
  description?: string | null
  cta_button?: string | null
  landing_page_id?: string | null
  /** Caminho de destino (ex.: /lp/render-em-minutos ou /login?mode=signup). */
  destination_path?: string | null
}

export interface CreateLandingPageInput {
  slug: string
  name: string
  persona?: string | null
  pain?: string | null
  headline?: string | null
  subheadline?: string | null
  cta_label?: string | null
  sections?: LandingSection[]
  meta_title?: string | null
  meta_description?: string | null
}

export interface MetricUpsertRow {
  metric_date: string
  level: MetricLevel
  entity_id: string
  channel_slug?: string | null
  impressions?: number
  reach?: number | null
  clicks?: number
  spend_cents?: number
  platform_leads?: number | null
  source?: MetricSource
  raw?: Record<string, unknown>
}

export interface RequestActionInput {
  action_type: ActionType
  entity_level: ActionEntityLevel
  entity_id: string
  payload?: Record<string, unknown>
  reason?: string | null
}

export interface NewAlert {
  alert_type: string
  severity: AlertSeverity
  entity_level?: AlertEntityLevel | null
  entity_id?: string | null
  message: string
  data?: Record<string, unknown>
}

export interface NewReport {
  period_start: string
  period_end: string
  title: string
  summary_md: string
  data: Record<string, unknown>
  status?: 'draft' | 'final'
}

export interface NewAcquisitionEvent {
  user_id?: string | null
  event_type: AcquisitionEventType
  utm?: Record<string, unknown>
  ad_identifier?: string | null
  campaign_identifier?: string | null
  landing_page_id?: string | null
  referrer?: string | null
  plan_id?: string | null
  value_cents?: number | null
  metadata?: Record<string, unknown>
  // Colunas do funil completo (migration 20260818000000)
  anonymous_id?: string | null
  page?: string | null
  offer_id?: string | null
  /** Idempotência server-side (índice único parcial — 23505 = já gravado). */
  dedupe_key?: string | null
}
