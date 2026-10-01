import type Stripe from 'stripe'
import type { Billing } from './snapshot'

export function checkoutBilling(session: Pick<Stripe.Checkout.Session,'metadata'|'mode'|'livemode'|'payment_status'|'status'>,
  userId: string, occurredAt: string, now: Date): Billing {
  if (session.metadata?.user_id !== userId || session.mode !== 'subscription' || !session.livemode) throw new Error('Checkout mismatch')
  const paid=session.payment_status==='paid' || session.payment_status==='no_payment_required'
  const age=now.getTime()-Date.parse(occurredAt)
  return {paid,pending:!paid && session.status==='open' && Number.isFinite(age) && age>=30*60000 && age<=86400000}
}
