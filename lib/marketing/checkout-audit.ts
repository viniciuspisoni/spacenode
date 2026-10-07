import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

const LOOKBACK_DAYS = 30
const FOLLOWUP_DAYS = 7
const PAGE_LIMIT = 100
const MAX_PAGES = 10
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CheckoutCandidate = {
  userId: string
  sessionId: string
  planId: string | null
  billingCycle: string | null
  createdAt: number
  expiredAt: number | null
  whatsapp: string
}

export type CheckoutAudit = {
  since: number
  truncated: boolean
  counts: { created: number; paid: number; awaitingPayment: number; open: number; expired: number; unknownOwner: number }
  candidates: CheckoutCandidate[]
  noConsent: number
}

type ProfileRow = { id: string; plan: string | null; stripe_subscription_id: string | null }
type ContactRow = { user_id: string; whatsapp_e164: string | null; marketing_opt_in: boolean }

function chunks<T>(values: T[], size: number): T[][] {
  const output: T[][] = []
  for (let i = 0; i < values.length; i += size) output.push(values.slice(i, i + size))
  return output
}

/** Stripe is the source of truth here: the first-party checkout_started event is best effort. */
export async function getCheckoutAudit(admin: SupabaseClient, stripe: Stripe, now = Date.now()): Promise<CheckoutAudit> {
  const since = Math.floor(now / 1000) - LOOKBACK_DAYS * 86400
  const sessions: Stripe.Checkout.Session[] = []
  let cursor: string | undefined
  let truncated = false

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await stripe.checkout.sessions.list({
      created: { gte: since }, limit: PAGE_LIMIT,
      ...(cursor ? { starting_after: cursor } : {}),
    })
    sessions.push(...result.data.filter(session =>
      session.livemode && session.mode === 'subscription' && session.metadata?.product_type === 'plan'))
    if (!result.has_more) break
    if (page === MAX_PAGES - 1) truncated = true
    cursor = result.data.at(-1)?.id
    if (!cursor) break
  }

  const counts = { created: sessions.length, paid: 0, awaitingPayment: 0, open: 0, expired: 0, unknownOwner: 0 }
  const byUser = new Map<string, Stripe.Checkout.Session[]>()
  for (const session of sessions) {
    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') counts.paid++
    else if (session.status === 'complete') counts.awaitingPayment++
    else if (session.status === 'open') counts.open++
    else if (session.status === 'expired') counts.expired++

    const userId = session.metadata?.user_id
    if (!userId || !UUID.test(userId)) { counts.unknownOwner++; continue }
    const history = byUser.get(userId) ?? []
    history.push(session)
    byUser.set(userId, history)
  }

  const userIds = [...byUser.keys()]
  const profiles = new Map<string, ProfileRow>()
  const contacts = new Map<string, ContactRow>()
  for (const ids of chunks(userIds, 100)) {
    const [profileResult, contactResult] = await Promise.all([
      admin.from('profiles').select('id,plan,stripe_subscription_id').in('id', ids),
      admin.from('customer_contacts').select('user_id,whatsapp_e164,marketing_opt_in').in('user_id', ids),
    ])
    if (profileResult.error) throw new Error(`Falha ao consultar assinaturas: ${profileResult.error.message}`)
    if (contactResult.error) throw new Error(`Falha ao consultar consentimento: ${contactResult.error.message}`)
    for (const row of (profileResult.data ?? []) as ProfileRow[]) profiles.set(row.id, row)
    for (const row of (contactResult.data ?? []) as ContactRow[]) contacts.set(row.user_id, row)
  }

  const candidates: CheckoutCandidate[] = []
  let noConsent = 0
  const recentThreshold = Math.floor(now / 1000) - FOLLOWUP_DAYS * 86400
  for (const [userId, history] of byUser) {
    // A newer paid or pending session means this person is not an abandoned checkout.
    if (history.some(session => session.payment_status === 'paid' || session.payment_status === 'no_payment_required')) continue
    const latest = history.sort((a, b) => b.created - a.created)[0]
    if (latest.status !== 'expired' || latest.created < recentThreshold) continue
    const profile = profiles.get(userId)
    // Conservative suppression: avoid approaching anyone whose profile still shows a paid plan.
    if (!profile || profile.stripe_subscription_id || (profile.plan && profile.plan !== 'free')) continue
    const contact = contacts.get(userId)
    if (!contact?.marketing_opt_in || !contact.whatsapp_e164) { noConsent++; continue }
    candidates.push({
      userId, sessionId: latest.id, planId: latest.metadata?.plan_id ?? null,
      billingCycle: latest.metadata?.billing_cycle ?? null,
      createdAt: latest.created, expiredAt: latest.expires_at ?? null,
      whatsapp: contact.whatsapp_e164,
    })
  }
  candidates.sort((a, b) => b.createdAt - a.createdAt)
  return { since, truncated, counts, candidates, noConsent }
}
