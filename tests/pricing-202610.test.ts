import { afterEach, describe, expect, it, vi } from 'vitest'
import { SELLABLE_PLANS, getStripePriceId, findPlanByStripePriceId, matchesPublishedPrice } from '@/lib/plans'
import { runBrandCheck } from '@/lib/marketing/brand-check'

afterEach(() => vi.unstubAllEnvs())

describe('nova tabela e preservação dos contratos', () => {
  it('anuais são exatamente 25% menores que doze mensalidades, sem arredondar o equivalente', () => {
    expect(SELLABLE_PLANS.map(p => [p.monthlyPrice, p.annualTotal, p.annualMonthlyPrice, p.nodes]))
      .toEqual([[149, 1341, 111.75, 800], [299, 2691, 224.25, 1800], [499, 4491, 374.25, 4000]])
    for (const p of SELLABLE_PLANS) {
      expect(p.annualTotal).toBe(p.monthlyPrice * 12 * .75)
      expect(p.annualMonthlyPrice * 12).toBe(p.annualTotal)
    }
  })

  it('nova compra usa exclusivamente o ID novo; renovações reconhecem os dois IDs', () => {
    vi.stubEnv('STRIPE_PRICE_ID_ESSENCE_MONTHLY', 'price_old')
    vi.stubEnv('STRIPE_PRICE_ID_ESSENCE_MONTHLY_V202610', '')
    expect(getStripePriceId('essence', 'monthly')).toBeFalsy()
    expect(findPlanByStripePriceId('price_old')?.plan.id).toBe('essence')
    vi.stubEnv('STRIPE_PRICE_ID_ESSENCE_MONTHLY_V202610', 'price_new')
    expect(getStripePriceId('essence', 'monthly')).toBe('price_new')
    expect(findPlanByStripePriceId('price_old')?.plan.nodes).toBe(800)
    expect(findPlanByStripePriceId('price_new')?.plan.nodes).toBe(800)
  })

  it('recusa preço antigo, moeda, intervalo ou total incompatível com a vitrine', () => {
    const plan = SELLABLE_PLANS[0]
    const price = { active: true, currency: 'brl', unit_amount: 14900, recurring: { interval: 'month', interval_count: 1 } }
    expect(matchesPublishedPrice(price, plan, 'monthly')).toBe(true)
    for (const change of [{ unit_amount: 9900 }, { currency: 'usd' }, { active: false }, { recurring: { interval: 'year', interval_count: 1 } }]) {
      expect(matchesPublishedPrice({ ...price, ...change }, plan, 'monthly')).toBe(false)
    }
    expect(matchesPublishedPrice({ ...price, unit_amount: 134100, recurring: { interval: 'year', interval_count: 1 } }, plan, 'annual')).toBe(true)
    expect(matchesPublishedPrice({ ...price, unit_amount: 11175 }, plan, 'annual')).toBe(false)
  })

  it('bloqueia divulgação com oferta antiga e permite os valores novos e pacotes extras', () => {
    for (const caption of ['Planos a partir de R$ 99/mês.', 'Essence por R$ 99,00', 'Studio: R$ 399 mensais', 'Assinaturas a partir de R$ 89.']) {
      expect(runBrandCheck({ caption }).issues.some(i => i.code === 'outdated_pricing')).toBe(true)
    }
    for (const caption of ['Planos a partir de R$ 149/mês.', 'Studio: R$ 499 mensais', '500 Nodes extras por R$ 89.', 'Essence anual de R$ 1.341,00, equivalente a R$ 111,75/mês.']) {
      expect(runBrandCheck({ caption }).issues.some(i => i.code === 'outdated_pricing')).toBe(false)
    }
  })
})
