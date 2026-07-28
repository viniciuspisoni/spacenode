import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAcquisitionEvent } from '@/lib/marketing/ads/service'
import {
  ANNUAL_BILLING_ENABLED,
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
import { isLaunchOfferOpen } from '@/lib/launch-offer'
import {
  isPixEnabled,
  isPixRejectedError,
  paymentMethodTypes,
  pixAllowedForCycle,
  pixMandateOptions,
  PIX_EXPIRES_AFTER_SECONDS,
} from '@/lib/stripe/pix'

export const dynamic = 'force-dynamic'

interface PlanCheckoutBody  { type: 'plan';  id: PaidPlanId;    billing: BillingCycle }
interface LumenCheckoutBody { type: 'lumen'; id: LumenPackSize }
type CheckoutBody = PlanCheckoutBody | LumenCheckoutBody

// IDs gravados no profile podem ficar órfãos (ex.: objetos de modo teste após
// a virada pra live) — validar antes de reusar evita "No such customer" → 500.
// Só `resource_missing` conta como órfão: um erro transitório do Stripe não
// pode desligar a guarda anti-cobrança-dupla nem derrubar o reuso do customer
// em silêncio — relançado, vira 500 e o usuário tenta de novo.
function isResourceMissing(err: unknown): boolean {
  return err instanceof Stripe.errors.StripeError && err.code === 'resource_missing'
}

async function customerExists(stripe: Stripe, id: string): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(id)
    return !(customer as Stripe.DeletedCustomer).deleted
  } catch (err) {
    if (isResourceMissing(err)) return false
    throw err
  }
}

async function hasActiveSubscription(stripe: Stripe, id: string): Promise<boolean> {
  try {
    const sub = await stripe.subscriptions.retrieve(id)
    return sub.status !== 'canceled' && sub.status !== 'incomplete_expired'
  } catch (err) {
    if (isResourceMissing(err)) return false
    throw err
  }
}

/**
 * A oferta de lançamento é de PRIMEIRA assinatura. Sem essa checagem, um
 * usuário poderia assinar com 50%, cancelar e reassinar com 50% de novo
 * indefinidamente.
 *
 * Sem customer no Stripe = nunca comprou nada = elegível. Com customer,
 * `status: 'all'` inclui canceladas — é o que fecha a brecha.
 */
