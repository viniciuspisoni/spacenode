// lib/marketing/ads/metrics.ts
//
// Métricas derivadas de mídia paga. Módulo PURO (zero imports) — recebe números
// brutos (ad_metrics_daily agregado + funil de acquisition_events) e devolve
// derivadas com marcação explícita de confiabilidade estatística.
//
// Princípio (pedido do plano de aquisição): NUNCA apresentar conclusão baseada
// em amostra insuficiente como se fosse decisão confiável. Toda derivada sai
// como MetricValue { value, reliable, sampleNote } — a UI e o relatório exibem
// o valor, mas rotulam "amostra insuficiente" quando reliable=false.
//
// Dinheiro sempre em CENTAVOS de BRL (inteiro) — formatação é da UI.

export interface RawTotals {
  impressions: number
  clicks: number
  spend_cents: number
  /** Conversões first-party (marketing.acquisition_events). */
  signups: number
  /** Usuários do recorte que geraram ≥1 imagem (ativação, computada do produto). */
  activations: number
  checkouts_started: number
  subscriptions: number
  /** Receita atribuída no recorte (assinaturas + renovações), em centavos. */
  revenue_cents: number
}

export const EMPTY_TOTALS: RawTotals = {
  impressions: 0,
  clicks: 0,
  spend_cents: 0,
  signups: 0,
  activations: 0,
  checkouts_started: 0,
  subscriptions: 0,
  revenue_cents: 0,
}

/** Limiares mínimos para tratar uma derivada como confiável. Valores baixos de
 *  partida (operação pequena) — fixos em código; os guardrails de ALERTA é que
 *  vivem em brand_rules.ads_guardrails. */
export interface SampleThresholds {
  min_impressions_for_ctr: number
  min_clicks_for_cpc: number
  min_impressions_for_cpm: number
  min_clicks_for_conversion: number
  min_signups_for_cac: number
  min_subscriptions_for_cac: number
  min_subscriptions_for_roas: number
}

export const DEFAULT_THRESHOLDS: SampleThresholds = {
  min_impressions_for_ctr: 1000,
  min_clicks_for_cpc: 30,
  min_impressions_for_cpm: 1000,
  min_clicks_for_conversion: 50,
  min_signups_for_cac: 10,
  min_subscriptions_for_cac: 3,
  min_subscriptions_for_roas: 3,
}

export interface MetricValue {
  /** Valor calculado; null quando o denominador é zero. */
  value: number | null
  /** false = amostra abaixo do limiar — exibir, mas não decidir por ele. */
  reliable: boolean
  /** Explicação curta quando reliable=false (PT-BR, pronta para a UI). */
  sampleNote?: string
}

export interface DerivedMetrics {
  /** CTR em fração (0.012 = 1,2%). */
  ctr: MetricValue
  /** Custo por clique, centavos. */
  cpc_cents: MetricValue
  /** Custo por mil impressões, centavos. */
  cpm_cents: MetricValue
  /** Conversão clique → cadastro, fração. */
  click_to_signup: MetricValue
  /** Custo por cadastro, centavos. */
  cpa_signup_cents: MetricValue
  /** Cadastro → ativação (1ª geração), fração. */
  signup_to_activation: MetricValue
  /** Cadastro → assinatura, fração. */
  signup_to_subscription: MetricValue
  /** CAC: custo por assinatura, centavos. */
  cac_cents: MetricValue
  /** ROAS: receita atribuída / investimento (fração; 1.0 = empate). */
  roas: MetricValue
}

function ratio(
  numerator: number,
  denominator: number,
  reliable: boolean,
  note: string,
): MetricValue {
  if (denominator <= 0) {
    return { value: null, reliable: false, sampleNote: note }
  }
  return reliable
    ? { value: numerator / denominator, reliable: true }
    : { value: numerator / denominator, reliable: false, sampleNote: note }
}

