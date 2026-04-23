import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const PLANS = {
  starter: {
    credits: 50,
    name: 'starter',
    priceIds: {
      monthly: process.env.STRIPE_PRICE_ID_STARTER_MONTHLY!,
      annual: process.env.STRIPE_PRICE_ID_STARTER_ANNUAL!,
    },
  },
  pro: {
    credits: 150,
    name: 'pro',
    priceIds: {
      monthly: process.env.STRIPE_PRICE_ID_PRO_MONTHLY!,
      annual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL!,
    },
  },
  studio: {
    credits: 500,
    name: 'studio',
    priceIds: {
      monthly: process.env.STRIPE_PRICE_ID_STUDIO_MONTHLY!,
      annual: process.env.STRIPE_PRICE_ID_STUDIO_ANNUAL!,
    },
  },
} as const

type PlanKey = keyof typeof PLANS

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const planKey: PlanKey = body.plan ?? 'starter'
  const billing: 'monthly' | 'annual' = body.billing ?? 'monthly'

  const plan = PLANS[planKey]
  if (!plan) {
    return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
  }

  const priceId = plan.priceIds[billing]

  // Recupera ou cria o customer no Stripe
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id ?? undefined

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    })
    customerId = customer.id

    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/generate?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/generate?canceled=true`,
    metadata: {
      user_id: user.id,
      plan_name: plan.name,
      credits_to_add: String(plan.credits),
    },
    subscription_data: {
      metadata: {
        user_id: user.id,
        plan_name: plan.name,
        credits_to_add: String(plan.credits),
      },
    },
  })

  return NextResponse.json({ url: session.url })
}
