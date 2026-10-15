import { afterEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dueAnnualMonths, replenishAnnualNodes } from '@/lib/billing/annual'

const ts = (s: string) => Date.parse(s) / 1000
afterEach(() => vi.unstubAllEnvs())

describe('franquia mensal no anual', () => {
  it('não duplica o primeiro mês do webhook nem concede após o fim do ano', () => {
    const start = ts('2026-10-15T12:00Z'), end = ts('2027-10-15T12:00Z')
    expect(dueAnnualMonths(start, end, start)).toEqual([])
    expect(dueAnnualMonths(start, end, ts('2026-11-15T11:59Z'))).toEqual([])
    expect(dueAnnualMonths(start, end, ts('2026-11-15T12:00Z'))).toEqual([1])
    expect(dueAnnualMonths(start, end, ts('2027-10-15T11:59Z'))).toHaveLength(11)
    expect(dueAnnualMonths(start, end, end)).toEqual([])
  })

  it('dias 29–31 são limitados ao mês curto e recuperam o dia original depois', () => {
    const start = ts('2028-01-31T12:00Z'), end = ts('2029-01-31T12:00Z')
    expect(dueAnnualMonths(start, end, ts('2028-02-29T12:00Z'))).toEqual([1])
    expect(dueAnnualMonths(start, end, ts('2028-03-30T12:00Z'))).toEqual([1])
    expect(dueAnnualMonths(start, end, ts('2028-03-31T12:00Z'))).toEqual([1, 2])
  })

  it('recupera meses pendentes com chaves estáveis; recargas repetidas não somam novamente', async () => {
    vi.stubEnv('STRIPE_PRICE_ID_ESSENCE_ANNUAL_V202610', 'price_annual')
    const sub = {
      id: 'sub_annual', latest_invoice: { status: 'paid' }, pause_collection: null, cancel_at: null,
      items: { data: [{ id: 'si_one', current_period_start: ts('2026-10-15T12:00Z'), current_period_end: ts('2027-10-15T12:00Z'), price: { id: 'price_annual', recurring: { interval: 'year', interval_count: 1 } } }] },
    }
    const stripe = { subscriptions: { list: () => (async function* () { yield sub })() } } as unknown as Stripe
    const keys = new Set<string>()
    let balance = 800 // primeira fatura já creditada
    const rpc = vi.fn(async (_: string, args: { source_id_input: string; amount: number }) => {
      const applied = !keys.has(args.source_id_input)
      if (applied) { keys.add(args.source_id_input); balance += args.amount }
      return { data: { applied }, error: null }
    })
    const db = { rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'user', plan: 'essence' }, error: null }) }) }) }) } as unknown as SupabaseClient
    const now = ts('2027-01-15T12:00Z')
    expect(await replenishAnnualNodes(stripe, db, now)).toEqual({ subscriptions: 1, grants: 3 })
    expect(balance).toBe(3200)
    expect(await replenishAnnualNodes(stripe, db, now)).toEqual({ subscriptions: 1, grants: 0 })
    expect(balance).toBe(3200)
    expect(await replenishAnnualNodes(stripe, db, ts('2027-09-15T12:00Z'))).toEqual({ subscriptions: 1, grants: 8 })
    expect(balance).toBe(9600) // doze cotas de 800, incluindo a primeira fatura
    sub.latest_invoice.status = 'open'
    expect(await replenishAnnualNodes(stripe, db, now)).toEqual({ subscriptions: 0, grants: 0 })
    sub.latest_invoice.status = 'paid'
    sub.items.data[0].price.recurring.interval = 'month'
    expect(await replenishAnnualNodes(stripe, db, now)).toEqual({ subscriptions: 0, grants: 0 })
  })
})
