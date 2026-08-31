// Catálogo de planos: vitrine (SELLABLE_PLANS) × legado (Office).
//
// O Office foi aposentado para NOVAS assinaturas em 2026-08-31, mas segue
// no catálogo completo (PLANS) — o webhook resolve renovações pelo catálogo
// inteiro e assinantes existentes mantêm os benefícios. Estes testes travam
// a fronteira: nada legado escapa para vitrine/recomendação, e nada do
// legado é removido do catálogo.

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
  it('SELLABLE_PLANS é Starter/Pro/Studio, nesta ordem', () => {
    expect(SELLABLE_PLANS.map(p => p.id)).toEqual(['starter', 'pro', 'studio'])
  })

  it('Office continua no catálogo completo (renovação/benefícios), marcado como legado', () => {
    const office = PLANS.find(p => p.id === 'office')
    expect(office).toBeDefined()
    expect(office!.legacy).toBe(true)
    expect(office!.nodes).toBe(8000)
    // getPlanById segue resolvendo — é o que dá o plan_total do assinante legado
    expect(getPlanById('office')?.name).toBe('Office')
  })

  it('isPaidPlanId aceita office (registros existentes); isSellablePlanId recusa (novas vendas)', () => {
    expect(isPaidPlanId('office')).toBe(true)
    expect(isSellablePlanId('office')).toBe(false)
    for (const id of ['starter', 'pro', 'studio']) {
      expect(isPaidPlanId(id)).toBe(true)
      expect(isSellablePlanId(id)).toBe(true)
    }
    expect(isSellablePlanId('free')).toBe(false)
    expect(isSellablePlanId('x')).toBe(false)
  })

  it('recommendPlan nunca sugere legado — acima do Studio, devolve Studio', () => {
    expect(recommendPlan(100).id).toBe('starter')
    expect(recommendPlan(1800).id).toBe('pro')
    expect(recommendPlan(3500).id).toBe('studio')
    // volume que só o Office cobriria: a resposta é Studio (+ extras/conversa)
    expect(recommendPlan(5000).id).toBe('studio')
    expect(recommendPlan(50000).id).toBe('studio')
  })
})
