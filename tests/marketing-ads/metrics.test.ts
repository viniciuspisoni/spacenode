// Métricas derivadas de mídia paga — o princípio duro do plano de aquisição:
// amostra insuficiente NUNCA vira decisão. Estes testes fixam o contrato de
// lib/marketing/ads/metrics.ts (valores calculados na mão + confiabilidade).

import { describe, expect, it } from 'vitest'
import {
  classifyAds,
  computeDerivedMetrics,
  EMPTY_TOTALS,
  suggestBudgetSplit,
  sumMetricRows,
  type AdPerformance,
  type RawTotals,
} from '@/lib/marketing/ads/metrics'

function totals(partial: Partial<RawTotals>): RawTotals {
  return { ...EMPTY_TOTALS, ...partial }
}

function perf(id: string, t: RawTotals): AdPerformance {
  return { ad_id: id, identifier: `SN_META_PROSPECCAO_${id.toUpperCase()}`, totals: t, derived: computeDerivedMetrics(t) }
}

describe('computeDerivedMetrics', () => {
  it('tudo zero → value null e reliable false em todas as derivadas', () => {
    const d = computeDerivedMetrics(EMPTY_TOTALS)
    for (const m of Object.values(d)) {
      expect(m.value).toBeNull()
      expect(m.reliable).toBe(false)
      expect(m.sampleNote).toBeTruthy()
    }
  })

  it('amostra abaixo do limiar → valor calculado mas reliable false com sampleNote', () => {
    const d = computeDerivedMetrics(
      totals({ impressions: 500, clicks: 20, spend_cents: 4000, signups: 2 }),
    )
    // CTR: 20/500 = 4% — mas 500 < 1000 impressões
    expect(d.ctr.value).toBeCloseTo(0.04)
    expect(d.ctr.reliable).toBe(false)
    expect(d.ctr.sampleNote).toContain('1000 impressões')
    // CPC: 4000/20 = 200 centavos — mas 20 < 30 cliques
    expect(d.cpc_cents.value).toBe(200)
    expect(d.cpc_cents.reliable).toBe(false)
    // Custo por cadastro: 4000/2 = 2000 — mas 2 < 10 cadastros
    expect(d.cpa_signup_cents.value).toBe(2000)
    expect(d.cpa_signup_cents.reliable).toBe(false)
    expect(d.cpa_signup_cents.sampleNote).toContain('10 cadastros')
  })

  it('amostra acima do limiar → reliable true e valores exatos', () => {
    const d = computeDerivedMetrics(
      totals({
        impressions: 10000,
        clicks: 300,
        spend_cents: 60000,
        signups: 20,
        activations: 10,
        checkouts_started: 8,
        subscriptions: 5,
        revenue_cents: 100000,
      }),
    )
    expect(d.ctr).toEqual({ value: 300 / 10000, reliable: true })
    expect(d.cpc_cents).toEqual({ value: 60000 / 300, reliable: true })
    expect(d.cpm_cents).toEqual({ value: (60000 * 1000) / 10000, reliable: true })
    expect(d.click_to_signup).toEqual({ value: 20 / 300, reliable: true })
    expect(d.cpa_signup_cents).toEqual({ value: 60000 / 20, reliable: true })
    expect(d.signup_to_activation).toEqual({ value: 10 / 20, reliable: true })
    expect(d.signup_to_subscription).toEqual({ value: 5 / 20, reliable: true })
    expect(d.cac_cents).toEqual({ value: 60000 / 5, reliable: true })
    expect(d.roas.value).toBeCloseTo(100000 / 60000)
    expect(d.roas.reliable).toBe(true)
  })
})

describe('sumMetricRows', () => {
  it('soma impressões, cliques e gasto', () => {
    expect(
      sumMetricRows([
        { impressions: 100, clicks: 5, spend_cents: 1200 },
        { impressions: 250, clicks: 12, spend_cents: 3300 },
        { impressions: 0, clicks: 0, spend_cents: 0 },
      ]),
    ).toEqual({ impressions: 350, clicks: 17, spend_cents: 4500 })
  })

  it('lista vazia → zeros', () => {
    expect(sumMetricRows([])).toEqual({ impressions: 0, clicks: 0, spend_cents: 0 })
  })
})

