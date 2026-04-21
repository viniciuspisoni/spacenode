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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.user_id
    const creditsToAdd = parseInt(session.metadata?.credits_to_add || '0')

    if (userId && creditsToAdd > 0) {
      const supabase = createAdminClient()
      await supabase.rpc('add_credits', {
        user_id_input: userId,
        amount: creditsToAdd,
      })
    }
  }

  return NextResponse.json({ received: true })
}