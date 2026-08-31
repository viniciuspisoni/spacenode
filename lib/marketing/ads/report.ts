// lib/marketing/ads/report.ts
//
// Relatório periódico de tráfego pago — 100% DETERMINÍSTICO, zero IA: números
// não se inventam nem se parafraseiam com modelo. O texto é montado dos dados
// reais (getFunnelSnapshot/getCampaignsWithStats/getAdsWithStats) e TODA
// métrica com amostra insuficiente sai marcada como "(amostra insuficiente)" —
// nunca apresentada como conclusão confiável.
//
// A "Recomendação de orçamento" (suggestBudgetSplit) é só recomendação: a
// execução de qualquer mudança passa pela fila de aprovação humana
// (ad_pending_actions) — este módulo não muda status nem gasto.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getAdsWithStats,
  getCampaignsWithStats,
  getFunnelSnapshot,
  listAlerts,
  listExperiments,
  saveReport,
} from './service'
import {
  classifyAds,
  suggestBudgetSplit,
  type AdPerformance,
  type AdVerdict,
  type BudgetSuggestion,
  type MetricValue,
} from './metrics'
import {
  formatBRLFromCents,
  formatInt,
  formatMetricBRL,
  formatMetricPercent,
  formatPercent,
  formatRoas,
} from './format'
import type {
  AdAlert,
  AdExperiment,
  AdReport,
  AdWithStats,
  CampaignWithStats,
} from './types'

// ── Datas ──────────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_PERIOD_DAYS = 90

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return isoDate(d)
}

