// lib/marketing/ads/alerts.ts
//
// Motor de alertas do tráfego pago — REGRAS DETERMINÍSTICAS, zero IA (números
// não se interpretam com modelo). Compara a janela recente (7 dias) com a
// anterior (21 dias) e cria alertas em marketing.ad_alerts via createAlerts
// (dedupe de alerta open igual já é responsabilidade do service).
//
// Princípio (plano de aquisição): NUNCA alarmar por amostra insuficiente — todo
// alerta baseado em métrica derivada exige MetricValue.reliable nas janelas
// envolvidas. Exceções deliberadas: spend_no_conversion (dinheiro real saindo
// sem nenhum cadastro é alarmável com qualquer amostra) e budget_near_limit
// (limite de orçamento é aritmética, não estatística). tracking_failure também
// não depende de amostra — é um check de encanamento (gasto+cliques sem NENHUM
// evento first-party = rastreamento quebrado).
//
// Alertas RECOMENDAM; qualquer ação (pausar, escalar, ativar) vira
// ad_pending_actions com decisão humana — este módulo nunca muda status nem gasto.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getBrandRules } from '@/lib/marketing/service'
import {
  createAlerts,
  eventWindow,
  getAdsWithStats,
  getCampaignsWithStats,
  getFunnelSnapshot,
} from './service'
import { classifyAds, fmtBRL, type AdPerformance } from './metrics'
import { formatPercent } from './format'
import type { AdWithStats, AlertEntityLevel, AlertSeverity, NewAlert } from './types'

// ── Catálogo de tipos de alerta ────────────────────────────────────────────────

export interface AlertTypeDef {
  type: string
  /** Label PT-BR para o painel. */
  label: string
  /** Severidade padrão — a regra pode manter ou o painel exibir. */
  severity: AlertSeverity
}

export const ALERT_TYPES: readonly AlertTypeDef[] = [
  { type: 'spend_no_conversion',      label: 'Gasto sem conversão',                severity: 'critical' },
  { type: 'cpc_spike',                label: 'CPC fora da faixa',                  severity: 'warning' },
  { type: 'ctr_drop',                 label: 'Queda de CTR',                       severity: 'warning' },
  { type: 'lp_low_conversion',        label: 'Landing page com conversão baixa',   severity: 'warning' },
  { type: 'tracking_failure',         label: 'Falha de rastreamento',              severity: 'critical' },
  { type: 'budget_near_limit',        label: 'Orçamento perto do limite',          severity: 'warning' },
  { type: 'cac_above_target',         label: 'CAC acima da meta',                  severity: 'critical' },
  { type: 'ad_fatigue',               label: 'Fadiga de criativo',                 severity: 'warning' },
  { type: 'winner_scale_opportunity', label: 'Vencedor com espaço para escalar',   severity: 'info' },
] as const

export function alertTypeLabel(type: string): string {
  return ALERT_TYPES.find(t => t.type === type)?.label ?? type
}

function defaultSeverity(type: string): AlertSeverity {
  return ALERT_TYPES.find(t => t.type === type)?.severity ?? 'warning'
}

// ── Guardrails (limiares de negócio) ───────────────────────────────────────────

/** Limiares operacionais do motor. Vêm de marketing.brand_rules key
 *  'ads_guardrails' com fallback campo a campo para os defaults — mesma
 *  mecânica de toBrandCheckRules. Dinheiro em centavos; razões em fração. */
export interface AdsGuardrails {
  /** Meta de CAC (custo por assinatura), centavos. */
  cac_target_cents: number
  /** Gasto na janela recente sem NENHUM cadastro que dispara alerta, centavos. */
  spend_no_conversion_cents: number
  /** CPC recente ≥ ratio × CPC anterior = pico. */
  cpc_spike_ratio: number
  /** CTR recente ≤ ratio × CTR anterior = queda. */
  ctr_drop_ratio: number
  /** Mínimo de lp_view para julgar a conversão de uma landing page. */
  lp_min_views: number
  /** Conversão mínima lp_view → lp_cta_click (fração). */
  lp_min_conversion: number
  /** Fração do lifetime_budget consumida que dispara aviso. */
  budget_alert_share: number
  /** CTR do anúncio ≤ ratio × CTR anterior dele mesmo = fadiga. */
  fatigue_ratio: number
}

