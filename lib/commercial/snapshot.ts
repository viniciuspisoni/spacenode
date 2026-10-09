import { createHmac } from 'node:crypto'

export type SourceAccount = {
  id: string; created_at: string; plan: string | null; stripe_subscription_id: string | null
}
export type Contact = { user_id: string; support_opt_in: boolean; marketing_opt_in: boolean }
export type SourceEvent = { id: string; user_id: string | null; event_type: string; occurred_at: string | null; created_at: string; dedupe_key: string | null }
export type Billing = { paid: boolean; pending: boolean }
export type Evidence = { profiles: SourceAccount[]; contacts: Contact[]; events: SourceEvent[];
  completedUsers: Set<string>; openTicketUsers: Set<string>; stripeGrantUsers: Set<string>; billing: Map<string, Billing>;
  usefulUsers?: Set<string>; unknownActivationUsers?: Set<string>; internalUsers?: Set<string> }

// This phase exports review context only. Contact history and human handover
// are not integrated, so proactive contact stays blocked for every account.
export function buildSnapshot(data: Evidence, key: string, now: Date) {
  if (data.profiles.length > 100) throw new Error('Pilot cohort limit')
  const at = now.toISOString()
  const opaque = (scope: string, value: string) => createHmac('sha256', key).update(scope + ':' + value).digest('hex')
  const contacts = new Map(data.contacts.map(c => [c.user_id, c]))
  const profiles = data.profiles.filter(p => !data.internalUsers?.has(p.id))
  const accounts = profiles.map(p => {
    const contact = contacts.get(p.id)
    const paid = data.billing.get(p.id)?.paid || data.stripeGrantUsers.has(p.id)
      || !!p.stripe_subscription_id || (!!p.plan && p.plan !== 'free')
    // Approval/download do not prove that the result served the project.
    const firstValue = data.completedUsers.has(p.id) && data.usefulUsers?.has(p.id) === true
    return {
      ref: opaque('account', p.id), state: paid ? 'paid' : 'trial', channel: 'whatsapp',
      support_opt_in: contact?.support_opt_in === true, marketing_opt_in: contact?.marketing_opt_in === true,
      do_not_contact: true, support_open: data.openTicketUsers.has(p.id), first_value: firstValue,
      activation_eligible: !firstValue && !data.completedUsers.has(p.id) && !data.unknownActivationUsers?.has(p.id),
      hours_since_signup: Math.max(0, (now.getTime() - Date.parse(p.created_at)) / 3600000),
      days_inactive: null, hours_since_outreach: null,
    }
  })
  const events: { id: string; account_ref: string; kind: string; observed_at: string; metrics: Record<string, number> }[] = []
  for (let i=0; i<profiles.length; i++) {
    const p=profiles[i], account=accounts[i]
    const checkout=data.events.filter(e => e.user_id === p.id && e.event_type === 'checkout_started')
      .sort((a,b) => Date.parse(b.occurred_at ?? b.created_at) - Date.parse(a.occurred_at ?? a.created_at))[0]
    const add = (kind: string) => events.push({id: opaque('event', `${at}:${p.id}:${kind}`),
      account_ref: account.ref, kind, observed_at: at, metrics: {}})
    if (account.activation_eligible && account.hours_since_signup >= 24 && account.support_opt_in) add('signup_without_value')
    if (checkout && account.state !== 'paid' && account.marketing_opt_in && data.billing.get(p.id)?.pending) add('checkout_pending')
  }
  return {as_of: at, accounts, events}
}