export function computeDerivedMetrics(
  totals: RawTotals,
  thresholds: SampleThresholds = DEFAULT_THRESHOLDS,
): DerivedMetrics {
  const t = totals
  const th = thresholds
  return {
    ctr: ratio(
      t.clicks, t.impressions,
      t.impressions >= th.min_impressions_for_ctr,
      `menos de ${th.min_impressions_for_ctr} impressões — CTR ainda não é confiável`,
    ),
    cpc_cents: ratio(
      t.spend_cents, t.clicks,
      t.clicks >= th.min_clicks_for_cpc,
      `menos de ${th.min_clicks_for_cpc} cliques — CPC ainda não é confiável`,
    ),
    cpm_cents: (() => {
      const v = ratio(
        t.spend_cents * 1000, t.impressions,
        t.impressions >= th.min_impressions_for_cpm,
        `menos de ${th.min_impressions_for_cpm} impressões — CPM ainda não é confiável`,
      )
      return v
    })(),
    click_to_signup: ratio(
      t.signups, t.clicks,
      t.clicks >= th.min_clicks_for_conversion,
      `menos de ${th.min_clicks_for_conversion} cliques — conversão ainda não é confiável`,
    ),
    cpa_signup_cents: ratio(
      t.spend_cents, t.signups,
      t.signups >= th.min_signups_for_cac,
      `menos de ${th.min_signups_for_cac} cadastros — custo por cadastro ainda não é confiável`,
    ),
    signup_to_activation: ratio(
      t.activations, t.signups,
      t.signups >= th.min_signups_for_cac,
      `menos de ${th.min_signups_for_cac} cadastros — taxa de ativação ainda não é confiável`,
    ),
    signup_to_subscription: ratio(
      t.subscriptions, t.signups,
      t.signups >= th.min_signups_for_cac,
      `menos de ${th.min_signups_for_cac} cadastros — taxa de assinatura ainda não é confiável`,
    ),
    cac_cents: ratio(
      t.spend_cents, t.subscriptions,
      t.subscriptions >= th.min_subscriptions_for_cac,
      `menos de ${th.min_subscriptions_for_cac} assinaturas — CAC ainda não é confiável`,
    ),
    roas: ratio(
      t.revenue_cents, t.spend_cents,
      t.subscriptions >= th.min_subscriptions_for_roas,
      `menos de ${th.min_subscriptions_for_roas} assinaturas — ROAS ainda não é confiável`,
    ),
  }
}

/** Soma linhas brutas (ad_metrics_daily) num total. */
export function sumMetricRows(
  rows: Array<{ impressions: number; clicks: number; spend_cents: number }>,
): Pick<RawTotals, 'impressions' | 'clicks' | 'spend_cents'> {
  let impressions = 0
  let clicks = 0
  let spend = 0
  for (const r of rows) {
    impressions += r.impressions || 0
    clicks += r.clicks || 0
    spend += r.spend_cents || 0
  }
  return { impressions, clicks, spend_cents: spend }
}

// ── Comparação de anúncios (vencedores/perdedores) ─────────────────────────────

export interface AdPerformance {
  ad_id: string
  identifier: string
  totals: RawTotals
  derived: DerivedMetrics
}

export type VerdictKind = 'winner' | 'loser' | 'insufficient'

export interface AdVerdict extends AdPerformance {
  verdict: VerdictKind
  /** Justificativa curta em PT-BR. */
  rationale: string
}

/** Classifica anúncios em vencedores/perdedores pelo custo por cadastro (ou
 *  CTR quando ainda não há cadastros confiáveis). Anúncios sem amostra viram
 *  'insufficient' — nunca perdedores por falta de dado. */
