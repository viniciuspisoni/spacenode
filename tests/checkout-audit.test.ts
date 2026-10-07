import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCheckoutAudit } from '@/lib/marketing/checkout-audit'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const USER_A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const USER_C = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
const USER_D = 'dddddddd-dddd-4ddd-dddd-dddddddddddd'

function session(id: string, userId: string, status: string, paymentStatus: string, hoursAgo: number) {
  return {
    id, livemode: true, mode: 'subscription', status, payment_status: paymentStatus,
    created: Math.floor(NOW / 1000) - hoursAgo * 3600,
    expires_at: Math.floor(NOW / 1000) - (hoursAgo - 1) * 3600,
    metadata: { user_id: userId, product_type: 'plan', plan_id: 'starter', billing_cycle: 'monthly' },
  } as unknown as Stripe.Checkout.Session
}

function fixtures(sessions: Stripe.Checkout.Session[], contacts: Array<Record<string, unknown>>) {
  const stripe = { checkout: { sessions: { list: async () => ({ data: sessions, has_more: false }) } } } as unknown as Stripe
  const admin = {
    from: (table: string) => ({
      select: () => ({ in: async () => ({
        data: table === 'profiles'
          ? [USER_A, USER_B, USER_C, USER_D].map(id => ({ id, plan: 'free', stripe_subscription_id: null }))
          : contacts,
        error: null,
      }) }),
    }),
  } as unknown as SupabaseClient
  return { stripe, admin }
}

describe('checkout audit', () => {
  it('only offers manual outreach for an expired session with current marketing consent', async () => {
    const { stripe, admin } = fixtures([
      session('cs_a', USER_A, 'expired', 'unpaid', 30),
      session('cs_b', USER_B, 'expired', 'unpaid', 30),
      session('cs_c', USER_C, 'complete', 'unpaid', 30),
      session('cs_d_old', USER_D, 'expired', 'unpaid', 40),
      session('cs_d_paid', USER_D, 'complete', 'paid', 2),
    ], [
      { user_id: USER_A, whatsapp_e164: '+5511999999999', marketing_opt_in: true },
      { user_id: USER_B, whatsapp_e164: '+5511888888888', marketing_opt_in: false },
      { user_id: USER_C, whatsapp_e164: '+5511777777777', marketing_opt_in: true },
      { user_id: USER_D, whatsapp_e164: '+5511666666666', marketing_opt_in: true },
    ])
    const result = await getCheckoutAudit(admin, stripe, NOW)
    expect(result.counts).toMatchObject({ created: 5, paid: 1, awaitingPayment: 1, expired: 3 })
    expect(result.candidates.map(item => item.userId)).toEqual([USER_A])
    expect(result.noConsent).toBe(1)
  })

  it('suppresses outreach when the profile already has a paid plan', async () => {
    const { stripe, admin } = fixtures([session('cs_a', USER_A, 'expired', 'unpaid', 30)], [
      { user_id: USER_A, whatsapp_e164: '+5511999999999', marketing_opt_in: true },
    ])
    const originalFrom = admin.from.bind(admin)
    admin.from = ((table: string) => table === 'profiles'
      ? { select: () => ({ in: async () => ({ data: [{ id: USER_A, plan: 'starter', stripe_subscription_id: 'sub_123' }], error: null }) }) }
      : originalFrom(table)) as typeof admin.from
    const result = await getCheckoutAudit(admin, stripe, NOW)
    expect(result.candidates).toEqual([])
  })
})
