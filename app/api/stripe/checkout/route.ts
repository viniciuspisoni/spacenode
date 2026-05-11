import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import {
  isPaidPlanId,
  getPlanById,
  getStripePriceId,
  type PaidPlanId,
  type BillingCycle,
} from '@/lib/plans'
import {
  isLumenPackSize,
  getLumenPackById,
  getLumenStripePriceId,
  type LumenPackSize,
} from '@/lib/lumens'

export const dynamic = 'force-dynamic'

interface PlanCheckoutBody  { type: 'plan';  id: PaidPlanId;    billing: BillingCycle }
interface LumenCheckoutBody { type: 'lumen'; id: LumenPackSize }
type CheckoutBody = PlanCheckoutBody | LumenCheckoutBody

export async function POST(req: NextRequest) {
  const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let body: Partial<CheckoutBody>
  try {
    body = (await req.json()) as Partial<CheckoutBody>
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (body.type !== 'plan' && body.type !== 'lumen') {
    return NextResponse.json({ error: 'type inválido' }, { status: 400 })
  }

  // Reutiliza customer existente se já houver — evita criar duplicate-customer
  // no Stripe quando o user faz uma segunda compra.
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, stripe_customer_id')
    .eq('id', user.id)
    .single()

  const customerArgs: Pick<
    Stripe.Checkout.SessionCreateParams,
    'customer' | 'customer_email'
  > = profile?.stripe_customer_id
    ? { customer: profile.stripe_customer_id }
    : { customer_email: user.email ?? undefined }

  const successBase = `${process.env.NEXT_PUBLIC_APP_URL}/app/billing`

  // ── Plano (assinatura) ──────────────────────────────────────────────────
  if (body.type === 'plan') {
    if (!isPaidPlanId(body.id)) {
      return NextResponse.json({ error: 'plano inválido' }, { status: 400 })
    }
    if (body.billing !== 'monthly' && body.billing !== 'annual') {
      return NextResponse.json({ error: 'billing inválido' }, { status: 400 })
    }
    const plan    = getPlanById(body.id)!
    const priceId = getStripePriceId(plan.id, body.billing)
    if (!priceId) {
      console.error('[checkout] missing Stripe price id for', plan.id, body.billing)
      return NextResponse.json({ error: 'Configuração indisponível' }, { status: 500 })
    }

    const session = await stripe.checkout.sessions.create({
      ...customerArgs,
      payment_method_types: ['card'],
      line_items:           [{ price: priceId, quantity: 1 }],
      mode:                 'subscription',
      success_url:          `${successBase}?success=true`,
      cancel_url:           `${successBase}?canceled=true`,
      metadata: {
        user_id:       user.id,
        product_type:  'plan',
        plan_id:       plan.id,
        billing_cycle: body.billing,
        nodes_to_add:  String(plan.nodes),
      },
    })
    return NextResponse.json({ url: session.url })
  }

  // ── Lumen (pagamento avulso) ────────────────────────────────────────────
  if (!isLumenPackSize(body.id)) {
    return NextResponse.json({ error: 'pack Lumen inválido' }, { status: 400 })
  }
  if (!profile || profile.plan === 'free' || profile.plan === 'starter') {
    return NextResponse.json(
      { error: 'Lumens disponíveis a partir do plano Pro' },
      { status: 403 }
    )
  }
  const pack    = getLumenPackById(body.id)!
  const priceId = getLumenStripePriceId(pack.id)
  if (!priceId) {
    console.error('[checkout] missing Stripe price id for lumen', pack.id)
    return NextResponse.json({ error: 'Configuração indisponível' }, { status: 500 })
  }

  const session = await stripe.checkout.sessions.create({
    ...customerArgs,
    payment_method_types: ['card'],
    line_items:           [{ price: priceId, quantity: 1 }],
    mode:                 'payment',
    success_url:          `${successBase}?lumen_success=true`,
    cancel_url:           `${successBase}?canceled=true`,
    metadata: {
      user_id:      user.id,
      product_type: 'lumen',
      pack_size:    String(pack.id),
    },
  })
  return NextResponse.json({ url: session.url })
}