async function isFirstSubscription(stripe: Stripe, customerId: string | null): Promise<boolean> {
  if (!customerId) return true
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 1 })
  return subs.data.length === 0
}

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
    .select('plan, stripe_customer_id, stripe_subscription_id')
    .eq('id', user.id)
    .single()

  const reusableCustomerId =
    profile?.stripe_customer_id && (await customerExists(stripe, profile.stripe_customer_id))
      ? profile.stripe_customer_id
      : null

  const customerArgs: Pick<
    Stripe.Checkout.SessionCreateParams,
    'customer' | 'customer_email'
  > = reusableCustomerId
    ? { customer: reusableCustomerId }
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
    if (body.billing === 'annual' && !ANNUAL_BILLING_ENABLED) {
      return NextResponse.json(
        { error: 'O ciclo anual está temporariamente indisponível — assine o plano mensal.' },
        { status: 400 }
      )
    }
    // Uma assinatura por conta: sem guarda, um segundo checkout criaria uma
    // segunda assinatura no Stripe e o usuário pagaria os dois planos.
    // O ID persistido chega via webhook (pode atrasar), então quando há
    // customer reusável a fonte de verdade é o próprio Stripe.
    let alreadySubscribed =
      Boolean(profile?.stripe_subscription_id) &&
      (await hasActiveSubscription(stripe, profile!.stripe_subscription_id!))
    if (!alreadySubscribed && reusableCustomerId) {
      const subs = await stripe.subscriptions.list({
        customer: reusableCustomerId,
        status:   'active',
        limit:    1,
      })
      alreadySubscribed = subs.data.length > 0
    }
    if (alreadySubscribed) {
      return NextResponse.json(
        {
          error:
            'Você já tem uma assinatura ativa. Pra trocar de plano sem cobrança ' +
            'duplicada, fale com o suporte — o ajuste é feito na hora.',
        },
        { status: 409 }
      )
    }
    const plan    = getPlanById(body.id)!
    const priceId = getStripePriceId(plan.id, body.billing)
    if (!priceId) {
      console.error('[checkout] missing Stripe price id for', plan.id, body.billing)
      return NextResponse.json({ error: 'Configuração indisponível' }, { status: 500 })
    }

    // ── Oferta de lançamento: 50% na primeira mensalidade ────────────────
    // Entra via `discounts` (e não `allow_promotion_codes`): o desconto é
    // automático e o cliente não digita código nenhum. Os dois campos são
    // mutuamente exclusivos no Stripe — não dá pra ter os dois na mesma session.
    // Só no mensal: "primeiro mês" não significa nada num plano anual.
    const launchCouponId = process.env.STRIPE_LAUNCH_COUPON_ID
    const offerEligible =
      body.billing === 'monthly' &&
      isLaunchOfferOpen() &&
      (await isFirstSubscription(stripe, reusableCustomerId))

    if (offerEligible && !launchCouponId) {
      // Config incompleta: a UI está anunciando 50% e o Stripe vai cobrar
      // cheio. Não bloqueia a venda (o cliente ainda vê o valor real na tela
      // do Stripe antes de pagar), mas precisa gritar no log.
      console.error(
        '[checkout] oferta de lançamento aberta mas STRIPE_LAUNCH_COUPON_ID ' +
        'não está definido — cobrando preço cheio'
      )
    }
    const applyOffer = offerEligible && Boolean(launchCouponId)

    // Fixado fora do closure: dentro dele o TS perde o narrowing de `body`.
    const billingCycle: BillingCycle = body.billing

    // ── Pix Automático: teto do mandato ─────────────────────────────────
    // O valor que o cliente autoriza no app do banco precisa cobrir o que o
    // Stripe vai cobrar de fato. Quem manda nisso é o Price, não o catálogo:
    // se os dois divergirem, é o Price que é cobrado e um mandato calculado
    // pelo catálogo faria TODA renovação falhar meses depois, em silêncio.
    // Por isso o valor vem do Stripe, com o catálogo só como plano B.
    const usePixMandate = isPixEnabled() && pixAllowedForCycle(billingCycle)
    let mandateAmount = plan.monthlyPrice * 100
    if (usePixMandate) {
      try {
        const price = await stripe.prices.retrieve(priceId)
        if (price.unit_amount && price.unit_amount !== mandateAmount) {
          console.error(
            `[checkout] preço do catálogo (${mandateAmount}) diverge do Stripe ` +
            `(${price.unit_amount}) em ${plan.id}/${billingCycle} — mandato Pix ` +
            'usando o valor do Stripe'
          )
        }
        mandateAmount = price.unit_amount ?? mandateAmount
      } catch (err) {
        console.error('[checkout] falha ao ler o price p/ mandato Pix:', err)
      }
    }

    const buildSession = (withOffer: boolean, withPix: boolean) =>
      stripe.checkout.sessions.create({
        ...customerArgs,
        payment_method_types: paymentMethodTypes(withPix),
        line_items:           [{ price: priceId, quantity: 1 }],
        mode:                 'subscription',
        ...(withOffer ? { discounts: [{ coupon: launchCouponId! }] } : {}),
        ...(withPix ? { payment_method_options: { pix: pixMandateOptions(mandateAmount) } } : {}),
        success_url:          `${successBase}?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:           `${successBase}?canceled=true`,
        metadata: {
          user_id:       user.id,
          product_type:  'plan',
          plan_id:       plan.id,
          billing_cycle: billingCycle,
          nodes_to_add:  String(plan.nodes),
          launch_offer:  withOffer ? 'applied' : 'none',
        },
        // Espelhado na assinatura porque a ativação por Pix acontece em
        // `invoice.paid` (subscription_create), e a Invoice não carrega o
        // metadata da session. Sem isso, o webhook dependeria de o
        // checkout.session.completed ter chegado antes — uma corrida.
        subscription_data: {
          metadata: {
            user_id:      user.id,
            plan_id:      plan.id,
            nodes_to_add: String(plan.nodes),
          },
        },
      })

    // Degradação em cascata: cada rede desliga UM opcional e tenta de novo.
    //
    //  • Pix: se não estiver ativado no Dashboard (ou o Pix Automático não
    //    liberado), o Stripe recusa a session INTEIRA — inclusive para quem ia
    //    pagar no cartão. Um erro de configuração viraria outage de vendas.
    //  • Cupom: existe por MODO no Stripe (teste ≠ live) e a env pode apontar
    //    para um que ainda não foi criado.
    //
    // Nos dois casos vender degradado é melhor que não vender, e o log grita.
    // O cliente vê o valor e os meios de pagamento reais na tela do Stripe
    // antes de confirmar qualquer coisa.
    let session: Stripe.Checkout.Session | undefined
    let offerApplied = applyOffer
    let pixApplied   = usePixMandate

    for (let attempt = 0; attempt < 3 && !session; attempt++) {
      try {
        session = await buildSession(offerApplied, pixApplied)
      } catch (err) {
        if (pixApplied && isPixRejectedError(err)) {
          console.error(
            '[checkout] Stripe recusou `pix` — ative Pix e Pix Automático no ' +
            'Dashboard deste modo. Seguindo só no cartão.'
          )
          pixApplied = false
          continue
        }
        if (offerApplied && isResourceMissing(err)) {
          console.error(
            `[checkout] cupom "${launchCouponId}" não existe neste modo do Stripe — ` +
            'vendendo a preço cheio. Confira se o cupom foi criado em live.'
          )
          offerApplied = false
          continue
        }
        throw err
      }
    }
    if (!session) {
      // Inalcançável: 3 tentativas cobrem as 2 degradações possíveis e
      // qualquer outro erro é relançado acima.
      throw new Error('[checkout] session não criada após degradações')
    }

    // Funil first-party (best-effort — recordAcquisitionEvent nunca lança).
    await recordAcquisitionEvent(createAdminClient(), {
      user_id: user.id,
      event_type: 'checkout_started',
      plan_id: plan.id,
      metadata: { billing_cycle: body.billing, launch_offer: offerApplied, pix_offered: pixApplied },
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

  // Pix comum (QR de pagamento único). Mesma rede da assinatura: se o Stripe
  // recusar o tipo, refaz só no cartão em vez de derrubar a venda.
  const buildLumenSession = (withPix: boolean) =>
    stripe.checkout.sessions.create({
      ...customerArgs,
      payment_method_types: paymentMethodTypes(withPix),
      line_items:           [{ price: priceId, quantity: 1 }],
      mode:                 'payment',
      ...(withPix
        ? { payment_method_options: { pix: { expires_after_seconds: PIX_EXPIRES_AFTER_SECONDS } } }
        : {}),
      success_url:          `${successBase}?lumen_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:           `${successBase}?canceled=true`,
      metadata: {
        user_id:      user.id,
        product_type: 'lumen',
        pack_size:    String(pack.id),
      },
    })

  let session: Stripe.Checkout.Session
  try {
    session = await buildLumenSession(isPixEnabled())
  } catch (err) {
    if (!isPixEnabled() || !isPixRejectedError(err)) throw err
    console.error(
      '[checkout] Stripe recusou `pix` no pack Lumen — ative Pix no Dashboard ' +
      'deste modo. Seguindo só no cartão.'
    )
    session = await buildLumenSession(false)
  }
  return NextResponse.json({ url: session.url })
}
