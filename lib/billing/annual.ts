import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findPlanByStripePriceId } from '@/lib/plans'

/** Aniversários mensais em UTC, preservando o dia original e limitando ao
 * último dia de meses curtos. O mês inicial pertence ao webhook da fatura. */
export function dueAnnualMonths(start: number, end: number, now: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || now < start || now >= end) return []
  const anchor = new Date(start * 1000)
  const due: number[] = []
  for (let month = 1; month < 12; month++) {
    const date = new Date(anchor)
    date.setUTCDate(1)
    date.setUTCMonth(anchor.getUTCMonth() + month)
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(anchor.getUTCDate(), lastDay))
    if (date.getTime() / 1000 <= now && date.getTime() / 1000 < end) due.push(month)
  }
  return due
}

/** A fatura anual concede uma cota mensal pelo webhook. Este processo concede
 * as outras onze, com a mesma RPC atômica e idempotente já usada na renovação.
 * Reexecuções e recuperação após indisponibilidade não duplicam o saldo. */
export async function replenishAnnualNodes(stripe: Stripe, db: SupabaseClient, now = Date.now() / 1000) {
  let subscriptions = 0
  let grants = 0
  for await (const sub of stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.latest_invoice'] })) {
    const invoice = sub.latest_invoice
    if (sub.pause_collection || !invoice || typeof invoice === 'string' || invoice.status !== 'paid') continue
    // Uma assinatura da SpaceNode tem um único item de plano. Em um contrato
    // com itens inesperados, não adivinhar a franquia nem creditar duas vezes.
    if (sub.items.data.length !== 1) continue
    const item = sub.items.data[0]
    if (item.price.recurring?.interval !== 'year' || item.price.recurring.interval_count !== 1) continue
    const match = findPlanByStripePriceId(item.price.id)
    if (!match || match.billing !== 'annual') continue
    const end = Math.min(item.current_period_end, sub.cancel_at ?? Infinity)
    const due = dueAnnualMonths(item.current_period_start, end, now)
    if (!due.length) continue
    const { data: profile, error } = await db.from('profiles')
      .select('id, plan').eq('stripe_subscription_id', sub.id).maybeSingle()
    if (error) throw error
    // A ativação e eventuais trocas precisam ter sido aplicadas pelo webhook.
    if (!profile || profile.plan !== match.plan.id) continue
    subscriptions++
    for (const month of due) {
      const { data, error: grantError } = await db.rpc('grant_plan_nodes', {
        user_id_input: profile.id,
        amount: match.plan.nodes,
        plan_name: null,
        kind_input: 'grant_renewal',
        source_input: 'stripe',
        source_id_input: `annual:${sub.id}:${item.id}:${item.current_period_start}:${month}`,
      })
      if (grantError) throw grantError
      if (data?.applied === true) grants++
    }
  }
  return { subscriptions, grants }
}
