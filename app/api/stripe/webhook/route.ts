import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { findPlanByStripePriceId } from '@/lib/plans'
import { recordAcquisitionEvent } from '@/lib/marketing/ads/service'

export const dynamic = 'force-dynamic'

// Stripe SDK retorna `string | Object | null` em vários campos relacionais.
// Quando o webhook não pediu expansion (default), os campos vêm como string.
function strId<T extends { id: string }>(value: string | T | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

export async function POST(req: NextRequest) {
  const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[stripe webhook] signature error:', err)
    return NextResponse.json({ error: 'Webhook inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── checkout.session.completed: ativa plano OU adiciona Lumen ────────────
  if (event.type === 'checkout.session.completed') {
    const session     = event.data.object as Stripe.Checkout.Session
    const userId      = session.metadata?.user_id
    const productType = session.metadata?.product_type
    const customerId  = strId(session.customer)

    if (!userId || !productType) {
      console.error('[stripe webhook] checkout sem metadata válido:', session.id)
      return NextResponse.json({ received: true })
    }

    if (productType === 'plan') {
      const planId         = session.metadata?.plan_id
      const nodesToAdd     = parseInt(session.metadata?.nodes_to_add ?? '0', 10)
      const subscriptionId = strId(session.subscription)

      if (!planId || nodesToAdd <= 0) {
        console.error('[stripe webhook] plan metadata inválido:', session.id)
        return NextResponse.json({ received: true })
      }

      const updates: Record<string, unknown> = { plan: planId, credits: nodesToAdd }
      if (customerId)     updates.stripe_customer_id     = customerId
      if (subscriptionId) updates.stripe_subscription_id = subscriptionId

      const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
      if (error) {
        console.error('[stripe webhook] plan activation falhou:', error)
        // 500 → Stripe retenta a entrega; o update é idempotente (valores absolutos)
        return NextResponse.json({ error: 'db' }, { status: 500 })
      }
      console.log(`[stripe webhook] plano ${planId} ativado p/ user ${userId} (${nodesToAdd} nodes)`)

      // Funil first-party (best-effort — recordAcquisitionEvent nunca lança).
      await recordAcquisitionEvent(supabase, {
        user_id: userId,
        event_type: 'subscription_started',
        plan_id: planId,
        value_cents: session.amount_total ?? null,
        metadata: { billing_cycle: session.metadata?.billing_cycle ?? null, stripe_session_id: session.id },
      })
    } else if (productType === 'lumen') {
      const packSize = parseInt(session.metadata?.pack_size ?? '0', 10)
      if (![500, 1500, 4000].includes(packSize)) {
        console.error('[stripe webhook] pack_size inválido:', packSize)
        return NextResponse.json({ received: true })
      }

      const { error: rpcErr } = await supabase.rpc('add_lumen_pack', {
        user_id_input:           userId,
        pack_size_input:         packSize,
        stripe_session_id_input: session.id,
      })
      if (rpcErr) {
        console.error('[stripe webhook] add_lumen_pack falhou:', rpcErr)
        // 500 → Stripe retenta; a RPC é idempotente por stripe_session_id
        return NextResponse.json({ error: 'db' }, { status: 500 })
      }
      console.log(`[stripe webhook] lumen ${packSize} adicionado p/ user ${userId}`)

      // Persiste customer_id se for primeira compra do user
      if (customerId) {
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId)
          .is('stripe_customer_id', null)
      }
    }
  }

  // ── invoice.paid: renovação mensal de assinatura ─────────────────────────
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice
    if (invoice.billing_reason === 'subscription_cycle') {
      const lineItem    = invoice.lines.data[0]
      const priceField  = lineItem?.pricing?.price_details?.price
      // Fallback pro formato pré-Basil (`lines.data[].price`) — o endpoint é
      // criado sem api_version pinada, então o shape segue o default da conta.
      const legacyPrice = (lineItem as unknown as { price?: { id?: string } | null })?.price
      const priceId     =
        (typeof priceField === 'string' ? priceField : priceField?.id) ?? legacyPrice?.id

      if (!priceId) {
        console.warn('[stripe webhook] invoice.paid sem price_id resolvível:', invoice.id)
        return NextResponse.json({ received: true })
      }
      const match = findPlanByStripePriceId(priceId)
      if (!match) {
        console.warn('[stripe webhook] price_id desconhecido em invoice.paid:', priceId)
        return NextResponse.json({ received: true })
      }
      const subscriptionId = strId(lineItem?.subscription)
      const customerId     = strId(invoice.customer)

      const baseUpdate = supabase.from('profiles').update({ credits: match.plan.nodes })
      const filtered =
        subscriptionId ? baseUpdate.eq('stripe_subscription_id', subscriptionId) :
        customerId     ? baseUpdate.eq('stripe_customer_id', customerId)         :
        null

      if (!filtered) {
        console.error('[stripe webhook] invoice sem subscription/customer:', invoice.id)
        return NextResponse.json({ received: true })
      }

      const { error } = await filtered
      if (error) {
        console.error('[stripe webhook] renovação falhou:', error)
        return NextResponse.json({ error: 'db' }, { status: 500 })
      }
      console.log(`[stripe webhook] renovação aplicada (${match.plan.id} → ${match.plan.nodes} nodes)`)

      // Funil first-party (best-effort): resolve o dono da assinatura para
      // registrar a renovação com receita — nunca afeta o billing.
      const { data: renewed } = subscriptionId
        ? await supabase.from('profiles').select('id').eq('stripe_subscription_id', subscriptionId).maybeSingle()
        : await supabase.from('profiles').select('id').eq('stripe_customer_id', customerId!).maybeSingle()
      if (renewed?.id) {
        await recordAcquisitionEvent(supabase, {
          user_id: renewed.id as string,
          event_type: 'subscription_renewed',
          plan_id: match.plan.id,
          value_cents: invoice.amount_paid ?? null,
          metadata: { stripe_invoice_id: invoice.id },
        })
      }
    }
  }

  // ── customer.subscription.deleted: downgrade pra free ────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const sub            = event.data.object as Stripe.Subscription
    const subscriptionId = sub.id
    const customerId     = strId(sub.customer)
    const baseUpdate     = { plan: 'free', credits: 0, stripe_subscription_id: null }

    const q =
      subscriptionId ? supabase.from('profiles').update(baseUpdate).eq('stripe_subscription_id', subscriptionId) :
      customerId     ? supabase.from('profiles').update(baseUpdate).eq('stripe_customer_id', customerId)         :
      null

    if (!q) {
      console.error('[stripe webhook] subscription.deleted sem id resolvível:', sub.id)
      return NextResponse.json({ received: true })
    }

    // Resolve o dono ANTES do update (que anula stripe_subscription_id) para
    // registrar o cancelamento no funil first-party (best-effort).
    const { data: cancelingProfile } = subscriptionId
      ? await supabase.from('profiles').select('id, plan').eq('stripe_subscription_id', subscriptionId).maybeSingle()
      : customerId
        ? await supabase.from('profiles').select('id, plan').eq('stripe_customer_id', customerId).maybeSingle()
        : { data: null }

    const { error } = await q
    if (error) {
      console.error('[stripe webhook] cancelamento falhou:', error)
      return NextResponse.json({ error: 'db' }, { status: 500 })
    }
    console.log(`[stripe webhook] plano cancelado (sub ${subscriptionId})`)

    if (cancelingProfile?.id) {
      await recordAcquisitionEvent(supabase, {
        user_id: cancelingProfile.id as string,
        event_type: 'subscription_canceled',
        plan_id: (cancelingProfile.plan as string | null) ?? null,
        metadata: { stripe_subscription_id: subscriptionId },
      })
    }
  }

  return NextResponse.json({ received: true })
}
