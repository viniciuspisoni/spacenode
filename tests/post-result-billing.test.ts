import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ balance: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'qa-owner' } } }) } }) }))
vi.mock('@/lib/workspaces/balance', () => ({ getPayerBalance: mocks.balance }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => table === 'profiles'
  ? { select: () => ({ eq: () => ({ single: async () => ({ data: { stripe_customer_id: null, stripe_subscription_id: null } }) }) }) }
  : { select: () => ({ eq: () => ({ eq: () => ({ gt: () => ({ order: async () => ({ data: [] }) }) }) }) }) },
}) }))
vi.mock('@/app/app/billing/BillingClient', () => ({ BillingClient: () => null }))
import BillingPage from '@/app/app/billing/page'

beforeEach(() => {
  mocks.balance.mockResolvedValue({ planId: 'free', pooled: false, payerId: 'qa-owner', totalBalance: 40, planBalance: 40, extraBalance: 0, planNodesExpireAt: null })
})

describe('entrada real do resultado na página de planos', () => {
  it('destaca Essence e recusa abertura automática mesmo com resume acrescentado à URL', async () => {
    const page = await BillingPage({ searchParams: Promise.resolve({ from: 'render_result', plan: 'essence', billing: 'monthly', resume: '1' }) })
    expect(page.props.postResultPlan).toBe('essence')
    expect(page.props.resume).toBeNull()
  })
  it('mantém a retomada explícita antiga de quem veio da landing', async () => {
    const page = await BillingPage({ searchParams: Promise.resolve({ plan: 'essence', billing: 'monthly', resume: '1' }) })
    expect(page.props.resume).toEqual({ plan: 'essence', billing: 'monthly' })
    expect(page.props.postResultPlan).toBeNull()
  })
  it.each([{ planId: 'pro', pooled: false }, { planId: 'free', pooled: true }])('exclui pagantes/equipes: %j', async balance => {
    mocks.balance.mockResolvedValue({ ...balance, payerId: 'qa-owner', totalBalance: 80, planBalance: 80, extraBalance: 0, planNodesExpireAt: null })
    const page = await BillingPage({ searchParams: Promise.resolve({ from: 'render_result', plan: 'essence', billing: 'monthly', resume: '1' }) })
    expect(page.props.resume).toBeNull()
    expect(page.props.postResultPlan).toBeNull()
  })
})
