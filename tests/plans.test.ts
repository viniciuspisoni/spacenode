// Catálogo de planos: vitrine (SELLABLE_PLANS) × legado (Office, Starter).
//
// O Office foi aposentado para NOVAS assinaturas em 2026-08-31, e o Starter
// em 2026-09-12 (substituído pelo Essence). Os dois seguem no catálogo
// completo (PLANS) — o webhook resolve renovações pelo catálogo inteiro e
// assinantes existentes mantêm os benefícios. Estes testes travam a
// fronteira: nada legado escapa para vitrine/recomendação, e nada do legado
// é removido do catálogo.

import { describe, expect, it } from 'vitest'
import {
  PLANS,
  SELLABLE_PLANS,
  getPlanById,
  isPaidPlanId,
  isSellablePlanId,
  recommendPlan,
} from '@/lib/plans'

describe('vitrine vs. legado', () => {
  it('SELLABLE_PLANS é Essence/Pro/Studio, nesta ordem', () => {
    expect(SELLABLE_PLANS.map(p => p.id)).toEqual(['essence', 'pro', 'studio'])
  })

  it('Office continua no catálogo completo (renovação/benefícios), marcado como legado', () => {
    const office = PLANS.find(p => p.id === 'office')
    expect(office).toBeDefined()
    expect(office!.legacy).toBe(true)
    expect(office!.nodes).toBe(8000)
    // getPlanById segue resolvendo — é o que dá o plan_total do assinante legado
    expect(getPlanById('office')?.name).toBe('Office')
  })

  it('Starter continua no catálogo completo (renovação/benefícios), marcado como legado', () => {
    const starter = PLANS.find(p => p.id === 'starter')
    expect(starter).toBeDefined()
    expect(starter!.legacy).toBe(true)
    expect(starter!.monthlyPrice).toBe(89)
    expect(starter!.nodes).toBe(750)
    // getPlanById segue resolvendo — é o que dá o plan/nodes do assinante legado
    expect(getPlanById('starter')?.name).toBe('Starter')
  })

  it('Essence entra na vitrine com preço e nodes públicos', () => {
    const essence = PLANS.find(p => p.id === 'essence')
    expect(essence).toBeDefined()
    expect(essence!.legacy).toBeFalsy()
    expect(essence!.monthlyPrice).toBe(99)
    expect(essence!.nodes).toBe(800)
  })

  // Reajuste de 2026-09-19: R$349/3.500 -> R$399/4.000. O Studio é o topo da
  // vitrine, então é ele quem define o 100% do medidor da landing e o teto de
  // recommendPlan — travar preço e franquia aqui pega as duas regressões.
  it('Studio entra na vitrine com preço e nodes públicos', () => {
    const studio = PLANS.find(p => p.id === 'studio')
    expect(studio).toBeDefined()
    expect(studio!.legacy).toBeFalsy()
    expect(studio!.monthlyPrice).toBe(399)
    expect(studio!.nodes).toBe(4000)
  })

  it('a vitrine é uma escada: preço e franquia sobem juntos', () => {
    for (let i = 1; i < SELLABLE_PLANS.length; i++) {
      expect(SELLABLE_PLANS[i].monthlyPrice).toBeGreaterThan(SELLABLE_PLANS[i - 1].monthlyPrice)
      expect(SELLABLE_PLANS[i].nodes).toBeGreaterThan(SELLABLE_PLANS[i - 1].nodes)
    }
  })

  it('isPaidPlanId aceita planos legados (registros existentes); isSellablePlanId recusa (novas vendas)', () => {
    for (const id of ['office', 'starter']) {
      expect(isPaidPlanId(id)).toBe(true)
      expect(isSellablePlanId(id)).toBe(false)
    }
    for (const id of ['essence', 'pro', 'studio']) {
      expect(isPaidPlanId(id)).toBe(true)
      expect(isSellablePlanId(id)).toBe(true)
    }
    expect(isSellablePlanId('free')).toBe(false)
    expect(isSellablePlanId('x')).toBe(false)
  })

  it('recommendPlan nunca sugere legado — acima do Studio, devolve Studio', () => {
    expect(recommendPlan(100).id).toBe('essence')
    expect(recommendPlan(800).id).toBe('essence')
    expect(recommendPlan(1800).id).toBe('pro')
    expect(recommendPlan(4000).id).toBe('studio')
    // volume que só o Office cobriria: a resposta é Studio (+ extras/conversa)
    expect(recommendPlan(5000).id).toBe('studio')
    expect(recommendPlan(50000).id).toBe('studio')
  })
})
