import 'server-only'
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildConversionFunnel, summarizePaidSessions, type ConversionEvent } from './conversion-funnel'

export async function getConversionData(admin: SupabaseClient, campaign: string, since: string) {
  const until = new Date().toISOString()
  const events: ConversionEvent[] = []
  let eventsTruncated = false
  for (let page = 0; page < 10; page++) {
    const result = await admin.schema('marketing').from('acquisition_events')
      .select('event_type,user_id,anonymous_id,campaign_identifier,value_cents,occurred_at,created_at')
      .eq('is_internal', false).gte('created_at', since).lte('created_at', until)
      .in('event_type', ['landing_view', 'signup', 'first_generation', 'generation_completed', 'plans_viewed', 'checkout_started', 'subscription_started'])
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(page * 1000, (page + 1) * 1000 - 1)
    if (result.error) throw new Error('Não foi possível consultar o registro próprio de conversão.')
    events.push(...(result.data ?? []) as ConversionEvent[])
    if ((result.data?.length ?? 0) < 1000) break
    if (page === 9) eventsTruncated = true
  }
  const funnel = buildConversionFunnel(events, campaign)
  let stripeCheck: (ReturnType<typeof summarizePaidSessions> & { truncated: boolean }) | null = null
  let stripeError: string | null = null
  if (!process.env.STRIPE_SECRET_KEY) stripeError = 'Stripe indisponível: pagamentos não conferidos.'
  else {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 })
      const sessions: Stripe.Checkout.Session[] = []
      let cursor: string | undefined
      let truncated = false
      for (let page = 0; page < 10; page++) {
        const result = await stripe.checkout.sessions.list({ created: { gte: Math.floor(Date.parse(since) / 1000), lte: Math.floor(Date.parse(until) / 1000) }, limit: 100, ...(cursor ? { starting_after: cursor } : {}) })
        sessions.push(...result.data)
        if (!result.has_more) break
        if (page === 9) truncated = true
        cursor = result.data.at(-1)?.id
        if (!cursor) break
      }
      stripeCheck = { ...summarizePaidSessions(sessions, funnel.userIds), truncated }
    } catch {
      stripeError = 'Stripe indisponível nesta leitura. Ausência de consulta não significa ausência de pagamentos.'
    }
  }
  return { funnel, stripeCheck, stripeError, eventsTruncated, since, until }
}
