export type ConversionEvent = {
  event_type: string
  user_id: string | null
  anonymous_id: string | null
  campaign_identifier: string | null
  value_cents: number | null
  occurred_at: string | null
  created_at: string
}

/** Counts identified browsers, not verified people. Downstream attribution may change. */
export function buildConversionFunnel(events: ConversionEvent[], campaign: string) {
  const visitors = new Set<string>()
  const signupAt = new Map<string, number>()
  for (const event of events) {
    if (event.campaign_identifier !== campaign) continue
    if (event.event_type === 'landing_view' && event.anonymous_id) visitors.add(event.anonymous_id)
    if (event.event_type === 'signup' && event.user_id) {
      const at = Date.parse(event.occurred_at ?? event.created_at)
      if (Number.isFinite(at)) signupAt.set(event.user_id, Math.min(signupAt.get(event.user_id) ?? Infinity, at))
    }
  }
  const activated = new Set<string>()
  const offers = new Set<string>()
  const checkouts = new Set<string>()
  const paidEvents = new Set<string>()
  for (const event of events) {
    if (!event.user_id || !signupAt.has(event.user_id)) continue
    const at = Date.parse(event.occurred_at ?? event.created_at)
    if (!Number.isFinite(at) || at < signupAt.get(event.user_id)!) continue
    if (event.event_type === 'first_generation' || event.event_type === 'generation_completed') activated.add(event.user_id)
    if (event.event_type === 'plans_viewed') offers.add(event.user_id)
    if (event.event_type === 'checkout_started') checkouts.add(event.user_id)
    if (event.event_type === 'subscription_started' && (event.value_cents ?? 0) > 0) paidEvents.add(event.user_id)
  }
  return { visitors: visitors.size, signups: signupAt.size, activated: activated.size, offers: offers.size, checkouts: checkouts.size, paidEvents: paidEvents.size, userIds: [...signupAt.keys()] }
}

export type PaidSession = {
  id: string; created: number; livemode: boolean; mode: string | null
  payment_status: string; amount_total: number | null; currency: string | null
  subscription: string | { id: string } | null
  metadata: Record<string, string> | null
}

/** A trial/no-payment-required session is never a confirmed paid subscription. */
export function summarizePaidSessions(sessions: PaidSession[], userIds: string[]) {
  const cohort = new Set(userIds)
  const subscriptions = new Set<string>()
  const paidUsers = new Set<string>()
  let revenueCentsBRL = 0
  for (const session of sessions) {
    const user = session.metadata?.user_id
    if (!user || !cohort.has(user) || !session.livemode || session.mode !== 'subscription'
      || session.metadata?.product_type !== 'plan' || session.payment_status !== 'paid'
      || (session.amount_total ?? 0) <= 0 || !session.subscription) continue
    const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
    if (subscriptions.has(id)) continue
    subscriptions.add(id)
    paidUsers.add(user)
    if (session.currency === 'brl') revenueCentsBRL += session.amount_total!
  }
  return { paidUsers: paidUsers.size, subscriptions: subscriptions.size, revenueCentsBRL }
}
