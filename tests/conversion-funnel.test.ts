import { describe, expect, it } from 'vitest'
import { buildConversionFunnel, summarizePaidSessions, type ConversionEvent, type PaidSession } from '@/lib/marketing/ads/conversion-funnel'

const event = (event_type: string, overrides: Partial<ConversionEvent> = {}): ConversionEvent => ({ event_type, user_id: 'u1', anonymous_id: 'a1', campaign_identifier: 'reels', value_cents: null, occurred_at: null, created_at: '2026-10-02T10:00:00Z', ...overrides })
describe('conversion cohort', () => {
  it('deduplicates visits and accounts, follows changed attribution and ignores failed jobs', () => {
    const result = buildConversionFunnel([event('landing_view'), event('landing_view'), event('signup'), event('signup'), event('generation_failed'), event('first_generation', { campaign_identifier: 'other' }), event('checkout_started', { campaign_identifier: null }), event('subscription_started', { value_cents: 0 }), event('first_generation', { user_id: 'other' })], 'reels')
    expect(result).toEqual({ visitors: 1, signups: 1, activated: 1, offers: 0, checkouts: 1, paidEvents: 0, userIds: ['u1'] })
  })
  it('does not count activity preceding acquisition or count free trials as paid events', () => {
    const result = buildConversionFunnel([event('signup'), event('first_generation', { created_at: '2026-10-01T10:00:00Z' }), event('subscription_started', { value_cents: 9900 }), event('subscription_started', { value_cents: 9900 })], 'reels')
    expect(result.activated).toBe(0)
    expect(result.paidEvents).toBe(1)
  })
})
const session = (overrides: Partial<PaidSession> = {}): PaidSession => ({ id: 'cs_1', created: 1, livemode: true, mode: 'subscription', payment_status: 'paid', amount_total: 9900, currency: 'brl', subscription: 'sub_1', metadata: { product_type: 'plan', user_id: 'u1' }, ...overrides })
describe('Stripe payment reconciliation', () => {
  it('excludes free trials, unpaid, test mode, top-ups and other accounts; deduplicates subscriptions', () => {
    const result = summarizePaidSessions([session(), session({ id: 'cs_duplicate' }), session({ payment_status: 'no_payment_required' }), session({ payment_status: 'unpaid' }), session({ livemode: false }), session({ amount_total: 0 }), session({ mode: 'payment' }), session({ metadata: { product_type: 'plan', user_id: 'u2' } })], ['u1'])
    expect(result).toEqual({ paidUsers: 1, subscriptions: 1, revenueCentsBRL: 9900 })
  })
  it('does not label foreign currency as BRL', () => expect(summarizePaidSessions([session({ currency: 'usd' })], ['u1']).revenueCentsBRL).toBe(0))
})