export function classifyAds(perfs: AdPerformance[]): AdVerdict[] {
  const withCpa = perfs.filter(p => p.derived.cpa_signup_cents.reliable && p.derived.cpa_signup_cents.value !== null)

  // Referência: mediana do custo por cadastro entre os confiáveis.
  const cpas = withCpa
    .map(p => p.derived.cpa_signup_cents.value as number)
    .sort((a, b) => a - b)
  const median = cpas.length ? cpas[Math.floor(cpas.length / 2)] : null

  return perfs.map(p => {
    const cpa = p.derived.cpa_signup_cents
    if (cpa.reliable && cpa.value !== null && median !== null) {
      if (cpa.value <= median * 0.8) {
        return { ...p, verdict: 'winner', rationale: `Custo por cadastro ${fmtBRL(cpa.value)} — pelo menos 20% melhor que a mediana (${fmtBRL(median)})` }
      }
      if (cpa.value >= median * 1.5) {
        return { ...p, verdict: 'loser', rationale: `Custo por cadastro ${fmtBRL(cpa.value)} — 50% acima da mediana (${fmtBRL(median)})` }
      }
      return { ...p, verdict: 'insufficient', rationale: 'Desempenho dentro da faixa da mediana — seguir observando' }
    }
    // Sem cadastro confiável: CTR confiável muito baixo já condena o criativo.
    const ctr = p.derived.ctr
    if (ctr.reliable && ctr.value !== null && ctr.value < 0.004) {
      return { ...p, verdict: 'loser', rationale: `CTR ${(ctr.value * 100).toFixed(2)}% com amostra suficiente — criativo não atrai o público` }
    }
    return { ...p, verdict: 'insufficient', rationale: cpa.sampleNote ?? ctr.sampleNote ?? 'Amostra insuficiente para veredito' }
  })
}

/** Formata centavos como R$ (uso interno de mensagens; a UI tem o próprio formatador). */
export function fmtBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

// ── Redistribuição de orçamento (recomendação, nunca execução) ─────────────────

export interface BudgetSuggestion {
  ad_id: string
  identifier: string
  current_share: number
  suggested_share: number
  rationale: string
}

/** Sugere redistribuição proporcional ao inverso do custo por cadastro entre
 *  anúncios confiáveis; quem não tem amostra mantém uma fatia mínima de
 *  exploração. Saída é recomendação para ad_pending_actions — nada executa. */
export function suggestBudgetSplit(perfs: AdPerformance[]): BudgetSuggestion[] {
  if (perfs.length === 0) return []
  const totalSpend = perfs.reduce((acc, p) => acc + p.totals.spend_cents, 0)

  const reliable = perfs.filter(
    p => p.derived.cpa_signup_cents.reliable && (p.derived.cpa_signup_cents.value ?? 0) > 0,
  )
  if (reliable.length === 0 || totalSpend === 0) {
    // Sem base confiável: manter divisão igual e dizer o porquê.
    const equal = 1 / perfs.length
    return perfs.map(p => ({
      ad_id: p.ad_id,
      identifier: p.identifier,
      current_share: totalSpend > 0 ? p.totals.spend_cents / totalSpend : equal,
      suggested_share: equal,
      rationale: 'Sem amostra confiável — manter divisão igual até acumular dados',
    }))
  }

  // 20% do orçamento reservado para exploração dos sem-amostra (se existirem).
  const explorers = perfs.filter(p => !reliable.includes(p))
  const exploreShare = explorers.length > 0 ? 0.2 : 0
  const exploitShare = 1 - exploreShare

  const inverses = reliable.map(p => 1 / (p.derived.cpa_signup_cents.value as number))
  const invSum = inverses.reduce((a, b) => a + b, 0)

  const suggestions: BudgetSuggestion[] = reliable.map((p, i) => ({
    ad_id: p.ad_id,
    identifier: p.identifier,
    current_share: p.totals.spend_cents / totalSpend,
    suggested_share: exploitShare * (inverses[i] / invSum),
    rationale: `Custo por cadastro ${fmtBRL(p.derived.cpa_signup_cents.value as number)} — fatia proporcional à eficiência`,
  }))
  for (const p of explorers) {
    suggestions.push({
      ad_id: p.ad_id,
      identifier: p.identifier,
      current_share: p.totals.spend_cents / totalSpend,
      suggested_share: exploreShare / explorers.length,
      rationale: 'Amostra insuficiente — fatia de exploração para coletar dados',
    })
  }
  return suggestions
}
