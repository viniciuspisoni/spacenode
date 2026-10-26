import { describe, expect, it } from 'vitest'
import { POST_RESULT_BILLING_HREF, isPostResultBillingEntry, postResultBillingPlan, postResultCapacity } from '@/lib/onboarding/post-result'
import { getPlanById } from '@/lib/plans'

describe('convite após resultado útil', () => {
  it('usa Nodes do catálogo e não anuncia capacidade inválida ou zero', () => {
    expect(postResultCapacity(20)).toBe(Math.floor(getPlanById('essence')!.nodes / 20))
    expect(postResultCapacity(18)).toBe(44)
    for (const cost of [0, -1, NaN, Infinity, 801]) expect(postResultCapacity(cost)).toBeNull()
  })
  it('leva à revisão mensal escolhida sem parâmetros de retomada automática', () => {
    const url = new URL(POST_RESULT_BILLING_HREF, 'https://spacenode.app')
    expect(url.pathname).toBe('/app/billing')
    expect(url.hash).toBe('#plan-essence')
    expect(url.searchParams.has('resume')).toBe(false)
    const params = Object.fromEntries(url.searchParams)
    expect(postResultBillingPlan(params, true)).toBe('essence')
    expect(isPostResultBillingEntry(params)).toBe(true)
  })
  it('não destaca assinatura a pagantes, equipes ou parâmetros de plano/ciclo inválidos', () => {
    const params = { from: 'render_result', plan: 'essence', billing: 'monthly' }
    expect(postResultBillingPlan(params, false)).toBeNull()
    for (const change of [{ from: undefined }, { plan: 'starter' }, { plan: 'office' }, { billing: 'annual' }, { plan: 'invalid' }]) {
      expect(postResultBillingPlan({ ...params, ...change }, true)).toBeNull()
    }
  })
})