function diffDays(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00.000Z`).getTime()
  const end = new Date(`${endIso}T00:00:00.000Z`).getTime()
  return Math.round((end - start) / 86_400_000)
}

/** DD/MM/AAAA sem passar por Date.toLocale* (evita drift de fuso no server). */
function brDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Período padrão do relatório: últimos `days` dias terminando hoje — "hoje"
 *  no fuso da conta de anúncios (America/Sao_Paulo), como metric_date.
 *  isoDate/addDaysIso seguem em UTC puro (aritmética date-only). */
export function defaultReportPeriod(days = 7): { periodStart: string; periodEnd: string } {
  const nowSp = new Date(Date.now() - 3 * 3_600_000)
  return {
    periodStart: isoDate(new Date(nowSp.getTime() - (days - 1) * 86_400_000)),
    periodEnd: isoDate(nowSp),
  }
}

// ── Formatação de métricas com marcação de amostra ─────────────────────────────

function metricLine(label: string, m: MetricValue, kind: 'brl' | 'pct' | 'roas'): string {
  const value =
    kind === 'brl' ? formatMetricBRL(m)
    : kind === 'pct' ? formatMetricPercent(m)
    : formatRoas(m.value)
  return `- ${label}: ${value}${m.reliable ? '' : ' (amostra insuficiente)'}`
}

function deltaNote(cur: number, prev: number): string {
  if (prev <= 0) {
    return cur > 0 ? '(sem base de comparação no período anterior)' : '(sem movimento nos dois períodos)'
  }
  const pct = ((cur - prev) / prev) * 100
  const sign = pct >= 0 ? '+' : ''
  return `(${sign}${pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% vs período anterior)`
}

const VERDICT_LABELS: Record<AdVerdict['verdict'], string> = {
  winner: 'vencedor',
  loser: 'perdedor',
  insufficient: 'sem veredito (amostra)',
}

// ── Geração ────────────────────────────────────────────────────────────────────

interface CampaignBundle {
  campaign: CampaignWithStats
  ads: AdWithStats[]
  verdicts: AdVerdict[]
  budget: BudgetSuggestion[]
}

function toPerformance(a: AdWithStats): AdPerformance {
  return { ad_id: a.id, identifier: a.identifier, totals: a.totals, derived: a.derived }
}

/** Dimensões da matriz de experimentação cobertas pelos anúncios existentes.
 *  Dimensão com menos de 2 valores distintos = célula sem cobertura (nada foi
 *  comparado ali ainda). */
function coverageGaps(ads: AdWithStats[]): string[] {
  const dims: Array<{ pick: (a: AdWithStats) => string | null; label: string }> = [
    { pick: a => a.persona, label: 'persona' },
    { pick: a => a.pain, label: 'dor' },
    { pick: a => a.promise, label: 'promessa' },
    { pick: a => a.format, label: 'formato' },
    { pick: a => a.creative_label, label: 'criativo' },
    { pick: a => a.copy_variant, label: 'copy' },
  ]
  const gaps: string[] = []
  for (const dim of dims) {
    const values = new Set(ads.map(dim.pick).filter((v): v is string => Boolean(v)))
    if (values.size === 0) {
      gaps.push(`Dimensão "${dim.label}": nenhum valor registrado nos anúncios — matriz sem cobertura.`)
    } else if (values.size === 1) {
      gaps.push(`Dimensão "${dim.label}": só "${[...values][0]}" testado — sem variação para comparar.`)
    }
  }
  return gaps
}

export async function generateAdsReport(
  admin: SupabaseClient,
  opts: { periodStart: string; periodEnd: string },
  userId: string | null,
): Promise<AdReport> {
  const { periodStart, periodEnd } = opts
  if (!DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd)) {
    throw new Error('Datas do período devem estar no formato YYYY-MM-DD')
  }
  const lenDays = diffDays(periodStart, periodEnd) + 1
  if (lenDays < 1) throw new Error('Período inválido — a data inicial vem depois da final')
  if (lenDays > MAX_PERIOD_DAYS) throw new Error(`Período máximo de ${MAX_PERIOD_DAYS} dias`)

  // Período anterior de MESMO tamanho, imediatamente antes.
  const prevEnd = addDaysIso(periodStart, -1)
  const prevStart = addDaysIso(prevEnd, -(lenDays - 1))

  const [funnel, prevFunnel, campaigns, experiments, openAlerts] = await Promise.all([
    getFunnelSnapshot(admin, { periodStart, periodEnd }),
    getFunnelSnapshot(admin, { periodStart: prevStart, periodEnd: prevEnd }),
    getCampaignsWithStats(admin, { periodStart, periodEnd }),
    listExperiments(admin).catch(() => [] as AdExperiment[]),
    listAlerts(admin, { status: 'open' }).catch(() => [] as AdAlert[]),
  ])

  const bundles: CampaignBundle[] = await Promise.all(
    campaigns.map(async campaign => {
      const ads = await getAdsWithStats(admin, campaign.id, { periodStart, periodEnd })
      const perfs = ads.map(toPerformance)
      return { campaign, ads, verdicts: classifyAds(perfs), budget: suggestBudgetSplit(perfs) }
    }),
  )

  const t = funnel.totals
  const p = prevFunnel.totals
  const allAds = bundles.flatMap(b => b.ads)
  const losers = bundles.flatMap(b => b.verdicts.filter(v => v.verdict === 'loser'))
  const criticalAlerts = openAlerts.filter(a => a.severity === 'critical')
  const concluded = experiments.filter(e => e.status === 'validated' || e.status === 'invalidated')
  const planned = experiments.filter(e => e.status === 'planned')

  const md: string[] = []
  md.push(`# Tráfego pago — ${brDate(periodStart)} a ${brDate(periodEnd)}`)
  md.push('')
  md.push(`_Comparação com o período anterior de mesmo tamanho: ${brDate(prevStart)} a ${brDate(prevEnd)}._`)

  // ── O que aconteceu ──────────────────────────────────────────────────────────
  md.push('', '## O que aconteceu', '')
  md.push(`- Investimento: ${formatBRLFromCents(t.spend_cents)} ${deltaNote(t.spend_cents, p.spend_cents)}`)
  md.push(`- Impressões: ${formatInt(t.impressions)} ${deltaNote(t.impressions, p.impressions)}`)
  md.push(`- Cliques: ${formatInt(t.clicks)} ${deltaNote(t.clicks, p.clicks)}`)
  md.push(`- Cadastros: ${formatInt(t.signups)} ${deltaNote(t.signups, p.signups)}`)
  md.push(`- Assinaturas: ${formatInt(t.subscriptions)} ${deltaNote(t.subscriptions, p.subscriptions)}`)
  md.push(`- Receita atribuída: ${formatBRLFromCents(t.revenue_cents)} ${deltaNote(t.revenue_cents, p.revenue_cents)}`)

  // ── Investimento ─────────────────────────────────────────────────────────────
  md.push('', '## Investimento', '')
  md.push(`- Total do período: ${formatBRLFromCents(t.spend_cents)}`)
  if (campaigns.length === 0) {
    md.push('- Nenhuma campanha com dados no período.')
  } else {
    for (const c of campaigns) {
      const share = t.spend_cents > 0 ? formatPercent(c.totals.spend_cents / t.spend_cents, 0) : '—'
      md.push(`- ${c.name} (${c.identifier}): ${formatBRLFromCents(c.totals.spend_cents)} — ${share} do total — status ${c.status}`)
    }
  }

  // ── Aquisição ────────────────────────────────────────────────────────────────
  md.push('', '## Aquisição', '')
  md.push(`- Cadastros: ${formatInt(t.signups)}`)
  md.push(metricLine('Custo por cadastro', funnel.derived.cpa_signup_cents, 'brl'))
  md.push(`- Ativações (1ª geração): ${formatInt(t.activations)}`)
  md.push(metricLine('Cadastro → ativação', funnel.derived.signup_to_activation, 'pct'))
  md.push(`- Assinaturas: ${formatInt(t.subscriptions)}`)
  md.push(metricLine('Cadastro → assinatura', funnel.derived.signup_to_subscription, 'pct'))
  md.push(metricLine('CAC', funnel.derived.cac_cents, 'brl'))
  md.push(metricLine('ROAS', funnel.derived.roas, 'roas'))

  // ── Vencedores e perdedores ──────────────────────────────────────────────────
  md.push('', '## Vencedores e perdedores', '')
  if (allAds.length === 0) {
    md.push('- Nenhum anúncio com dados no período.')
  } else {
    for (const b of bundles) {
      if (b.verdicts.length === 0) continue
      md.push(`### ${b.campaign.name} (${b.campaign.identifier})`, '')
      for (const v of b.verdicts) {
        md.push(`- ${v.identifier} — ${VERDICT_LABELS[v.verdict]} — ${v.rationale}`)
      }
      md.push('')
    }
  }

  // ── O que pausar ─────────────────────────────────────────────────────────────
  md.push('## O que pausar', '')
  if (losers.length === 0 && criticalAlerts.length === 0) {
    md.push('- Nada a pausar com base nos dados atuais.')
  } else {
    for (const v of losers) {
      md.push(`- Anúncio ${v.identifier}: ${v.rationale} — recomendar pausa (via aprovação).`)
    }
    for (const a of criticalAlerts) {
      md.push(`- Alerta crítico aberto (${a.alert_type}): ${a.message}`)
    }
  }

  // ── Hipóteses ────────────────────────────────────────────────────────────────
  md.push('', '## Hipóteses', '')
  if (concluded.length === 0) {
    md.push('- Nenhum experimento concluído até aqui.')
  } else {
    for (const e of concluded.slice(0, 10)) {
      const label = e.status === 'validated' ? 'validada' : 'refutada'
      md.push(`- [${label}] ${e.name}: ${e.conclusion ?? 'sem conclusão registrada'}`)
    }
  }

  // ── Próximos testes ──────────────────────────────────────────────────────────
  const gaps = coverageGaps(allAds)
  md.push('', '## Próximos testes', '')
  if (planned.length === 0 && gaps.length === 0) {
    md.push('- Nenhum experimento planejado e matriz sem lacunas óbvias — planejar a próxima rodada.')
  } else {
    for (const e of planned.slice(0, 10)) {
      md.push(`- Planejado: ${e.name} — ${e.hypothesis}`)
    }
    for (const gap of gaps) {
      md.push(`- ${gap}`)
    }
  }

  // ── Recomendação de orçamento ────────────────────────────────────────────────
  md.push('', '## Recomendação de orçamento', '')
  md.push('_Recomendação do sistema — nada é executado automaticamente; qualquer mudança de orçamento passa pela fila de aprovação humana._', '')
  const withBudget = bundles.filter(b => b.budget.length > 0)
  if (withBudget.length === 0) {
    md.push('- Sem anúncios para redistribuir orçamento no período.')
  } else {
    for (const b of withBudget) {
      md.push(`### ${b.campaign.name} (${b.campaign.identifier})`, '')
      for (const s of b.budget) {
        md.push(`- ${s.identifier}: atual ${formatPercent(s.current_share, 0)} → sugerido ${formatPercent(s.suggested_share, 0)} — ${s.rationale}`)
      }
      md.push('')
    }
  }

  // ── Dados ainda insuficientes ────────────────────────────────────────────────
  md.push('## Dados ainda insuficientes', '')
  const derivedLabeled: Array<{ label: string; m: MetricValue }> = [
    { label: 'CTR', m: funnel.derived.ctr },
    { label: 'CPC', m: funnel.derived.cpc_cents },
    { label: 'CPM', m: funnel.derived.cpm_cents },
    { label: 'Clique → cadastro', m: funnel.derived.click_to_signup },
    { label: 'Custo por cadastro', m: funnel.derived.cpa_signup_cents },
    { label: 'Cadastro → ativação', m: funnel.derived.signup_to_activation },
    { label: 'Cadastro → assinatura', m: funnel.derived.signup_to_subscription },
    { label: 'CAC', m: funnel.derived.cac_cents },
    { label: 'ROAS', m: funnel.derived.roas },
  ]
  const insufficient = derivedLabeled.filter(d => !d.m.reliable)
  if (insufficient.length === 0) {
    md.push('- Todas as métricas principais têm amostra suficiente neste período.')
  } else {
    for (const d of insufficient) {
      md.push(`- ${d.label}: ${d.m.sampleNote ?? 'amostra insuficiente para concluir'}`)
    }
    md.push('', 'Não tomar decisão de escala/pausa baseada apenas nas métricas acima até acumular amostra.')
  }

  // ── Persistência ─────────────────────────────────────────────────────────────
  const data: Record<string, unknown> = {
    totals: funnel.totals,
    derived: funnel.derived,
    previous_period: { start: prevStart, end: prevEnd },
    previous_totals: prevFunnel.totals,
    campaigns: bundles.map(b => ({
      id: b.campaign.id,
      identifier: b.campaign.identifier,
      status: b.campaign.status,
      totals: b.campaign.totals,
      winners: b.verdicts.filter(v => v.verdict === 'winner').map(v => v.identifier),
      losers: b.verdicts.filter(v => v.verdict === 'loser').map(v => v.identifier),
      budget_suggestions: b.budget,
    })),
    experiments: {
      validated: concluded.filter(e => e.status === 'validated').map(e => e.id),
      invalidated: concluded.filter(e => e.status === 'invalidated').map(e => e.id),
      planned: planned.map(e => e.id),
    },
    open_alerts: openAlerts.length,
    open_critical_alerts: criticalAlerts.length,
  }

  return saveReport(
    admin,
    {
      period_start: periodStart,
      period_end: periodEnd,
      title: `Tráfego pago — ${brDate(periodStart)} a ${brDate(periodEnd)}`,
      summary_md: md.join('\n'),
      data,
      status: 'final',
    },
    userId,
  )
}
