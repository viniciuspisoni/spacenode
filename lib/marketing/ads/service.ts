// lib/marketing/ads/service.ts
//
// Serviços do sistema de aquisição/tráfego pago (schema marketing.ad_*).
// Server-only — mesmo desenho de lib/marketing/service.ts: todas as funções
// recebem o admin client (service role) já autorizado pelo gate de staff
// (lib/marketing/auth.ts); a autorização acontece ANTES, nas rotas/páginas.
// Transições de status passam SEMPRE pelos asserts de ./workflow.ts.
//
// REGRA DURA (docs/marketing/prohibited-content.md §7): as transições
// published_paused→active e paused→active mexem em gasto real e exigem uma
// ad_pending_action com status 'approved' apontando para a entidade — o
// sistema recomenda; a ativação é decisão humana. Ver requireApprovedAction.
//
// Sem transações (REST): operações compostas são sequenciais com verificação
// prévia — escala de painel interno, não de produto.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertAdTransition,
  assertActionTransition,
  assertCampaignTransition,
  assertExperimentTransition,
  isAlertStatus,
  isExperimentStatus,
  transitionRequiresApproval,
  type ActionStatus,
  type AdStatus,
  type AlertStatus,
  type CampaignStatus,
  type ExperimentStatus,
} from './workflow'
import {
  appendUtmToUrl,
  buildIdentifier,
  buildUtmParams,
  parseIdentifier,
  sanitizeSegment,
  type AttributionSnapshot,
  type UtmParams,
} from './naming'
import {
  computeDerivedMetrics,
  EMPTY_TOTALS,
  type RawTotals,
} from './metrics'
import {
  runBrandCheck,
  toBrandCheckRules,
  type BrandCheckIssue,
  type BrandCheckResult,
} from '../brand-check'
import { getBrandRules, recordAutomationRun } from '../service'
import type {
  Ad,
  AdAlert,
  AdAudience,
  AdCampaign,
  AdChannel,
  AdExperiment,
  AdPendingAction,
  AdReport,
  AdSet,
  AdsDashboardData,
  AdWithStats,
  CampaignFront,
  CampaignObjective,
  CampaignWithStats,
  CreateAdInput,
  CreateAdSetInput,
  CreateCampaignInput,
  CreateLandingPageInput,
  FunnelSnapshot,
  FunnelStage,
  LandingPage,
  LandingPageStatus,
  MetricLevel,
  MetricUpsertRow,
  NewAcquisitionEvent,
  NewAlert,
  NewReport,
  RequestActionInput,
} from './types'
import type { CsvRowError, ParsedMetricRow } from './csv'

// PostgREST só aceita .schema() para schemas expostos — ver header da migration
// 20260718000000_marketing_ads_schema.sql (passo de deploy: expor `marketing`).
function mkt(admin: SupabaseClient) {
  return admin.schema('marketing')
}