export const DEFAULT_GUARDRAILS: AdsGuardrails = {
  cac_target_cents: 20000,
  spend_no_conversion_cents: 10000,
  cpc_spike_ratio: 1.5,
  ctr_drop_ratio: 0.6,
  lp_min_views: 200,
  lp_min_conversion: 0.02,
  budget_alert_share: 0.85,
  fatigue_ratio: 0.7,
}

/** Carrega os guardrails de brand_rules('ads_guardrails'), caindo nos defaults
 *  campo a campo (chave ausente/inválida nunca derruba o scan). */
export async function loadGuardrails(admin: SupabaseClient): Promise<AdsGuardrails> {
  const rules = await getBrandRules(admin).catch(() => ({}) as Record<string, unknown>)
  const raw = (rules['ads_guardrails'] ?? {}) as Record<string, unknown>
  const num = (key: keyof AdsGuardrails): number => {
    const v = raw[key]
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : DEFAULT_GUARDRAILS[key]
  }
  return {
    cac_target_cents: num('cac_target_cents'),
    spend_no_conversion_cents: num('spend_no_conversion_cents'),
    cpc_spike_ratio: num('cpc_spike_ratio'),
    ctr_drop_ratio: num('ctr_drop_ratio'),
    lp_min_views: num('lp_min_views'),
    lp_min_conversion: num('lp_min_conversion'),
    budget_alert_share: num('budget_alert_share'),
    fatigue_ratio: num('fatigue_ratio'),
  }
}

// ── Janelas do scan ────────────────────────────────────────────────────────────

const RECENT_DAYS = 7      // janela recente
const BASELINE_DAYS = 21   // janela anterior de comparação
const TRACKING_DAYS = 3    // janela curta do check de rastreamento
const WINNER_MIN_SHARE = 0.3  // vencedor com menos de 30% do gasto = sub-investido
const BUDGET_LOOKBACK_DAYS = 365  // acumulado p/ lifetime_budget (operação jovem)

// Dia no fuso da conta de anúncios (mesma convenção de service.eventWindow —
// metric_date é dia America/Sao_Paulo).
function isoDate(d: Date): string {
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + days)
  return r
}

function toPerformance(a: AdWithStats): AdPerformance {
  return { ad_id: a.id, identifier: a.identifier, totals: a.totals, derived: a.derived }
}

function alertOf(
  type: string,
  message: string,
  data: Record<string, unknown>,
  entity?: { level: AlertEntityLevel; id: string | null },
): NewAlert {
  return {
    alert_type: type,
    severity: defaultSeverity(type),
    entity_level: entity?.level ?? 'system',
    entity_id: entity?.id ?? null,
    message,
    data,
  }
}

// ── Scan ───────────────────────────────────────────────────────────────────────

/** Roda todas as regras e persiste os alertas (dedupe no service). Retorna
 *  quantos alertas foram criados e quantas entidades foram avaliadas
 *  (campanhas + anúncios + landing pages + o check de rastreamento).
 *  Volume de queries é de painel interno (poucas campanhas) — se crescer,
 *  mover a agregação para RPC. */
