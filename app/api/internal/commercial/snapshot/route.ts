import { timingSafeEqual } from 'node:crypto'
import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { checkoutBilling } from '@/lib/commercial/billing'
import { createAdminClient } from '@/lib/supabase/admin'
import { reconcileActivationUsers } from '@/lib/marketing/ads/activation'
import { buildSnapshot, type SourceAccount, type SourceEvent, type Contact, type Billing } from '@/lib/commercial/snapshot'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const response = (body: unknown, status=200) => NextResponse.json(body, {status, headers:{'Cache-Control':'no-store'}})

export async function GET(request: Request) {
  const key=process.env.COMMERCIAL_SOURCE_TOKEN ?? ''
  const refSecret=process.env.COMMERCIAL_REF_SECRET ?? ''
  if (process.env.COMMERCIAL_PILOT_ENABLED !== 'true' || key.length < 48 || refSecret.length < 48) return response({error:'Unavailable'},503)
  const supplied=request.headers.get('authorization') ?? ''
  const expected='Bearer '+key
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) {
    return response({error:'Unauthorized'},401)
  }
  try {
    const now=new Date(), since=new Date(now.getTime()-30*86400000).toISOString()
    const admin=createAdminClient()
    const profilesResult=await admin.from('profiles').select('id,created_at,plan,stripe_subscription_id')
      .gte('created_at',since).order('created_at',{ascending:false}).limit(101)
    if (profilesResult.error || !profilesResult.data || profilesResult.data.length > 100) throw new Error('Cohort unavailable')
    const profiles=profilesResult.data as SourceAccount[], ids=profiles.map(p=>p.id)
    if (!ids.length) return response(buildSnapshot({profiles,contacts:[],events:[],completedUsers:new Set(),
      openTicketUsers:new Set(),stripeGrantUsers:new Set(),billing:new Map()},refSecret,now))
    const [contacts,events,activation,feedback,tickets,grants]=await Promise.all([
      admin.from('customer_contacts').select('user_id,support_opt_in,marketing_opt_in').in('user_id',ids).limit(101),
      admin.schema('marketing').from('acquisition_events').select('id,user_id,event_type,occurred_at,created_at,dedupe_key')
        .in('user_id',ids).eq('event_type','checkout_started')
        .eq('is_internal',false).gte('created_at',since).limit(1001),
      reconcileActivationUsers(admin,ids),
      admin.from('render_feedback').select('user_id').in('user_id',ids).eq('useful',true).limit(1001),
      admin.from('nodi_tickets').select('user_id').in('user_id',ids).not('status','in','(resolved,closed)').limit(1001),
      admin.from('node_ledger').select('user_id,payer_id').in('user_id',ids).eq('source','stripe')
        .in('kind',['grant_plan','grant_renewal']).gt('delta',0).limit(1001),
    ])
    for (const result of [contacts,events,feedback,tickets,grants]) {
      if (result.error || !result.data || result.data.length > 1000) throw new Error('Evidence unavailable')
    }
    if (!feedback.data || !tickets.data || !grants.data) throw new Error('Evidence unavailable')
    const recorded=events.data as SourceEvent[], billing=new Map<string,Billing>()
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY!, {timeout:10000,maxNetworkRetries:1})
    // Bounded reconciliation of the latest checkout. A stale local tracking
    // event alone never makes a checkout eligible. Any Stripe error aborts.
    const latest=new Map<string,SourceEvent>()
    for (const event of recorded.filter(e=>e.event_type==='checkout_started' && now.getTime()-Date.parse(e.occurred_at ?? e.created_at)<=86400000)
      .sort((a,b)=>Date.parse(b.occurred_at ?? b.created_at)-Date.parse(a.occurred_at ?? a.created_at))) {
      if (event.user_id && !latest.has(event.user_id)) latest.set(event.user_id,event)
    }
    if (latest.size > 10) throw new Error('Stripe reconciliation limit')
    for (const [id,event] of latest) {
      if (!event.dedupe_key?.startsWith('checkout:cs_')) throw new Error('Checkout identity unavailable')
      const session=await stripe.checkout.sessions.retrieve(event.dedupe_key.slice('checkout:'.length))
      billing.set(id,checkoutBilling(session,id,event.occurred_at ?? event.created_at,now))
    }
    return response(buildSnapshot({profiles, contacts:contacts.data as Contact[], events:recorded,
      completedUsers:activation.activated, unknownActivationUsers:activation.eventOnly, internalUsers:activation.internal,
      usefulUsers:new Set(feedback.data.map(f=>f.user_id)),openTicketUsers:new Set(tickets.data.map(t=>t.user_id)),
      stripeGrantUsers:new Set(grants.data.flatMap(g=>[g.user_id,g.payer_id].filter(Boolean))),billing},refSecret,now))
  } catch {
    // Never log records, Stripe identifiers, tokens or provider error bodies.
    return response({error:'Snapshot unavailable; retry before review'},503)
  }
}