function must<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`)
  if (res.data === null || res.data === undefined) throw new Error(`${ctx}: não encontrado`)
  return res.data
}

const LIST_LIMIT = 300
const METRICS_FETCH_LIMIT = 10000
const EVENTS_FETCH_LIMIT = 10000
// Limite do join de ativação com tabelas de produto (renders/vistas).
const ACTIVATION_USER_CAP = 500

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Valores aceitos das dimensões (espelham os CHECKs da migration).
const CAMPAIGN_FRONTS: readonly CampaignFront[] = ['problema', 'demonstracao', 'produto', 'conversao']
const CAMPAIGN_OBJECTIVES: readonly CampaignObjective[] = ['prospeccao', 'demonstracao', 'conversao', 'remarketing', 'reconhecimento']
const FUNNEL_STAGES: readonly FunnelStage[] = ['topo', 'meio', 'fundo', 'remarketing']
const METRIC_LEVELS: readonly MetricLevel[] = ['campaign', 'ad_set', 'ad']
const METRIC_SOURCES = ['manual', 'csv', 'api'] as const
const LANDING_STATUSES: readonly LandingPageStatus[] = ['draft', 'published', 'archived']
const ACTION_TYPES = [
  'publish_campaign', 'activate', 'pause', 'resume', 'increase_budget',
  'decrease_budget', 'edit_targeting', 'archive_campaign', 'other',
] as const
const ACTION_ENTITY_LEVELS = ['campaign', 'ad_set', 'ad'] as const
const EXPERIMENT_METRICS = ['ctr', 'cpc', 'cpm', 'cpa_signup', 'cac', 'roas', 'lp_conversion'] as const

/** Segmento do identificador por slug de canal (SN_{CANAL}_…). */
const CHANNEL_IDENTIFIER_SEGMENT: Record<string, string> = {
  meta: 'META',
  google_ads: 'GOOGLE',
  instagram: 'IG',
  linkedin_ads: 'LINKEDIN',
  tiktok_ads: 'TIKTOK',
}

/** Fuso da conta de anúncios (America/Sao_Paulo, sem DST desde 2019).
 *  metric_date é o dia NESTE fuso — as janelas de eventos (created_at, UTC)
 *  precisam do mesmo recorte para gasto e conversões não descasarem na borda. */
export const ADS_TZ_OFFSET = '-03:00'
const ADS_TZ_OFFSET_MS = 3 * 3_600_000

/** Dia (YYYY-MM-DD) no fuso da conta de anúncios. */
function isoDate(d: Date): string {
  return new Date(d.getTime() - ADS_TZ_OFFSET_MS).toISOString().slice(0, 10)
}

/** Janela [início, fim] de um período date-only no fuso da conta de anúncios. */
export function eventWindow(periodStart: string, periodEnd: string): { from: string; to: string } {
  return {
    from: `${periodStart}T00:00:00.000${ADS_TZ_OFFSET}`,
    to: `${periodEnd}T23:59:59.999${ADS_TZ_OFFSET}`,
  }
}

export interface StatsPeriodOpts {
  periodStart: string
  periodEnd: string
}

/** Recorte padrão do painel: últimos 30 dias (inclusive hoje). */
export function last30DaysPeriod(): StatsPeriodOpts {
  const end = new Date()
  const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000)
  return { periodStart: isoDate(start), periodEnd: isoDate(end) }
}

// ════════════════════════════════════════════════════════════════════════════
// Canais e públicos
// ════════════════════════════════════════════════════════════════════════════

export async function listChannels(admin: SupabaseClient): Promise<AdChannel[]> {
  const { data, error } = await mkt(admin).from('ad_channels').select('*').order('name').limit(LIST_LIMIT)
  if (error) throw new Error(`Falha ao listar canais: ${error.message}`)
  return (data ?? []) as AdChannel[]
}

export async function listAudiences(admin: SupabaseClient): Promise<AdAudience[]> {
  const { data, error } = await mkt(admin).from('ad_audiences').select('*').order('name').limit(LIST_LIMIT)
  if (error) throw new Error(`Falha ao listar públicos: ${error.message}`)
  return (data ?? []) as AdAudience[]
}

export interface CreateAudienceInput {
  slug: string
  name: string
  description?: string | null
  pains?: string[]
  tools?: string[]
  targeting?: Record<string, unknown>
}

export async function createAudience(
  admin: SupabaseClient,
  input: CreateAudienceInput,
  _userId: string,
): Promise<AdAudience> {
  void _userId // ad_audiences não tem created_by — parâmetro mantido pelo contrato
  const slug = input.slug?.trim().toLowerCase()
  const name = input.name?.trim()
  if (!name) throw new Error('Nome do público é obrigatório')
  if (!slug || !/^[a-z0-9_-]+$/.test(slug)) {
    throw new Error('Slug inválido — use apenas letras minúsculas, números, hífen e underscore')
  }
  if (input.pains && !input.pains.every(p => typeof p === 'string')) {
    throw new Error('pains deve ser uma lista de textos')
  }
  if (input.tools && !input.tools.every(t => typeof t === 'string')) {
    throw new Error('tools deve ser uma lista de textos')
  }

  const existing = await mkt(admin).from('ad_audiences').select('id').eq('slug', slug).maybeSingle()
  if (existing.error) throw new Error(`Falha ao verificar público: ${existing.error.message}`)
  if (existing.data) throw new Error(`Já existe um público com o slug "${slug}"`)

  const res = await mkt(admin)
    .from('ad_audiences')
    .insert({
      slug,
      name,
      description: input.description ?? null,
      pains: input.pains ?? [],
      tools: input.tools ?? [],
      targeting: input.targeting ?? {},
    })
    .select('*')
    .single()
  return must(res, 'Falha ao criar público') as AdAudience
}

// ════════════════════════════════════════════════════════════════════════════
// Campanhas
// ════════════════════════════════════════════════════════════════════════════

export interface CampaignFilters {
  status?: CampaignStatus
  channel?: string
  front?: string
}

export async function listCampaigns(
  admin: SupabaseClient,
  filters: CampaignFilters = {},
): Promise<AdCampaign[]> {
  let q = mkt(admin).from('ad_campaigns').select('*').order('updated_at', { ascending: false }).limit(LIST_LIMIT)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.channel) q = q.eq('channel_slug', filters.channel)
  if (filters.front) q = q.eq('front', filters.front)
  const { data, error } = await q
  if (error) throw new Error(`Falha ao listar campanhas: ${error.message}`)
  return (data ?? []) as AdCampaign[]
}

export async function getCampaign(admin: SupabaseClient, id: string): Promise<AdCampaign> {
  const res = await mkt(admin).from('ad_campaigns').select('*').eq('id', id).maybeSingle()
  return must(res, 'Campanha') as AdCampaign
}

export async function createCampaign(
  admin: SupabaseClient,
  input: CreateCampaignInput,
  userId: string,
): Promise<AdCampaign> {
  const name = input.name?.trim()
  if (!name) throw new Error('Nome da campanha é obrigatório')
  if (!input.persona?.trim()) throw new Error('Persona é obrigatória (segmento do identificador)')
  if (!CAMPAIGN_FRONTS.includes(input.front)) throw new Error('Frente estratégica inválida')
  if (!CAMPAIGN_OBJECTIVES.includes(input.objective)) throw new Error('Objetivo inválido')
  if (!FUNNEL_STAGES.includes(input.funnel_stage)) throw new Error('Estágio de funil inválido')
  if (input.daily_budget_cents != null && (!Number.isInteger(input.daily_budget_cents) || input.daily_budget_cents < 0)) {
    throw new Error('Orçamento diário inválido (centavos, inteiro ≥ 0)')
  }
  if (input.lifetime_budget_cents != null && (!Number.isInteger(input.lifetime_budget_cents) || input.lifetime_budget_cents < 0)) {
    throw new Error('Orçamento total inválido (centavos, inteiro ≥ 0)')
  }

  // Canal precisa existir e estar habilitado para planejamento no painel.
  const channel = must(
    await mkt(admin).from('ad_channels').select('slug, name, status').eq('slug', input.channel_slug).maybeSingle(),
    'Canal',
  ) as Pick<AdChannel, 'slug' | 'name' | 'status'>
  if (channel.status !== 'enabled') {
    throw new Error(`Canal "${channel.name}" ainda não está habilitado para campanhas`)
  }

  const channelSegment = CHANNEL_IDENTIFIER_SEGMENT[channel.slug] ?? sanitizeSegment(channel.slug)
  const identifier = buildIdentifier({
    channel: channelSegment,
    objective: input.objective,
    persona: input.persona,
  })

  await assertIdentifierAvailable(admin, identifier, 'varie objetivo ou persona')

  const res = await mkt(admin)
    .from('ad_campaigns')
    .insert({
      name,
      identifier,
      channel_slug: channel.slug,
      front: input.front,
      objective: input.objective,
      funnel_stage: input.funnel_stage,
      hypothesis: input.hypothesis ?? null,
      daily_budget_cents: input.daily_budget_cents ?? null,
      lifetime_budget_cents: input.lifetime_budget_cents ?? null,
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  return must(res, 'Falha ao criar campanha') as AdCampaign
}

/** Campos livres da campanha. Dimensões do identificador (canal/objetivo/
 *  persona/frente/estágio) são imutáveis — mudar a célula da matriz é criar
 *  outra campanha. Status NUNCA muda aqui — só via advanceCampaign. */
const CAMPAIGN_EDITABLE = [
  'name', 'hypothesis', 'daily_budget_cents', 'lifetime_budget_cents',
  'start_at', 'end_at', 'external_id', 'notes',
] as const

export async function updateCampaign(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<AdCampaign> {
  const update: Record<string, unknown> = {}
  for (const key of CAMPAIGN_EDITABLE) {
    if (key in patch) update[key] = patch[key]
  }
  if (Object.keys(update).length === 0) throw new Error('Nada para atualizar')

  const res = await mkt(admin)
    .from('ad_campaigns')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  return must(res, 'Falha ao atualizar campanha') as AdCampaign
}

/** Destino padrão de anúncio sem landing page vinculada. */
const DEFAULT_DESTINATION = '/login?mode=signup'

/** Identificador é chave de atribuição e do import de métricas — precisa ser
 *  único ENTRE níveis (resolveMetricIdentifiers recusa ambiguidade). */
async function assertIdentifierAvailable(
  admin: SupabaseClient,
  identifier: string,
  hint: string,
): Promise<void> {
  const [c, s, a] = await Promise.all([
    mkt(admin).from('ad_campaigns').select('id').eq('identifier', identifier).maybeSingle(),
    mkt(admin).from('ad_sets').select('id').eq('identifier', identifier).maybeSingle(),
    mkt(admin).from('ads').select('id').eq('identifier', identifier).maybeSingle(),
  ])
  for (const r of [c, s, a]) {
    if (r.error) throw new Error(`Falha ao verificar identificador: ${r.error.message}`)
  }
  if (c.data || s.data || a.data) {
    throw new Error(`O identificador ${identifier} já existe (campanha, conjunto ou anúncio) — ${hint}`)
  }
}

/** Tipos de ação compatíveis com o status de destino — aprovação dada para
 *  pausar NUNCA pode autorizar ativação (auditoria fiel à intenção humana). */
function allowedActionTypesFor(to: string): readonly string[] | null {
  if (to === 'active') return ['activate', 'resume']
  if (to === 'published_paused') return ['publish_campaign']
  if (to === 'paused') return ['pause']
  return null // demais transições: qualquer tipo, se uma ação for referenciada
}

/** Exige uma ad_pending_action APROVADA apontando exatamente para a entidade
 *  da transição, com action_type compatível — é a tranca que impede o sistema
 *  de ativar gasto sozinho (e de reaproveitar aprovação de intenção oposta). */
async function requireApprovedAction(
  admin: SupabaseClient,
  approvedActionId: string | undefined,
  entityLevel: 'campaign' | 'ad',
  entityId: string,
  allowedTypes: readonly string[] | null,
): Promise<AdPendingAction> {
  if (!approvedActionId) {
    throw new Error('Ativar veiculação exige uma ação aprovada (approved_action_id) — o sistema nunca ativa gasto sozinho')
  }
  const action = must(
    await mkt(admin).from('ad_pending_actions').select('*').eq('id', approvedActionId).maybeSingle(),
    'Ação de aprovação',
  ) as AdPendingAction
  if (action.status !== 'approved') {
    throw new Error(`A ação informada não está aprovada (status atual: ${action.status})`)
  }
  if (action.entity_level !== entityLevel || action.entity_id !== entityId) {
    throw new Error('A ação aprovada não corresponde à entidade desta transição')
  }
  if (allowedTypes && !allowedTypes.includes(action.action_type)) {
    throw new Error(
      `A ação aprovada é do tipo "${action.action_type}" — esta transição exige uma ação ${allowedTypes.map(t => `'${t}'`).join(' ou ')}`,
    )
  }
  return action
}

/** Consome a aprovação de forma condicional (status ainda 'approved') ANTES de
 *  mudar o status da entidade — a ação nunca sobrevive como token reutilizável.
 *  Falha fechada: no pior caso uma aprovação é queimada e o humano reaprova. */
async function consumeApprovedAction(
  admin: SupabaseClient,
  actionId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await mkt(admin)
    .from('ad_pending_actions')
    .update({ status: 'executed', executed_at: new Date().toISOString(), execution_result: result })
    .eq('id', actionId)
    .eq('status', 'approved')
    .select('id')
  if (error) throw new Error(`Falha ao consumir a ação aprovada: ${error.message}`)
  if (!data?.length) throw new Error('A ação aprovada já foi consumida — solicite nova aprovação')
}

/** Compensação best-effort quando o update da entidade falha após o consumo —
 *  volta a ação para 'approved' fora da máquina de status (uso interno). */
async function revertConsumedAction(admin: SupabaseClient, actionId: string): Promise<void> {
  const { error } = await mkt(admin)
    .from('ad_pending_actions')
    .update({ status: 'approved', executed_at: null, execution_result: null })
    .eq('id', actionId)
  if (error) console.warn(`[marketing/ads] falha ao reverter ação ${actionId}: ${error.message}`)
}

export async function advanceCampaign(
  admin: SupabaseClient,
  id: string,
  to: CampaignStatus,
  opts: { approvedActionId?: string } = {},
): Promise<void> {
  const campaign = await getCampaign(admin, id)
  assertCampaignTransition(campaign.status, to)

  // Ativação exige aprovação; nas demais transições uma ação referenciada
  // explicitamente também é validada e consumida (auditoria completa).
  let action: AdPendingAction | null = null
  if (transitionRequiresApproval(campaign.status, to) || opts.approvedActionId) {
    action = await requireApprovedAction(admin, opts.approvedActionId, 'campaign', id, allowedActionTypesFor(to))
  }

  const transition = `${campaign.status}→${to}`
  if (action) {
    await consumeApprovedAction(admin, action.id, { transition, entity_level: 'campaign', entity_id: id })
  }

  const { error } = await mkt(admin).from('ad_campaigns').update({ status: to }).eq('id', id)
  if (error) {
    if (action) await revertConsumedAction(admin, action.id)
    throw new Error(`Falha ao mudar status da campanha: ${error.message}`)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Conjuntos de anúncios
// ════════════════════════════════════════════════════════════════════════════

export async function listAdSets(admin: SupabaseClient, campaignId: string): Promise<AdSet[]> {
  const { data, error } = await mkt(admin)
    .from('ad_sets')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (error) throw new Error(`Falha ao listar conjuntos: ${error.message}`)
  return (data ?? []) as AdSet[]
}

export async function createAdSet(
  admin: SupabaseClient,
  input: CreateAdSetInput,
  _userId?: string,
): Promise<AdSet> {
  void _userId // ad_sets não tem created_by — parâmetro mantido pelo contrato
  const name = input.name?.trim()
  if (!name) throw new Error('Nome do conjunto é obrigatório')
  if (input.daily_budget_cents != null && (!Number.isInteger(input.daily_budget_cents) || input.daily_budget_cents < 0)) {
    throw new Error('Orçamento diário inválido (centavos, inteiro ≥ 0)')
  }

  const campaign = await getCampaign(admin, input.campaign_id)

  // Segmento PUBLICO do identificador: explícito, ou derivado do público vinculado.
  let segment = input.audience_segment?.trim() ?? ''
  if (!segment && input.audience_id) {
    const audience = must(
      await mkt(admin).from('ad_audiences').select('slug').eq('id', input.audience_id).maybeSingle(),
      'Público',
    ) as { slug: string }
    segment = audience.slug
  }
  if (!sanitizeSegment(segment)) {
    throw new Error('Informe o público (audience_segment ou audience_id) para compor o identificador')
  }

  const identifier = `${campaign.identifier}_${sanitizeSegment(segment)}`
  await assertIdentifierAvailable(admin, identifier, 'varie o público')

  const res = await mkt(admin)
    .from('ad_sets')
    .insert({
      campaign_id: campaign.id,
      name,
      identifier,
      audience_id: input.audience_id ?? null,
      daily_budget_cents: input.daily_budget_cents ?? null,
      targeting_summary: input.targeting_summary ?? null,
    })
    .select('*')
    .single()
  return must(res, 'Falha ao criar conjunto') as AdSet
}

// ════════════════════════════════════════════════════════════════════════════
// Anúncios
// ════════════════════════════════════════════════════════════════════════════

export interface AdFilters {
  campaignId?: string
  status?: AdStatus
}

export async function listAds(admin: SupabaseClient, filters: AdFilters = {}): Promise<Ad[]> {
  let q = mkt(admin).from('ads').select('*').order('updated_at', { ascending: false }).limit(LIST_LIMIT)
  if (filters.campaignId) q = q.eq('campaign_id', filters.campaignId)
  if (filters.status) q = q.eq('status', filters.status)
  const { data, error } = await q
  if (error) throw new Error(`Falha ao listar anúncios: ${error.message}`)
  return (data ?? []) as Ad[]
}

export async function getAd(admin: SupabaseClient, id: string): Promise<Ad> {
  const res = await mkt(admin).from('ads').select('*').eq('id', id).maybeSingle()
  return must(res, 'Anúncio') as Ad
}

export async function createAd(
  admin: SupabaseClient,
  input: CreateAdInput,
  userId: string,
): Promise<Ad> {
  const campaign = await getCampaign(admin, input.campaign_id)

  if (input.ad_set_id) {
    const set = must(
      await mkt(admin).from('ad_sets').select('id, campaign_id').eq('id', input.ad_set_id).maybeSingle(),
      'Conjunto',
    ) as { id: string; campaign_id: string }
    if (set.campaign_id !== campaign.id) {
      throw new Error('O conjunto informado pertence a outra campanha')
    }
  }

  // Identificador do anúncio = campanha + PROMESSA_CRIATIVO_COPY (6 segmentos).
  const parsed = parseIdentifier(campaign.identifier)
  if (!parsed) throw new Error(`Identificador da campanha fora da convenção: ${campaign.identifier}`)
  const identifier = buildIdentifier({
    channel: parsed.channel,
    objective: parsed.objective,
    persona: parsed.persona,
    promise: input.promise ?? undefined,
    creative: input.creative_label ?? undefined,
    copy: input.copy_variant ?? undefined,
  })

  // Sem nenhum segmento distintivo o identificador ficaria IGUAL ao da
  // campanha — ambíguo para atribuição e para o import de métricas por
  // identificador (resolveMetricIdentifiers recusa ambiguidade).
  if (identifier === campaign.identifier) {
    throw new Error('Anúncio precisa de pelo menos um segmento distintivo (promessa, criativo ou copy)')
  }
  await assertIdentifierAvailable(admin, identifier, 'varie promessa, criativo ou copy')

  // Destino: caminho explícito > landing page vinculada > cadastro direto.
  let destinationPath = input.destination_path?.trim() || null
  if (!destinationPath && input.landing_page_id) {
    const lp = must(
      await mkt(admin).from('landing_pages').select('slug').eq('id', input.landing_page_id).maybeSingle(),
      'Landing page',
    ) as { slug: string }
    destinationPath = `/lp/${lp.slug}`
  }
  if (!destinationPath) destinationPath = DEFAULT_DESTINATION

  const utm = buildUtmParams({
    channelSlug: campaign.channel_slug,
    campaignIdentifier: campaign.identifier,
    adIdentifier: identifier,
    objective: campaign.objective,
    persona: input.persona ?? parsed.persona,
  })
  const destinationUrl = appendUtmToUrl(destinationPath, utm)

  const res = await mkt(admin)
    .from('ads')
    .insert({
      campaign_id: campaign.id,
      ad_set_id: input.ad_set_id ?? null,
      brief_id: input.brief_id ?? null,
      identifier,
      persona: input.persona ?? null,
      pain: input.pain ?? null,
      promise: input.promise ?? null,
      format: input.format ?? null,
      creative_label: input.creative_label ?? null,
      copy_variant: input.copy_variant ?? null,
      primary_text: input.primary_text ?? null,
      headline: input.headline ?? null,
      description: input.description ?? null,
      cta_button: input.cta_button ?? null,
      landing_page_id: input.landing_page_id ?? null,
      destination_url: destinationUrl,
      utm,
      created_by: userId,
    })
    .select('*')
    .single()
  return must(res, 'Falha ao criar anúncio') as Ad
}

/** Campos editáveis do anúncio. promise/creative_label/copy_variant ficam de
 *  fora de propósito: são segmentos do identificador (chave de atribuição) —
 *  variar a célula da matriz é criar outro anúncio. */
const AD_EDITABLE = [
  'ad_set_id', 'persona', 'pain', 'format', 'primary_text', 'headline',
  'description', 'cta_button', 'external_id',
] as const

export async function updateAd(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<Ad> {
  const current = await getAd(admin, id)
  if (current.status !== 'draft' && current.status !== 'ready_for_review') {
    throw new Error(`Anúncio em "${current.status}" não é editável — apenas rascunho e pronto para revisão`)
  }

  const update: Record<string, unknown> = {}
  for (const key of AD_EDITABLE) {
    if (key in patch) update[key] = patch[key]
  }

  // Destino: mudar landing page ou caminho reconstrói a URL final com os UTMs
  // já gravados no anúncio (o utm é imutável — nasce do identificador).
  if ('landing_page_id' in patch || 'destination_path' in patch) {
    let path = typeof patch.destination_path === 'string' && patch.destination_path.trim()
      ? patch.destination_path.trim()
      : null
    if ('landing_page_id' in patch) {
      const lpId = patch.landing_page_id
      if (typeof lpId === 'string' && lpId) {
        const lp = must(
          await mkt(admin).from('landing_pages').select('slug').eq('id', lpId).maybeSingle(),
          'Landing page',
        ) as { slug: string }
        update.landing_page_id = lpId
        if (!path) path = `/lp/${lp.slug}`
      } else if (lpId === null) {
        update.landing_page_id = null
        // Desvincular a LP não pode deixar o anúncio apontando para ela:
        // sem caminho explícito, volta ao destino padrão (URL é reconstruída).
        if (!path) path = DEFAULT_DESTINATION
      }
    }
    if (path) {
      const utm = current.utm
      update.destination_url = utm.source && utm.medium && utm.campaign
        ? appendUtmToUrl(path, utm as UtmParams)
        : path
    }
  }

  if (Object.keys(update).length === 0) throw new Error('Nada para atualizar')

  const res = await mkt(admin)
    .from('ads')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  return must(res, 'Falha ao atualizar anúncio') as Ad
}

export async function advanceAd(
  admin: SupabaseClient,
  id: string,
  to: AdStatus,
  opts: { approvedActionId?: string } = {},
): Promise<void> {
  const ad = await getAd(admin, id)
  assertAdTransition(ad.status, to)

  let action: AdPendingAction | null = null
  if (transitionRequiresApproval(ad.status, to) || opts.approvedActionId) {
    action = await requireApprovedAction(admin, opts.approvedActionId, 'ad', id, allowedActionTypesFor(to))
  }

  const transition = `${ad.status}→${to}`
  if (action) {
    await consumeApprovedAction(admin, action.id, { transition, entity_level: 'ad', entity_id: id })
  }

  const { error } = await mkt(admin).from('ads').update({ status: to }).eq('id', id)
  if (error) {
    if (action) await revertConsumedAction(admin, action.id)
    throw new Error(`Falha ao mudar status do anúncio: ${error.message}`)
  }
}

// Espelham as constantes internas de ../brand-check.ts (não exportadas lá).
const BLOCKER_PENALTY = 25
const WARNING_PENALTY = 7
const MIN_APPROVED_SCORE = 80

/** Verificador de marca sobre a copy do anúncio, reusando ../brand-check com o
 *  mapeamento: headline→title, 1ª linha do primary_text→hook, primary_text→
 *  caption, description→central_message, platform fixa 'meta_ads'.
 *
 *  CTA: o verificador compara call_to_action com a lista ORGÂNICA
 *  (brand_rules.approved_ctas.organico) — botão de anúncio (SIGN_UP/
 *  LEARN_MORE) não está lá e geraria blocker falso. Então NÃO passamos
 *  call_to_action; validamos cta_button aqui contra
 *  approved_ctas.botoes_anuncio e ajustamos score/issues manualmente. */
export async function runAdBrandCheck(
  admin: SupabaseClient,
  adId: string,
  userId: string,
): Promise<BrandCheckResult> {
  const started = Date.now()
  const ad = await getAd(admin, adId)

  const rulesMap = await getBrandRules(admin).catch(() => ({}) as Record<string, unknown>)
  const rules = toBrandCheckRules(rulesMap)

  const primaryText = ad.primary_text ?? ''
  const base = runBrandCheck(
    {
      title: ad.headline,
      hook: primaryText.split(/\r?\n/)[0] ?? '',
      caption: primaryText,
      central_message: ad.description,
      platform: 'meta_ads',
      format: ad.format,
      target_audience: ad.persona,
    },
    rules,
  )

  // Remove o warning de CTA orgânico ausente (anúncio usa cta_button) e devolve
  // a penalidade correspondente ao score.
  const issues: BrandCheckIssue[] = base.issues.filter(i => i.code !== 'cta_missing')
  let score = base.score + (base.issues.length - issues.length) * WARNING_PENALTY

  // Validação própria do botão de anúncio (shape {organico, botoes_anuncio}
  // da seed 20260713000001_marketing_seed.sql).
  const ctasRow = (rulesMap['approved_ctas'] ?? {}) as Record<string, unknown>
  const rawButtons = ctasRow['botoes_anuncio']
  const approvedButtons = Array.isArray(rawButtons) && rawButtons.every(b => typeof b === 'string') && rawButtons.length > 0
    ? (rawButtons as string[])
    : ['SIGN_UP', 'LEARN_MORE']

  const ctaButton = (ad.cta_button ?? '').trim()
  const suggestions = [...base.suggestions]
  if (!ctaButton) {
    issues.push({
      severity: 'warning', code: 'cta_button_missing', field: 'CTA',
      message: 'Anúncio sem botão de CTA definido.',
    })
    score -= WARNING_PENALTY
  } else if (!approvedButtons.includes(ctaButton)) {
    issues.push({
      severity: 'blocker', code: 'cta_button_not_approved', field: 'CTA',
      message: `Botão de CTA "${ctaButton}" fora da lista aprovada (${approvedButtons.join(', ')}).`,
    })
    score -= BLOCKER_PENALTY
  }

  // Limite de descrição do anúncio (o verificador só cobre título ≤40).
  const description = (ad.description ?? '').trim()
  if (description.length > rules.limits.adDescriptionChars) {
    issues.push({
      severity: 'warning', code: 'ad_description_too_long', field: 'descrição',
      message: `Descrição com ${description.length} caracteres — anúncio Meta pede ≤${rules.limits.adDescriptionChars}.`,
    })
    score -= WARNING_PENALTY
  }

  score = Math.max(0, Math.min(100, score))
  const blockers = issues.filter(i => i.severity === 'blocker').length
  const approved = blockers === 0 && score >= MIN_APPROVED_SCORE
  if (!approved && suggestions.length === 0) {
    suggestions.push('Revise os pontos apontados e rode a verificação de novo antes de enviar para aprovação.')
  }
  const result: BrandCheckResult = { approved, score, issues, suggestions }

  const { error } = await mkt(admin)
    .from('ads')
    .update({ brand_check: { ...result, checked_at: new Date().toISOString() } })
    .eq('id', adId)
  if (error) throw new Error(`Falha ao salvar verificação: ${error.message}`)

  await recordAutomationRun(admin, {
    run_type: 'ad_brand_check',
    status: 'succeeded',
    provider: 'internal',
    brief_id: ad.brief_id ?? null,
    output: { approved, score, issues: issues.length, ad_id: adId, ad_identifier: ad.identifier },
    duration_ms: Date.now() - started,
    created_by: userId,
  })

  return result
}

// ════════════════════════════════════════════════════════════════════════════
// Landing pages
// ════════════════════════════════════════════════════════════════════════════

export async function listLandingPages(admin: SupabaseClient): Promise<LandingPage[]> {
  const { data, error } = await mkt(admin)
    .from('landing_pages')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (error) throw new Error(`Falha ao listar landing pages: ${error.message}`)
  return (data ?? []) as LandingPage[]
}

export async function getLandingPageBySlug(
  admin: SupabaseClient,
  slug: string,
  opts: { publishedOnly?: boolean } = {},
): Promise<LandingPage | null> {
  let q = mkt(admin).from('landing_pages').select('*').eq('slug', slug)
  if (opts.publishedOnly) q = q.eq('status', 'published')
  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(`Falha ao ler landing page: ${error.message}`)
  return (data as LandingPage | null) ?? null
}

/** CTA da landing precisa estar na lista aprovada (brand_rules.approved_ctas
 *  .organico) — ver comentário da coluna cta_label na migration. */
async function assertApprovedCtaLabel(admin: SupabaseClient, ctaLabel: string): Promise<void> {
  const rulesMap = await getBrandRules(admin).catch(() => ({}) as Record<string, unknown>)
  const approved = toBrandCheckRules(rulesMap).approvedCtas
  if (!approved.some(a => a.toLowerCase() === ctaLabel.toLowerCase())) {
    throw new Error(`CTA "${ctaLabel}" fora da lista aprovada: ${approved.join(' · ')}`)
  }
}

export async function createLandingPage(
  admin: SupabaseClient,
  input: CreateLandingPageInput,
  userId: string,
): Promise<LandingPage> {
  const slug = input.slug?.trim().toLowerCase()
  const name = input.name?.trim()
  if (!name) throw new Error('Nome da landing page é obrigatório')
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('Slug inválido — use apenas letras minúsculas, números e hífen')
  }
  if (input.sections && !Array.isArray(input.sections)) {
    throw new Error('sections deve ser uma lista')
  }
  if (input.cta_label?.trim()) {
    await assertApprovedCtaLabel(admin, input.cta_label.trim())
  }

  const existing = await mkt(admin).from('landing_pages').select('id').eq('slug', slug).maybeSingle()
  if (existing.error) throw new Error(`Falha ao verificar slug: ${existing.error.message}`)
  if (existing.data) throw new Error(`Já existe uma landing page com o slug "${slug}"`)

  const res = await mkt(admin)
    .from('landing_pages')
    .insert({
      slug,
      name,
      persona: input.persona ?? null,
      pain: input.pain ?? null,
      headline: input.headline ?? null,
      subheadline: input.subheadline ?? null,
      cta_label: input.cta_label ?? null,
      sections: input.sections ?? [],
      meta_title: input.meta_title ?? null,
      meta_description: input.meta_description ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  return must(res, 'Falha ao criar landing page') as LandingPage
}

/** Slug fica de fora: é a URL usada nos anúncios publicados. */
const LANDING_EDITABLE = [
  'name', 'persona', 'pain', 'headline', 'subheadline', 'cta_label',
  'sections', 'meta_title', 'meta_description', 'noindex',
] as const

export async function updateLandingPage(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<LandingPage> {
  const update: Record<string, unknown> = {}
  for (const key of LANDING_EDITABLE) {
    if (key in patch) update[key] = patch[key]
  }
  if ('sections' in update && !Array.isArray(update.sections)) {
    throw new Error('sections deve ser uma lista')
  }
  if (typeof update.cta_label === 'string' && update.cta_label.trim()) {
    await assertApprovedCtaLabel(admin, update.cta_label.trim())
  }

  // Publicar/arquivar via patch.status — sem máquina própria; só valores válidos.
  if (typeof patch.status === 'string') {
    if (!LANDING_STATUSES.includes(patch.status as LandingPageStatus)) {
      throw new Error('Status de landing page inválido (draft, published ou archived)')
    }
    update.status = patch.status
  }

  if (Object.keys(update).length === 0) throw new Error('Nada para atualizar')

  const res = await mkt(admin)
    .from('landing_pages')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  return must(res, 'Falha ao atualizar landing page') as LandingPage
}

// ════════════════════════════════════════════════════════════════════════════
// Métricas
// ════════════════════════════════════════════════════════════════════════════

export async function upsertDailyMetrics(
  admin: SupabaseClient,
  rows: MetricUpsertRow[],
): Promise<{ upserted: number }> {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Nenhuma linha de métrica para importar')
  if (rows.length > 500) throw new Error('Máximo de 500 linhas por importação')

  const nonNeg = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 0

  const payload = rows.map((row, i) => {
    const n = i + 1
    if (typeof row.metric_date !== 'string' || !DATE_RE.test(row.metric_date)) {
      throw new Error(`Linha ${n}: data inválida (esperado YYYY-MM-DD)`)
    }
    if (!METRIC_LEVELS.includes(row.level)) {
      throw new Error(`Linha ${n}: nível inválido (campaign, ad_set ou ad)`)
    }
    if (typeof row.entity_id !== 'string' || !UUID_RE.test(row.entity_id)) {
      throw new Error(`Linha ${n}: entity_id inválido`)
    }
    if (row.impressions !== undefined && !nonNeg(row.impressions)) {
      throw new Error(`Linha ${n}: impressões devem ser inteiro ≥ 0`)
    }
    if (row.clicks !== undefined && !nonNeg(row.clicks)) {
      throw new Error(`Linha ${n}: cliques devem ser inteiro ≥ 0`)
    }
    if (row.spend_cents !== undefined && !nonNeg(row.spend_cents)) {
      throw new Error(`Linha ${n}: investimento deve ser inteiro ≥ 0 (centavos)`)
    }
    if (row.reach != null && !nonNeg(row.reach)) {
      throw new Error(`Linha ${n}: alcance deve ser inteiro ≥ 0`)
    }
    if (row.platform_leads != null && !nonNeg(row.platform_leads)) {
      throw new Error(`Linha ${n}: leads devem ser inteiro ≥ 0`)
    }
    if (row.source && !METRIC_SOURCES.includes(row.source)) {
      throw new Error(`Linha ${n}: origem inválida (manual, csv ou api)`)
    }
    return {
      metric_date: row.metric_date,
      level: row.level,
      entity_id: row.entity_id,
      channel_slug: row.channel_slug ?? null,
      impressions: row.impressions ?? 0,
      reach: row.reach ?? null,
      clicks: row.clicks ?? 0,
      spend_cents: row.spend_cents ?? 0,
      platform_leads: row.platform_leads ?? null,
      source: row.source ?? 'manual',
      raw: row.raw ?? {},
    }
  })

  // Chave de conflito repetida no MESMO payload derruba o upsert inteiro no
  // Postgres — deduplica antes (última ocorrência vence, como num reenvio).
  const deduped = [...new Map(payload.map(p => [`${p.metric_date}|${p.level}|${p.entity_id}`, p])).values()]

  const { error } = await mkt(admin)
    .from('ad_metrics_daily')
    .upsert(deduped, { onConflict: 'metric_date,level,entity_id' })
  if (error) throw new Error(`Falha ao gravar métricas: ${error.message}`)
  return { upserted: deduped.length }
}

/** Traduz identificadores (CSV) para (level, entity_id) buscando em campanhas,
 *  conjuntos e anúncios. Identificadores são gerados sempre em maiúsculas por
 *  naming.buildIdentifier — normalizar para maiúsculas torna a busca
 *  case-insensitive na prática. */
export async function resolveMetricIdentifiers(
  admin: SupabaseClient,
  rows: ParsedMetricRow[],
): Promise<{ rows: MetricUpsertRow[]; errors: CsvRowError[] }> {
  if (rows.length === 0) return { rows: [], errors: [] }

  const identifiers = [...new Set(rows.map(r => r.identifier.trim().toUpperCase()))]
  const [campaignsRes, setsRes, adsRes] = await Promise.all([
    mkt(admin).from('ad_campaigns').select('id, identifier').in('identifier', identifiers),
    mkt(admin).from('ad_sets').select('id, identifier').in('identifier', identifiers),
    mkt(admin).from('ads').select('id, identifier').in('identifier', identifiers),
  ])
  if (campaignsRes.error) throw new Error(`Falha ao resolver campanhas: ${campaignsRes.error.message}`)
  if (setsRes.error) throw new Error(`Falha ao resolver conjuntos: ${setsRes.error.message}`)
  if (adsRes.error) throw new Error(`Falha ao resolver anúncios: ${adsRes.error.message}`)

  // Mesmo identificador em mais de um nível = ambíguo — melhor recusar a linha
  // do que atribuir métrica ao nível errado.
  const matches = new Map<string, Array<{ level: MetricLevel; entity_id: string }>>()
  const add = (level: MetricLevel, rowsData: unknown[] | null) => {
    for (const r of (rowsData ?? []) as Array<{ id: string; identifier: string }>) {
      const key = r.identifier.toUpperCase()
      const list = matches.get(key) ?? []
      list.push({ level, entity_id: r.id })
      matches.set(key, list)
    }
  }
  add('campaign', campaignsRes.data)
  add('ad_set', setsRes.data)
  add('ad', adsRes.data)

  const resolved: MetricUpsertRow[] = []
  const errors: CsvRowError[] = []
  for (const row of rows) {
    const found = matches.get(row.identifier.trim().toUpperCase())
    if (!found || found.length === 0) {
      errors.push({ line: row.line, message: `Identificador "${row.identifier}" não encontrado em campanhas, conjuntos ou anúncios` })
      continue
    }
    if (found.length > 1) {
      errors.push({ line: row.line, message: `Identificador "${row.identifier}" é ambíguo (existe em mais de um nível)` })
      continue
    }
    resolved.push({
      metric_date: row.metric_date,
      level: found[0].level,
      entity_id: found[0].entity_id,
      impressions: row.impressions,
      clicks: row.clicks,
      spend_cents: row.spend_cents,
      platform_leads: row.platform_leads,
      source: 'csv',
    })
  }
  return { rows: resolved, errors }
}

// ── Agregação interna (métricas + eventos → RawTotals) ─────────────────────────

interface MetricSums {
  impressions: number
  clicks: number
  spend_cents: number
}

function zeroSums(): MetricSums {
  return { impressions: 0, clicks: 0, spend_cents: 0 }
}

function addSums(target: MetricSums, row: MetricSums): void {
  target.impressions += row.impressions || 0
  target.clicks += row.clicks || 0
  target.spend_cents += row.spend_cents || 0
}

interface MetricRowLite extends MetricSums {
  level: MetricLevel
  entity_id: string
}

/** Soma o período por campanha aplicando PRECEDÊNCIA DE NÍVEL POR DIA: para
 *  cada (campanha, dia), se há linha level=campaign usa só ela; senão ad_set;
 *  senão ad — somar níveis diferentes do MESMO dia contaria em dobro, mas dias
 *  cobertos só por anúncio nunca são descartados por causa de um dia manual em
 *  nível campanha. Linhas órfãs (entidade apagada) entram só no total global. */
async function fetchPeriodMetricSums(
  admin: SupabaseClient,
  periodStart: string,
  periodEnd: string,
): Promise<{ perCampaign: Map<string, MetricSums>; global: MetricSums }> {
  const [metricsRes, adsRes, setsRes] = await Promise.all([
    mkt(admin).from('ad_metrics_daily')
      .select('metric_date, level, entity_id, impressions, clicks, spend_cents')
      .gte('metric_date', periodStart)
      .lte('metric_date', periodEnd)
      .limit(METRICS_FETCH_LIMIT),
    mkt(admin).from('ads').select('id, campaign_id').limit(5000),
    mkt(admin).from('ad_sets').select('id, campaign_id').limit(2000),
  ])
  if (metricsRes.error) throw new Error(`Falha ao ler métricas: ${metricsRes.error.message}`)
  if (adsRes.error) throw new Error(`Falha ao mapear anúncios: ${adsRes.error.message}`)
  if (setsRes.error) throw new Error(`Falha ao mapear conjuntos: ${setsRes.error.message}`)

  const adToCampaign = new Map<string, string>()
  for (const a of (adsRes.data ?? []) as Array<{ id: string; campaign_id: string }>) {
    adToCampaign.set(a.id, a.campaign_id)
  }
  const setToCampaign = new Map<string, string>()
  for (const s of (setsRes.data ?? []) as Array<{ id: string; campaign_id: string }>) {
    setToCampaign.set(s.id, s.campaign_id)
  }

  type DayBucket = Record<MetricLevel, MetricSums> & { levels: Set<MetricLevel> }
  const buckets = new Map<string, Map<string, DayBucket>>()
  const orphans = zeroSums()

  for (const row of (metricsRes.data ?? []) as Array<MetricRowLite & { metric_date: string }>) {
    const campaignId = row.level === 'campaign'
      ? row.entity_id
      : row.level === 'ad_set'
        ? setToCampaign.get(row.entity_id)
        : adToCampaign.get(row.entity_id)
    if (!campaignId) {
      addSums(orphans, row)
      continue
    }
    let days = buckets.get(campaignId)
    if (!days) {
      days = new Map()
      buckets.set(campaignId, days)
    }
    let day = days.get(row.metric_date)
    if (!day) {
      day = { campaign: zeroSums(), ad_set: zeroSums(), ad: zeroSums(), levels: new Set() }
      days.set(row.metric_date, day)
    }
    addSums(day[row.level], row)
    day.levels.add(row.level)
  }

  const perCampaign = new Map<string, MetricSums>()
  const global = { ...orphans }
  for (const [campaignId, days] of buckets) {
    const total = zeroSums()
    for (const day of days.values()) {
      const chosen = day.levels.has('campaign')
        ? day.campaign
        : day.levels.has('ad_set')
          ? day.ad_set
          : day.ad
      addSums(total, chosen)
    }
    perCampaign.set(campaignId, total)
    addSums(global, total)
  }
  return { perCampaign, global }
}

const FUNNEL_EVENT_TYPES = ['signup', 'checkout_started', 'subscription_started', 'subscription_renewed'] as const

interface AcqEventRow {
  user_id: string | null
  event_type: string
  value_cents: number | null
  campaign_identifier: string | null
  ad_identifier: string | null
}

async function fetchPeriodEvents(
  admin: SupabaseClient,
  periodStart: string,
  periodEnd: string,
  campaignIdentifier?: string,
): Promise<AcqEventRow[]> {
  let q = mkt(admin).from('acquisition_events')
    .select('user_id, event_type, value_cents, campaign_identifier, ad_identifier')
    .in('event_type', [...FUNNEL_EVENT_TYPES])
    .gte('created_at', eventWindow(periodStart, periodEnd).from)
    .lte('created_at', eventWindow(periodStart, periodEnd).to)
    .limit(EVENTS_FETCH_LIMIT)
  if (campaignIdentifier) q = q.eq('campaign_identifier', campaignIdentifier.toLowerCase())
  const { data, error } = await q
  if (error) throw new Error(`Falha ao ler eventos de aquisição: ${error.message}`)
  return (data ?? []) as AcqEventRow[]
}

interface EventSums {
  signups: number
  signupUserIds: string[]
  checkouts_started: number
  subscriptions: number
  revenue_cents: number
}

function sumEvents(events: AcqEventRow[]): EventSums {
  const sums: EventSums = { signups: 0, signupUserIds: [], checkouts_started: 0, subscriptions: 0, revenue_cents: 0 }
  for (const e of events) {
    switch (e.event_type) {
      case 'signup':
        sums.signups++
        if (e.user_id) sums.signupUserIds.push(e.user_id)
        break
      case 'checkout_started':
        sums.checkouts_started++
        break
      case 'subscription_started':
        sums.subscriptions++
        sums.revenue_cents += e.value_cents ?? 0
        break
      case 'subscription_renewed':
        sums.revenue_cents += e.value_cents ?? 0
        break
    }
  }
  return sums
}

/** Usuários ativados (≥1 geração) dentro do conjunto de cadastros. Preferência:
 *  eventos first_generation instrumentados (consultados em lotes, sem cap); se
 *  NENHUM existir no banco (ainda não instrumentado), fallback via tabelas de
 *  produto (renders/vistas), limitado a ACTIVATION_USER_CAP ids. */
async function computeActivatedUsers(
  admin: SupabaseClient,
  signupUserIds: string[],
): Promise<Set<string>> {
  if (signupUserIds.length === 0) return new Set()
  const allIds = [...new Set(signupUserIds)]

  const probe = await mkt(admin)
    .from('acquisition_events')
    .select('id')
    .eq('event_type', 'first_generation')
    .limit(1)
  if (probe.error) throw new Error(`Falha ao verificar ativação: ${probe.error.message}`)

  if ((probe.data ?? []).length > 0) {
    // Caminho instrumentado: sem cap — consulta em lotes para não estourar a URL.
    const set = new Set<string>()
    for (let i = 0; i < allIds.length; i += ACTIVATION_USER_CAP) {
      const chunk = allIds.slice(i, i + ACTIVATION_USER_CAP)
      const { data, error } = await mkt(admin)
        .from('acquisition_events')
        .select('user_id')
        .eq('event_type', 'first_generation')
        .in('user_id', chunk)
        .limit(EVENTS_FETCH_LIMIT)
      if (error) throw new Error(`Falha ao ler ativações: ${error.message}`)
      for (const r of (data ?? []) as Array<{ user_id: string | null }>) {
        if (r.user_id) set.add(r.user_id)
      }
    }
    return set
  }

  // O cap só se aplica ao fallback (join com tabelas de produto). Truncou =
  // subcontagem visível no log; some quando first_generation for instrumentado.
  const ids = allIds.slice(0, ACTIVATION_USER_CAP)
  if (allIds.length > ACTIVATION_USER_CAP) {
    console.warn(`[marketing/ads] ativação (fallback) truncada: ${allIds.length} cadastros, cap ${ACTIVATION_USER_CAP}`)
  }

  // Fallback: produto (tabelas public — sem .schema()).
  const [rendersRes, vistasRes] = await Promise.all([
    admin.from('renders').select('user_id').in('user_id', ids).limit(2000),
    admin.from('vistas').select('user_id').in('user_id', ids).limit(2000),
  ])
  if (rendersRes.error) throw new Error(`Falha ao ler renders (ativação): ${rendersRes.error.message}`)
  if (vistasRes.error) throw new Error(`Falha ao ler vistas (ativação): ${vistasRes.error.message}`)
  const set = new Set<string>()
  for (const r of (rendersRes.data ?? []) as Array<{ user_id: string | null }>) {
    if (r.user_id) set.add(r.user_id)
  }
  for (const v of (vistasRes.data ?? []) as Array<{ user_id: string | null }>) {
    if (v.user_id) set.add(v.user_id)
  }
  return set
}

export async function getFunnelSnapshot(
  admin: SupabaseClient,
  opts: { periodStart: string; periodEnd: string; campaignId?: string },
): Promise<FunnelSnapshot> {
  const { periodStart, periodEnd, campaignId } = opts

  let campaignIdentifier: string | undefined
  if (campaignId) {
    campaignIdentifier = (await getCampaign(admin, campaignId)).identifier
  }

  const [metricSums, events] = await Promise.all([
    fetchPeriodMetricSums(admin, periodStart, periodEnd),
    fetchPeriodEvents(admin, periodStart, periodEnd, campaignIdentifier),
  ])

  const media = campaignId
    ? (metricSums.perCampaign.get(campaignId) ?? zeroSums())
    : metricSums.global
  const ev = sumEvents(events)
  const activated = await computeActivatedUsers(admin, ev.signupUserIds)

  const totals: RawTotals = {
    impressions: media.impressions,
    clicks: media.clicks,
    spend_cents: media.spend_cents,
    signups: ev.signups,
    activations: activated.size,
    checkouts_started: ev.checkouts_started,
    subscriptions: ev.subscriptions,
    revenue_cents: ev.revenue_cents,
  }
  return {
    totals,
    derived: computeDerivedMetrics(totals),
    period_start: periodStart,
    period_end: periodEnd,
  }
}

export async function getCampaignsWithStats(
  admin: SupabaseClient,
  opts: StatsPeriodOpts,
): Promise<CampaignWithStats[]> {
  const [campaigns, metricSums, events, adsRes] = await Promise.all([
    listCampaigns(admin),
    fetchPeriodMetricSums(admin, opts.periodStart, opts.periodEnd),
    fetchPeriodEvents(admin, opts.periodStart, opts.periodEnd),
    mkt(admin).from('ads').select('id, campaign_id').limit(5000),
  ])
  if (adsRes.error) throw new Error(`Falha ao contar anúncios: ${adsRes.error.message}`)

  const adsCount = new Map<string, number>()
  for (const a of (adsRes.data ?? []) as Array<{ id: string; campaign_id: string }>) {
    adsCount.set(a.campaign_id, (adsCount.get(a.campaign_id) ?? 0) + 1)
  }

  const eventsByCampaign = new Map<string, AcqEventRow[]>()
  for (const e of events) {
    if (!e.campaign_identifier) continue
    const key = e.campaign_identifier.toLowerCase()
    const list = eventsByCampaign.get(key) ?? []
    list.push(e)
    eventsByCampaign.set(key, list)
  }

  // Ativação calculada UMA vez para todos os cadastros do período; depois
  // interseção por campanha — evita N consultas ao produto.
  const allSignupIds = events
    .filter(e => e.event_type === 'signup' && e.user_id)
    .map(e => e.user_id as string)
  const activated = await computeActivatedUsers(admin, allSignupIds)

  return campaigns.map(c => {
    const media = metricSums.perCampaign.get(c.id) ?? zeroSums()
    const ev = sumEvents(eventsByCampaign.get(c.identifier.toLowerCase()) ?? [])
    const totals: RawTotals = {
      impressions: media.impressions,
      clicks: media.clicks,
      spend_cents: media.spend_cents,
      signups: ev.signups,
      activations: ev.signupUserIds.filter(id => activated.has(id)).length,
      checkouts_started: ev.checkouts_started,
      subscriptions: ev.subscriptions,
      revenue_cents: ev.revenue_cents,
    }
    return {
      ...c,
      totals,
      derived: computeDerivedMetrics(totals),
      ads_count: adsCount.get(c.id) ?? 0,
    }
  })
}

export async function getAdsWithStats(
  admin: SupabaseClient,
  campaignId: string,
  opts: StatsPeriodOpts,
): Promise<AdWithStats[]> {
  const ads = await listAds(admin, { campaignId })
  if (ads.length === 0) return []

  const adIds = ads.map(a => a.id)
  const identifiers = ads.map(a => a.identifier.toLowerCase())

  const [metricsRes, eventsRes] = await Promise.all([
    mkt(admin).from('ad_metrics_daily')
      .select('entity_id, impressions, clicks, spend_cents')
      .eq('level', 'ad')
      .in('entity_id', adIds)
      .gte('metric_date', opts.periodStart)
      .lte('metric_date', opts.periodEnd)
      .limit(METRICS_FETCH_LIMIT),
    mkt(admin).from('acquisition_events')
      .select('user_id, event_type, value_cents, campaign_identifier, ad_identifier')
      .in('event_type', [...FUNNEL_EVENT_TYPES])
      .in('ad_identifier', identifiers)
      .gte('created_at', eventWindow(opts.periodStart, opts.periodEnd).from)
      .lte('created_at', eventWindow(opts.periodStart, opts.periodEnd).to)
      .limit(EVENTS_FETCH_LIMIT),
  ])
  if (metricsRes.error) throw new Error(`Falha ao ler métricas dos anúncios: ${metricsRes.error.message}`)
  if (eventsRes.error) throw new Error(`Falha ao ler eventos dos anúncios: ${eventsRes.error.message}`)

  const sumsByAd = new Map<string, MetricSums>()
  for (const row of (metricsRes.data ?? []) as Array<MetricSums & { entity_id: string }>) {
    const sums = sumsByAd.get(row.entity_id) ?? zeroSums()
    addSums(sums, row)
    sumsByAd.set(row.entity_id, sums)
  }

  const events = (eventsRes.data ?? []) as AcqEventRow[]
  const eventsByAd = new Map<string, AcqEventRow[]>()
  for (const e of events) {
    if (!e.ad_identifier) continue
    const key = e.ad_identifier.toLowerCase()
    const list = eventsByAd.get(key) ?? []
    list.push(e)
    eventsByAd.set(key, list)
  }

  const allSignupIds = events
    .filter(e => e.event_type === 'signup' && e.user_id)
    .map(e => e.user_id as string)
  const activated = await computeActivatedUsers(admin, allSignupIds)

  return ads.map(ad => {
    const media = sumsByAd.get(ad.id) ?? zeroSums()
    const ev = sumEvents(eventsByAd.get(ad.identifier.toLowerCase()) ?? [])
    const totals: RawTotals = {
      impressions: media.impressions,
      clicks: media.clicks,
      spend_cents: media.spend_cents,
      signups: ev.signups,
      activations: ev.signupUserIds.filter(id => activated.has(id)).length,
      checkouts_started: ev.checkouts_started,
      subscriptions: ev.subscriptions,
      revenue_cents: ev.revenue_cents,
    }
    return { ...ad, totals, derived: computeDerivedMetrics(totals) }
  })
}

/** Dados do painel — best-effort: qualquer falha de infra (schema não aplicado/
 *  não exposto no PostgREST: 42P01, 406, PGRST…) devolve a estrutura vazia com
 *  `degraded` preenchido em vez de derrubar a página. */
export async function getAdsDashboardData(admin: SupabaseClient): Promise<AdsDashboardData> {
  const { periodStart, periodEnd } = last30DaysPeriod()
  try {
    const [funnel, campaigns, openAlerts, pendingActions, runningExperiments, reports] = await Promise.all([
      getFunnelSnapshot(admin, { periodStart, periodEnd }),
      getCampaignsWithStats(admin, { periodStart, periodEnd }),
      listAlerts(admin, { status: 'open' }),
      listPendingActions(admin, { status: 'pending' }),
      listExperiments(admin, { status: 'running' }),
      listReports(admin, 1),
    ])
    return {
      funnel,
      campaigns,
      openAlerts,
      pendingActions,
      runningExperiments,
      latestReport: reports[0] ?? null,
    }
  } catch (err) {
    console.warn('[marketing/ads] painel em modo degradado:', err instanceof Error ? err.message : err)
    return {
      funnel: {
        totals: EMPTY_TOTALS,
        derived: computeDerivedMetrics(EMPTY_TOTALS),
        period_start: periodStart,
        period_end: periodEnd,
      },
      campaigns: [],
      openAlerts: [],
      pendingActions: [],
      runningExperiments: [],
      latestReport: null,
      degraded: 'Schema marketing ainda não aplicado/exposto — painel em modo vazio.',
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Experimentos
// ════════════════════════════════════════════════════════════════════════════

export interface ExperimentFilters {
  status?: ExperimentStatus
}

export async function listExperiments(
  admin: SupabaseClient,
  filters: ExperimentFilters = {},
): Promise<AdExperiment[]> {
  let q = mkt(admin).from('ad_experiments').select('*').order('updated_at', { ascending: false }).limit(LIST_LIMIT)
  if (filters.status) q = q.eq('status', filters.status)
  const { data, error } = await q
  if (error) throw new Error(`Falha ao listar experimentos: ${error.message}`)
  return (data ?? []) as AdExperiment[]
}

export interface CreateExperimentInput {
  name: string
  hypothesis: string
  matrix?: Record<string, unknown>
  campaign_id?: string | null
  ad_ids?: string[]
  primary_metric?: string
  success_criteria?: string | null
}

export async function createExperiment(
  admin: SupabaseClient,
  input: CreateExperimentInput,
  userId: string,
): Promise<AdExperiment> {
  const name = input.name?.trim()
  const hypothesis = input.hypothesis?.trim()
  if (!name) throw new Error('Nome do experimento é obrigatório')
  if (!hypothesis) throw new Error('Hipótese é obrigatória — sem hipótese não há experimento')
  const primaryMetric = input.primary_metric ?? 'cac'
  if (!(EXPERIMENT_METRICS as readonly string[]).includes(primaryMetric)) {
    throw new Error('Métrica principal inválida')
  }
  if (input.ad_ids && !input.ad_ids.every(id => typeof id === 'string' && UUID_RE.test(id))) {
    throw new Error('ad_ids deve ser uma lista de ids válidos')
  }

  const res = await mkt(admin)
    .from('ad_experiments')
    .insert({
      name,
      hypothesis,
      matrix: input.matrix ?? {},
      campaign_id: input.campaign_id ?? null,
      ad_ids: input.ad_ids ?? [],
      primary_metric: primaryMetric,
      success_criteria: input.success_criteria ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  return must(res, 'Falha ao criar experimento') as AdExperiment
}

const EXPERIMENT_EDITABLE = [
  'name', 'hypothesis', 'matrix', 'campaign_id', 'ad_ids', 'primary_metric',
  'success_criteria', 'conclusion', 'next_action',
] as const

export async function updateExperiment(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<AdExperiment> {
  const current = must(
    await mkt(admin).from('ad_experiments').select('*').eq('id', id).maybeSingle(),
    'Experimento',
  ) as AdExperiment

  const update: Record<string, unknown> = {}
  for (const key of EXPERIMENT_EDITABLE) {
    if (key in patch) update[key] = patch[key]
  }
  if (typeof update.primary_metric === 'string' && !(EXPERIMENT_METRICS as readonly string[]).includes(update.primary_metric)) {
    throw new Error('Métrica principal inválida')
  }

  if (typeof patch.status === 'string') {
    if (!isExperimentStatus(patch.status)) throw new Error('Status desconhecido')
    const to = patch.status
    assertExperimentTransition(current.status, to)
    // Concluir exige a conclusão escrita — nunca fechar experimento sem registro.
    if (to === 'validated' || to === 'invalidated') {
      const conclusion = typeof update.conclusion === 'string' && update.conclusion.trim()
        ? update.conclusion
        : current.conclusion
      if (!conclusion || !conclusion.trim()) {
        throw new Error('Concluir como validado/refutado exige a conclusão preenchida')
      }
    }
    update.status = to
    if (to === 'running' && !current.started_at) update.started_at = new Date().toISOString()
    if (to === 'validated' || to === 'invalidated' || to === 'abandoned') {
      update.ended_at = new Date().toISOString()
    }
  }

  if (Object.keys(update).length === 0) throw new Error('Nada para atualizar')

  const res = await mkt(admin)
    .from('ad_experiments')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  return must(res, 'Falha ao atualizar experimento') as AdExperiment
}

// ════════════════════════════════════════════════════════════════════════════
// Fila de aprovação humana
// ════════════════════════════════════════════════════════════════════════════

export interface ActionFilters {
  status?: ActionStatus
}

export async function listPendingActions(
  admin: SupabaseClient,
  filters: ActionFilters = {},
): Promise<AdPendingAction[]> {
  let q = mkt(admin).from('ad_pending_actions').select('*').order('created_at', { ascending: false }).limit(LIST_LIMIT)
  if (filters.status) q = q.eq('status', filters.status)
  const { data, error } = await q
  if (error) throw new Error(`Falha ao listar ações: ${error.message}`)
  return (data ?? []) as AdPendingAction[]
}

export async function requestAction(
  admin: SupabaseClient,
  input: RequestActionInput,
  requestedBy: string | null,
): Promise<AdPendingAction> {
  if (!(ACTION_TYPES as readonly string[]).includes(input.action_type)) {
    throw new Error('Tipo de ação inválido')
  }
  if (!(ACTION_ENTITY_LEVELS as readonly string[]).includes(input.entity_level)) {
    throw new Error('Nível de entidade inválido (campaign, ad_set ou ad)')
  }
  if (typeof input.entity_id !== 'string' || !UUID_RE.test(input.entity_id)) {
    throw new Error('entity_id inválido')
  }

  const res = await mkt(admin)
    .from('ad_pending_actions')
    .insert({
      action_type: input.action_type,
      entity_level: input.entity_level,
      entity_id: input.entity_id,
      payload: input.payload ?? {},
      reason: input.reason ?? null,
      requested_by: requestedBy,
    })
    .select('*')
    .single()
  return must(res, 'Falha ao registrar ação') as AdPendingAction
}

async function getAction(admin: SupabaseClient, actionId: string): Promise<AdPendingAction> {
  const res = await mkt(admin).from('ad_pending_actions').select('*').eq('id', actionId).maybeSingle()
  return must(res, 'Ação') as AdPendingAction
}

/** Decisão HUMANA sobre uma ação pendente — aprova ou rejeita. */
export async function decideAction(
  admin: SupabaseClient,
  actionId: string,
  deciderId: string,
  decision: 'approved' | 'rejected',
  notes?: string | null,
): Promise<AdPendingAction> {
  const action = await getAction(admin, actionId)
  assertActionTransition(action.status, decision)

  const res = await mkt(admin)
    .from('ad_pending_actions')
    .update({
      status: decision,
      decided_by: deciderId,
      decided_at: new Date().toISOString(),
      decision_notes: notes ?? null,
    })
    .eq('id', actionId)
    .select('*')
    .single()
  return must(res, 'Falha ao registrar decisão') as AdPendingAction
}

export async function markActionExecuted(
  admin: SupabaseClient,
  actionId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const action = await getAction(admin, actionId)
  assertActionTransition(action.status, 'executed')

  const { error } = await mkt(admin)
    .from('ad_pending_actions')
    .update({
      status: 'executed',
      executed_at: new Date().toISOString(),
      execution_result: result,
    })
    .eq('id', actionId)
  if (error) throw new Error(`Falha ao marcar execução: ${error.message}`)
}

// ════════════════════════════════════════════════════════════════════════════
// Alertas
// ════════════════════════════════════════════════════════════════════════════

export interface AlertFilters {
  status?: AlertStatus
}

export async function listAlerts(
  admin: SupabaseClient,
  filters: AlertFilters = {},
): Promise<AdAlert[]> {
  let q = mkt(admin).from('ad_alerts').select('*')
    .order('severity', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (filters.status) q = q.eq('status', filters.status)
  const { data, error } = await q
  if (error) throw new Error(`Falha ao listar alertas: ${error.message}`)
  return (data ?? []) as AdAlert[]
}

/** Cria alertas com dedupe: não recria alerta open com o mesmo tipo/entidade
 *  (o motor de regras roda repetidamente — sem isto o painel viraria eco). */
export async function createAlerts(admin: SupabaseClient, alerts: NewAlert[]): Promise<number> {
  if (alerts.length === 0) return 0

  // Dedupe contra alertas ATIVOS (abertos ou já vistos) — "Visto" não pode
  // renascer como alerta novo a cada scan; resolvido/descartado pode re-disparar.
  const { data, error } = await mkt(admin)
    .from('ad_alerts')
    .select('alert_type, entity_level, entity_id')
    .in('status', ['open', 'acknowledged'])
    .limit(1000)
  if (error) throw new Error(`Falha ao verificar alertas ativos: ${error.message}`)

  const activeKeys = new Set(
    ((data ?? []) as Array<{ alert_type: string; entity_level: string | null; entity_id: string | null }>)
      .map(a => `${a.alert_type}|${a.entity_level ?? ''}|${a.entity_id ?? ''}`),
  )

  const fresh = alerts.filter(a =>
    !activeKeys.has(`${a.alert_type}|${a.entity_level ?? ''}|${a.entity_id ?? ''}`),
  )
  if (fresh.length === 0) return 0

  const { error: insertError } = await mkt(admin).from('ad_alerts').insert(
    fresh.map(a => ({
      alert_type: a.alert_type,
      severity: a.severity,
      entity_level: a.entity_level ?? null,
      entity_id: a.entity_id ?? null,
      message: a.message,
      data: a.data ?? {},
    })),
  )
  if (insertError) throw new Error(`Falha ao criar alertas: ${insertError.message}`)
  return fresh.length
}

export async function setAlertStatus(
  admin: SupabaseClient,
  id: string,
  status: AlertStatus,
): Promise<void> {
  if (!isAlertStatus(status)) throw new Error('Status de alerta inválido')
  const update: Record<string, unknown> = { status }
  if (status === 'resolved') update.resolved_at = new Date().toISOString()
  const { error } = await mkt(admin).from('ad_alerts').update(update).eq('id', id)
  if (error) throw new Error(`Falha ao atualizar alerta: ${error.message}`)
}

// ════════════════════════════════════════════════════════════════════════════
// Relatórios
// ════════════════════════════════════════════════════════════════════════════

export async function listReports(admin: SupabaseClient, limit = 20): Promise<AdReport[]> {
  const { data, error } = await mkt(admin)
    .from('ad_reports')
    .select('*')
    .order('period_end', { ascending: false })
    .limit(Math.min(limit, LIST_LIMIT))
  if (error) throw new Error(`Falha ao listar relatórios: ${error.message}`)
  return (data ?? []) as AdReport[]
}

export async function saveReport(
  admin: SupabaseClient,
  report: NewReport,
  userId: string | null,
): Promise<AdReport> {
  if (!DATE_RE.test(report.period_start) || !DATE_RE.test(report.period_end)) {
    throw new Error('Período do relatório inválido (esperado YYYY-MM-DD)')
  }
  if (!report.title?.trim()) throw new Error('Título do relatório é obrigatório')
  if (!report.summary_md?.trim()) throw new Error('Relatório sem conteúdo')

  const res = await mkt(admin)
    .from('ad_reports')
    .insert({
      period_start: report.period_start,
      period_end: report.period_end,
      title: report.title.trim(),
      summary_md: report.summary_md,
      data: report.data ?? {},
      status: report.status ?? 'final',
      created_by: userId,
    })
    .select('*')
    .single()
  return must(res, 'Falha ao salvar relatório') as AdReport
}

// ════════════════════════════════════════════════════════════════════════════
// Eventos de aquisição (best-effort — NUNCA derrubam o fluxo de produto)
// ════════════════════════════════════════════════════════════════════════════

/** Grava um evento de aquisição. Best-effort: violação do índice único de
 *  signup/first_generation (23505) é sucesso silencioso; qualquer outro erro
 *  vira console.warn — o caller de produto nunca vê exceção daqui. */
export async function recordAcquisitionEvent(
  admin: SupabaseClient,
  event: NewAcquisitionEvent,
): Promise<void> {
  try {
    // Deriva os identificadores do UTM cru quando o caller não os passou —
    // lp_view envia as chaves da URL (utm_campaign/utm_content) e o funil por
    // campanha filtra pelas colunas normalizadas.
    const utm = event.utm ?? {}
    const utmStr = (k: string): string | null => {
      const v = utm[k]
      return typeof v === 'string' && v.trim() ? v.trim() : null
    }
    const adId = event.ad_identifier ?? utmStr('utm_content') ?? utmStr('content')
    const campId = event.campaign_identifier ?? utmStr('utm_campaign') ?? utmStr('campaign')

    const { error } = await mkt(admin).from('acquisition_events').insert({
      user_id: event.user_id ?? null,
      event_type: event.event_type,
      utm,
      ad_identifier: adId?.trim().toLowerCase() ?? null,
      campaign_identifier: campId?.trim().toLowerCase() ?? null,
      landing_page_id: event.landing_page_id ?? null,
      referrer: event.referrer ?? null,
      plan_id: event.plan_id ?? null,
      value_cents: event.value_cents ?? null,
      metadata: event.metadata ?? {},
    })
    if (error && error.code !== '23505') {
      console.warn(`[marketing/ads] falha ao gravar evento ${event.event_type}: ${error.message}`)
    }
  } catch (err) {
    console.warn('[marketing/ads] falha ao gravar evento de aquisição:', err instanceof Error ? err.message : err)
  }
}

/** Registra a atribuição do cadastro a partir do cookie sn_attribution
 *  (last-touch). Imutável: o índice parcial uq_mkt_acq_signup_per_user garante
 *  um único signup por usuário — conflito (23505) é sucesso silencioso.
 *  Cadastro sem snapshot também é gravado (orgânico) para o funil completo. */
export async function bindSignupAttribution(
  admin: SupabaseClient,
  userId: string,
  snapshot: AttributionSnapshot | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const last = snapshot?.last
    await recordAcquisitionEvent(admin, {
      user_id: userId,
      event_type: 'signup',
      utm: snapshot ? ({ ...snapshot } as unknown as Record<string, unknown>) : {},
      ad_identifier: last?.content ?? null,
      campaign_identifier: last?.campaign ?? null,
      referrer: last?.referrer ?? null,
      metadata: { ...(meta ?? {}), organic: !snapshot },
    })
  } catch (err) {
    console.warn('[marketing/ads] falha ao atribuir cadastro:', err instanceof Error ? err.message : err)
  }
}
