import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: 'Webhook inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription') break

      const userId = session.metadata?.user_id
      const planName = session.metadata?.plan_name
      const creditsToAdd = parseInt(session.metadata?.credits_to_add || '0')
      const subscriptionId = session.subscription as string

      if (!userId || !creditsToAdd) break

      await supabase
        .from('profiles')
        .update({ stripe_subscription_id: subscriptionId })
        .eq('id', userId)

      await supabase.rpc('add_credits', {
        user_id_input: userId,
        amount: creditsToAdd,
        plan_name: planName ?? null,
      })
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      // Ignora a primeira fatura (já tratada em checkout.session.completed)
      if (invoice.billing_reason === 'subscription_create') break

      const subRef = invoice.parent?.subscription_details?.subscription
      const subscriptionId = typeof subRef === 'string' ? subRef : subRef?.id
      if (!subscriptionId) break

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const userId = subscription.metadata?.user_id
      const creditsToAdd = parseInt(subscription.metadata?.credits_to_add || '0')
      const planName = subscription.metadata?.plan_name

      if (!userId || !creditsToAdd) break

      await supabase.rpc('add_credits', {
        user_id_input: userId,
        amount: creditsToAdd,
        plan_name: planName ?? null,
      })
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.user_id
      if (!userId) break

      await supabase
        .from('profiles')
        .update({ plan: 'free', stripe_subscription_id: null })
        .eq('id', userId)
      break
    }
  }

  return NextResponse.json({ received: true })
}