export async function runAlertScan(
  admin: SupabaseClient,
): Promise<{ created: number; evaluated: number }> {
  const g = await loadGuardrails(admin)

  const now = new Date()
  const recentEnd = isoDate(now)
  const recentStart = isoDate(addDays(now, -(RECENT_DAYS - 1)))
  const baselineEnd = isoDate(addDays(now, -RECENT_DAYS))
  const baselineStart = isoDate(addDays(now, -(RECENT_DAYS + BASELINE_DAYS - 1)))
  const trackingStart = isoDate(addDays(now, -(TRACKING_DAYS - 1)))
  // Janela cheia (28d) usada por LP, tracking e CAC consolidado.
  const fullWindowStartIso = eventWindow(baselineStart, recentEnd).from

  const alerts: NewAlert[] = []
  let evaluated = 0

  const [recentCampaigns, baselineCampaigns] = await Promise.all([
    getCampaignsWithStats(admin, { periodStart: recentStart, periodEnd: recentEnd }),
    getCampaignsWithStats(admin, { periodStart: baselineStart, periodEnd: baselineEnd }),
  ])
  const baselineByCampaign = new Map(baselineCampaigns.map(c => [c.id, c]))

  // ── Regras por campanha ──────────────────────────────────────────────────────
  for (const c of recentCampaigns) {
    evaluated++
    const base = baselineByCampaign.get(c.id)

    // spend_no_conversion — QUALQUER amostra: gasto real sem nenhum cadastro.
    if (c.totals.spend_cents >= g.spend_no_conversion_cents && c.totals.signups === 0) {
      alerts.push(alertOf(
        'spend_no_conversion',
        `Campanha ${c.identifier}: ${fmtBRL(c.totals.spend_cents)} gastos nos últimos ${RECENT_DAYS} dias sem nenhum cadastro atribuído.`,
        {
          spend_cents: c.totals.spend_cents,
          signups: 0,
          clicks: c.totals.clicks,
          threshold_cents: g.spend_no_conversion_cents,
          period_start: recentStart,
          period_end: recentEnd,
        },
        { level: 'campaign', id: c.id },
      ))
    }

    // cpc_spike — exige CPC confiável nas DUAS janelas.
    const cpcNow = c.derived.cpc_cents
    const cpcBase = base?.derived.cpc_cents
    if (
      cpcNow.reliable && cpcNow.value !== null &&
      cpcBase?.reliable && cpcBase.value !== null && cpcBase.value > 0 &&
      cpcNow.value >= cpcBase.value * g.cpc_spike_ratio
    ) {
      alerts.push(alertOf(
        'cpc_spike',
        `Campanha ${c.identifier}: CPC de ${fmtBRL(cpcNow.value)} nos últimos ${RECENT_DAYS} dias — ${(cpcNow.value / cpcBase.value).toFixed(1).replace('.', ',')}× o CPC das ${BASELINE_DAYS / 7} semanas anteriores (${fmtBRL(cpcBase.value)}).`,
        {
          cpc_recent_cents: Math.round(cpcNow.value),
          cpc_baseline_cents: Math.round(cpcBase.value),
          spike_ratio: g.cpc_spike_ratio,
          period_start: recentStart,
          period_end: recentEnd,
          baseline_start: baselineStart,
          baseline_end: baselineEnd,
        },
        { level: 'campaign', id: c.id },
      ))
    }

    // ctr_drop — exige CTR confiável nas DUAS janelas.
    const ctrNow = c.derived.ctr
    const ctrBase = base?.derived.ctr
    if (
      ctrNow.reliable && ctrNow.value !== null &&
      ctrBase?.reliable && ctrBase.value !== null && ctrBase.value > 0 &&
      ctrNow.value <= ctrBase.value * g.ctr_drop_ratio
    ) {
      alerts.push(alertOf(
        'ctr_drop',
        `Campanha ${c.identifier}: CTR caiu para ${formatPercent(ctrNow.value, 2)} — abaixo de ${formatPercent(g.ctr_drop_ratio, 0)} do CTR anterior (${formatPercent(ctrBase.value, 2)}).`,
        {
          ctr_recent: ctrNow.value,
          ctr_baseline: ctrBase.value,
          drop_ratio: g.ctr_drop_ratio,
          period_start: recentStart,
          period_end: recentEnd,
          baseline_start: baselineStart,
          baseline_end: baselineEnd,
        },
        { level: 'campaign', id: c.id },
      ))
    }

    // cac_above_target — só com CAC confiável (≥ limiar de assinaturas).
    const cac = c.derived.cac_cents
    if (cac.reliable && cac.value !== null && cac.value > g.cac_target_cents) {
      alerts.push(alertOf(
        'cac_above_target',
        `Campanha ${c.identifier}: CAC de ${fmtBRL(cac.value)} acima da meta de ${fmtBRL(g.cac_target_cents)}.`,
        {
          cac_cents: Math.round(cac.value),
          cac_target_cents: g.cac_target_cents,
          subscriptions: c.totals.subscriptions,
          spend_cents: c.totals.spend_cents,
          period_start: recentStart,
          period_end: recentEnd,
        },
        { level: 'campaign', id: c.id },
      ))
    }
  }

  // ── budget_near_limit — aritmética de orçamento, sem exigência de amostra ────
  const withLifetime = recentCampaigns.filter(c => (c.lifetime_budget_cents ?? 0) > 0)
  if (withLifetime.length > 0) {
    // Acumulado da campanha: janela larga (operação começou há pouco; se um dia
    // passar de 1 ano de histórico, mover a soma para o service/RPC).
    const allTime = await getCampaignsWithStats(admin, {
      periodStart: isoDate(addDays(now, -BUDGET_LOOKBACK_DAYS)),
      periodEnd: recentEnd,
    })
    const spentById = new Map(allTime.map(c => [c.id, c.totals.spend_cents]))
    for (const c of withLifetime) {
      const budget = c.lifetime_budget_cents as number
      const spent = spentById.get(c.id) ?? 0
      const share = spent / budget
      if (share >= g.budget_alert_share) {
        alerts.push(alertOf(
          'budget_near_limit',
          share >= 1
            ? `Campanha ${c.identifier}: ${fmtBRL(spent)} gastos — orçamento total de ${fmtBRL(budget)} ESTOURADO (${formatPercent(share, 0)}).`
            : `Campanha ${c.identifier}: ${fmtBRL(spent)} gastos — ${formatPercent(share, 0)} do orçamento total de ${fmtBRL(budget)}.`,
          {
            spend_cents: spent,
            lifetime_budget_cents: budget,
            share,
            alert_share: g.budget_alert_share,
          },
          { level: 'campaign', id: c.id },
        ))
      }
    }
  }

  // ── Regras por anúncio (fadiga + vencedor sub-investido) ─────────────────────
  for (const c of recentCampaigns) {
    if (c.ads_count === 0) continue
    const [adsNow, adsBase] = await Promise.all([
      getAdsWithStats(admin, c.id, { periodStart: recentStart, periodEnd: recentEnd }),
      getAdsWithStats(admin, c.id, { periodStart: baselineStart, periodEnd: baselineEnd }),
    ])
    evaluated += adsNow.length
    const baseById = new Map(adsBase.map(a => [a.id, a]))
    const campaignSpend = adsNow.reduce((acc, a) => acc + a.totals.spend_cents, 0)
    const verdicts = classifyAds(adsNow.map(toPerformance))
    const verdictById = new Map(verdicts.map(v => [v.ad_id, v]))

    for (const ad of adsNow) {
      // ad_fatigue — CTR do próprio anúncio caindo, confiável nas duas janelas.
      const ctrNow = ad.derived.ctr
      const prior = baseById.get(ad.id)
      const ctrBase = prior?.derived.ctr
      if (
        ctrNow.reliable && ctrNow.value !== null &&
        ctrBase?.reliable && ctrBase.value !== null && ctrBase.value > 0 &&
        ctrNow.value <= ctrBase.value * g.fatigue_ratio
      ) {
        alerts.push(alertOf(
          'ad_fatigue',
          `Anúncio ${ad.identifier}: CTR caiu de ${formatPercent(ctrBase.value, 2)} para ${formatPercent(ctrNow.value, 2)} — sinal de fadiga do criativo.`,
          {
            ctr_recent: ctrNow.value,
            ctr_baseline: ctrBase.value,
            fatigue_ratio: g.fatigue_ratio,
            period_start: recentStart,
            period_end: recentEnd,
          },
          { level: 'ad', id: ad.id },
        ))
      }

      // winner_scale_opportunity — vencedor (classifyAds só marca com amostra
      // confiável) recebendo fatia pequena do gasto da campanha.
      const v = verdictById.get(ad.id)
      if (v?.verdict === 'winner' && campaignSpend > 0) {
        const share = ad.totals.spend_cents / campaignSpend
        if (share < WINNER_MIN_SHARE) {
          alerts.push(alertOf(
            'winner_scale_opportunity',
            `Anúncio ${ad.identifier} é vencedor (${v.rationale}) mas recebe só ${formatPercent(share, 0)} do gasto da campanha ${c.identifier} — oportunidade de escalar via aprovação.`,
            {
              spend_share: share,
              min_share: WINNER_MIN_SHARE,
              ad_spend_cents: ad.totals.spend_cents,
              campaign_spend_cents: campaignSpend,
              rationale: v.rationale,
            },
            { level: 'ad', id: ad.id },
          ))
        }
      }
    }
  }

  // ── lp_low_conversion — funil próprio das landing pages (janela cheia) ───────
  const { data: lpEvents, error: lpErr } = await admin
    .schema('marketing')
    .from('acquisition_events')
    .select('event_type, landing_page_id')
    .in('event_type', ['lp_view', 'lp_cta_click'])
    .not('landing_page_id', 'is', null)
    .gte('created_at', fullWindowStartIso)
    .limit(20000)
  if (lpErr) throw new Error(`Falha ao ler eventos de landing page: ${lpErr.message}`)

  const lpStats = new Map<string, { views: number; clicks: number }>()
  for (const ev of lpEvents ?? []) {
    const id = ev.landing_page_id as string
    const s = lpStats.get(id) ?? { views: 0, clicks: 0 }
    if (ev.event_type === 'lp_view') s.views++
    else s.clicks++
    lpStats.set(id, s)
  }
  for (const [lpId, s] of lpStats) {
    evaluated++
    // Amostra mínima de visitas faz o papel do "reliable" aqui.
    if (s.views < g.lp_min_views) continue
    const conversion = s.clicks / s.views
    if (conversion < g.lp_min_conversion) {
      alerts.push(alertOf(
        'lp_low_conversion',
        `Landing page com ${s.views} visitas e conversão de ${formatPercent(conversion, 2)} para o CTA — abaixo do mínimo de ${formatPercent(g.lp_min_conversion, 1)}.`,
        {
          views: s.views,
          cta_clicks: s.clicks,
          conversion,
          min_views: g.lp_min_views,
          min_conversion: g.lp_min_conversion,
          window_start: baselineStart,
          window_end: recentEnd,
        },
        { level: 'landing_page', id: lpId },
      ))
    }
  }

  // ── tracking_failure — gasto+cliques recentes sem NENHUM evento first-party ──
  evaluated++
  const [threeDay, eventCountRes] = await Promise.all([
    getFunnelSnapshot(admin, { periodStart: trackingStart, periodEnd: recentEnd }),
    admin
      .schema('marketing')
      .from('acquisition_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fullWindowStartIso),
  ])
  if (eventCountRes.error) {
    throw new Error(`Falha ao contar eventos de aquisição: ${eventCountRes.error.message}`)
  }
  const totalEvents = eventCountRes.count ?? 0
  if (threeDay.totals.spend_cents > 0 && threeDay.totals.clicks > 0 && totalEvents === 0) {
    alerts.push(alertOf(
      'tracking_failure',
      `${fmtBRL(threeDay.totals.spend_cents)} gastos e ${threeDay.totals.clicks} cliques nos últimos ${TRACKING_DAYS} dias, mas nenhum evento de aquisição em ${RECENT_DAYS + BASELINE_DAYS} dias — rastreamento provavelmente quebrado (verificar /lp, UTMs e cookie de atribuição).`,
      {
        spend_cents_3d: threeDay.totals.spend_cents,
        clicks_3d: threeDay.totals.clicks,
        acquisition_events_window: totalEvents,
        window_start: baselineStart,
        window_end: recentEnd,
      },
    ))
  }

  const created = alerts.length > 0 ? await createAlerts(admin, alerts) : 0
  return { created, evaluated }
}