describe('classifyAds', () => {
  // Três anúncios com custo por cadastro confiável (10 cadastros cada):
  // A = R$ 10,00 · B = R$ 20,00 (mediana) · C = R$ 40,00
  const base = { impressions: 10000, clicks: 200 }
  const a = perf('a', totals({ ...base, spend_cents: 10000, signups: 10 }))
  const b = perf('b', totals({ ...base, spend_cents: 20000, signups: 10 }))
  const c = perf('c', totals({ ...base, spend_cents: 40000, signups: 10 }))

  it('vencedor ≤ 0.8× a mediana, perdedor ≥ 1.5×', () => {
    const verdicts = classifyAds([a, b, c])
    expect(verdicts.find(v => v.ad_id === 'a')?.verdict).toBe('winner')
    expect(verdicts.find(v => v.ad_id === 'c')?.verdict).toBe('loser')
    // Dentro da faixa: não é vencedor nem perdedor — seguir observando
    expect(verdicts.find(v => v.ad_id === 'b')?.verdict).toBe('insufficient')
  })

  it('CTR baixo com amostra suficiente condena o criativo mesmo sem cadastros', () => {
    // 10/5000 = 0.2% < 0.4%, com ≥1000 impressões — e nenhum cadastro confiável
    const fraco = perf('fraco', totals({ impressions: 5000, clicks: 10, spend_cents: 3000 }))
    const [v] = classifyAds([fraco])
    expect(v.verdict).toBe('loser')
    expect(v.rationale).toContain('CTR')
  })

  it('sem amostra → insufficient, nunca perdedor por falta de dado', () => {
    const [v] = classifyAds([perf('novo', EMPTY_TOTALS)])
    expect(v.verdict).toBe('insufficient')
    expect(v.rationale).toBeTruthy()
  })
})

describe('suggestBudgetSplit', () => {
  it('lista vazia → sem sugestão', () => {
    expect(suggestBudgetSplit([])).toEqual([])
  })

  it('sem base confiável → divisão igual com justificativa', () => {
    const perfs = [perf('a', EMPTY_TOTALS), perf('b', EMPTY_TOTALS)]
    const out = suggestBudgetSplit(perfs)
    expect(out).toHaveLength(2)
    for (const s of out) {
      expect(s.suggested_share).toBeCloseTo(0.5)
      expect(s.rationale).toContain('Sem amostra confiável')
    }
    expect(out.reduce((acc, s) => acc + s.suggested_share, 0)).toBeCloseTo(1)
  })

  it('reserva 20% de exploração para quem não tem amostra', () => {
    const base = { impressions: 10000, clicks: 200 }
    const a = perf('a', totals({ ...base, spend_cents: 10000, signups: 10 }))  // cpa 1000
    const b = perf('b', totals({ ...base, spend_cents: 20000, signups: 10 }))  // cpa 2000
    const novo = perf('novo', totals({ spend_cents: 5000 }))                   // sem amostra
    const out = suggestBudgetSplit([a, b, novo])

    const shareA = out.find(s => s.ad_id === 'a')?.suggested_share ?? 0
    const shareB = out.find(s => s.ad_id === 'b')?.suggested_share ?? 0
    const shareNovo = out.find(s => s.ad_id === 'novo')?.suggested_share ?? 0

    // 80% de exploração proporcional ao inverso do custo por cadastro
    expect(shareA).toBeCloseTo(0.8 * (2 / 3))
    expect(shareB).toBeCloseTo(0.8 * (1 / 3))
    expect(shareNovo).toBeCloseTo(0.2)
    expect(shareA + shareB + shareNovo).toBeCloseTo(1)
    // Mais eficiente (menor custo por cadastro) recebe mais
    expect(shareA).toBeGreaterThan(shareB)
  })

  it('sem exploradores, os confiáveis dividem 100%', () => {
    const base = { impressions: 10000, clicks: 200 }
    const a = perf('a', totals({ ...base, spend_cents: 10000, signups: 10 }))
    const b = perf('b', totals({ ...base, spend_cents: 30000, signups: 10 }))
    const out = suggestBudgetSplit([a, b])
    expect(out.reduce((acc, s) => acc + s.suggested_share, 0)).toBeCloseTo(1)
  })
})
