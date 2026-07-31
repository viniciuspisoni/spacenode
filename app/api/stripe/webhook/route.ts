import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { findPlanByStripePriceId, type BillingCycle } from '@/lib/plans'
import { recordAcquisitionEvent } from '@/lib/marketing/ads/service'
import {
  handleChargeRefunded,
  handleDisputeCreated,
  handleReferredFirstPayment,
  handleReferredSubscriptionCanceled,
  handleReferredSubscriptionReactivated,
  handleReferrerInvoiceCreated,
  handleReferrerInvoicePaid,
  handleReferrerInvoiceUnpaid,
  resolveSubscriptionUserId,
} from '@/lib/referral/webhook'

export const dynamic = 'force-dynamic'

// Stripe SDK retorna `string | Object | null` em vários campos relacionais.
// Quando o webhook não pediu expansion (default), os campos vêm como string.
function strId<T extends { id: string }>(value: string | T | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

interface ActivationInput {
  userId:         string
  planId:         string
  nodes:          number
  customerId:     string | null
  subscriptionId: string | null
  billingCycle:   BillingCycle | string | null
  valueCents:     number | null
  /** De onde veio o sinal — só para o log e o funil. */
  source:         'checkout' | 'invoice'
  eventMetadata?: Record<string, unknown>
}

/**
 * Ativa o plano pago de um usuário.
 *
 * Existe porque a ativação chega por DOIS caminhos, que na mesma compra podem
 * disparar os dois, em qualquer ordem:
 *
 *  • `checkout.session.completed` — no cartão a session já vem paga.
 *  • `invoice.paid` (billing_reason=subscription_create) — no Pix Automático
 *    é o único sinal confiável, porque a session completa ANTES de o dinheiro
 *    entrar. Vale como rede de segurança para o cartão também.
 *
 * O update é idempotente (valores absolutos), mas o evento de funil NÃO é —
 * `subscription_started` não tem índice único. Daí a checagem prévia: se o
 * profile já está no plano com a mesma assinatura, sai sem gravar nada e o
 * funil não conta a mesma venda duas vezes.
 *
 * Retorna `false` só quando o banco falhou — o caller devolve 500 e o Stripe
 * retenta a entrega.
 */
async function activatePlan(
  supabase: SupabaseClient,
  input: ActivationInput
): Promise<boolean> {
  const { data: current } = await supabase
    .from('profiles')
    .select('plan, stripe_subscription_id')
    .eq('id', input.userId)
    .maybeSingle()

  const alreadyActive =
    current?.plan === input.planId &&
    Boolean(input.subscriptionId) &&
    current?.stripe_subscription_id === input.subscriptionId

  if (alreadyActive) {
    console.log(
      `[stripe webhook] assinatura ${input.subscriptionId} já ativa p/ user ` +
      `${input.userId} (sinal via ${input.source}) — nada a fazer`
    )
    return true
  }

  const updates: Record<string, unknown> = { plan: input.planId, credits: input.nodes }
  if (input.customerId)     updates.stripe_customer_id     = input.customerId
  if (input.subscriptionId) updates.stripe_subscription_id = input.subscriptionId

  const { error } = await supabase.from('profiles').update(updates).eq('id', input.userId)
  if (error) {
    console.error('[stripe webhook] plan activation falhou:', error)
    return false
  }
  console.log(
    `[stripe webhook] plano ${input.planId} ativado p/ user ${input.userId} ` +
    `(${input.nodes} nodes, via ${input.source})`
  )

  // Funil first-party (best-effort — recordAcquisitionEvent nunca lança).
  // `value_cents` é o valor efetivamente cobrado (já com o desconto de
  // lançamento, quando houve); `launch_offer` separa as duas coortes na
  // hora de medir retenção do 2º mês, que é o número que importa aqui.
  await recordAcquisitionEvent(supabase, {
    user_id:     input.userId,
    event_type:  'subscription_started',
    plan_id:     input.planId,
    value_cents: input.valueCents,
    metadata: {
      billing_cycle: input.billingCycle ?? null,
      activated_via: input.source,
      ...(input.eventMetadata ?? {}),
    },
  })
  return true
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

  // ── Checkout pago: ativa plano OU adiciona Lumen ─────────────────────────
  //
  // Dois eventos caem aqui porque o Pix é assíncrono:
  //  • checkout.session.completed — no cartão já chega paga; no Pix chega com
  //    payment_status 'unpaid', com o QR ainda pendente.
  //  • checkout.session.async_payment_succeeded — o dinheiro do Pix entrou.
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session     = event.data.object as Stripe.Checkout.Session
    const userId      = session.metadata?.user_id
    const productType = session.metadata?.product_type
    const customerId  = strId(session.customer)

    if (!userId || !productType) {
      console.error('[stripe webhook] checkout sem metadata válido:', session.id)
      return NextResponse.json({ received: true })
    }

    // GUARDA DO PIX — a mais importante deste arquivo.
    //
    // Com cartão a session completa já paga, e creditar aqui sempre foi
    // seguro. Com Pix ela completa ANTES de o dinheiro entrar: creditar neste
    // ponto entregaria nodes de graça, e o cliente ficaria com eles se o QR
    // expirasse sem pagamento. Só dinheiro confirmado libera produto.
    // ('no_payment_required' é o caso de desconto de 100%.)
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      // O customer já existe do lado do Stripe; persistir cedo evita criar um
      // duplicado se o cliente tentar de novo. O subscription_id NÃO é gravado
      // aqui de propósito: ele alimenta a guarda anti-assinatura-dupla do
      // checkout, e uma assinatura Pix ainda pendente trancaria o usuário fora
      // de refazer a compra no cartão.
      if (customerId) {
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId)
          .is('stripe_customer_id', null)
      }
      console.log(
        `[stripe webhook] session ${session.id} ainda não paga ` +
        `(${session.payment_status}) — aguardando confirmação do Pix`
      )
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

      const ok = await activatePlan(supabase, {
        userId,
        planId,
        nodes:          nodesToAdd,
        customerId,
        subscriptionId,
        billingCycle:   session.metadata?.billing_cycle ?? null,
        valueCents:     session.amount_total ?? null,
        source:         'checkout',
        eventMetadata: {
          stripe_session_id: session.id,
          launch_offer:      session.metadata?.launch_offer === 'applied',
        },
      })
      // 500 → Stripe retenta a entrega; o update é idempotente (valores absolutos)
      if (!ok) return NextResponse.json({ error: 'db' }, { status: 500 })
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

  // ── checkout.session.async_payment_failed: Pix expirou ou falhou ─────────
  // Nada a estornar: a guarda acima garante que nada foi creditado. Fica só o
  // registro — se isso virar volume, é sinal de QR expirando cedo demais
  // (PIX_EXPIRES_AFTER_SECONDS) ou de fricção no fluxo do banco.
  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session
    console.warn(
      `[stripe webhook] Pix não concluído — session ${session.id}, ` +
      `user ${session.metadata?.user_id ?? '?'}, ` +
      `produto ${session.metadata?.product_type ?? '?'}`
    )
  }

  // ── invoice.paid ─────────────────────────────────────────────────────────
  //  • subscription_create — primeira fatura, ativa o plano. É por aqui que a
  //    assinatura no Pix Automático entra, já que a session completa antes do
  //    pagamento.
  //  • subscription_cycle — renovação, recarrega os nodes do mês.
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice
    const reason  = invoice.billing_reason

    // Indicações — a mensalidade cobrada com desconto acumulado foi paga: o
    // benefício vira "utilizado". Idempotente e independente do que vem
    // abaixo (não altera plano, saldo nem assinatura).
    await handleReferrerInvoicePaid(supabase, invoice)

    if (reason === 'subscription_create' || reason === 'subscription_cycle') {
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

      // ── Primeira fatura: ativação ──────────────────────────────────────
      if (reason === 'subscription_create') {
        // O user_id é espelhado em subscription_data.metadata lá no checkout
        // justamente para não depender da ordem de chegada dos webhooks: este
        // evento pode chegar antes de o checkout.session.completed ter gravado
        // o customer_id no profile.
        let userId: string | null = null
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            userId = sub.metadata?.user_id ?? null
          } catch (err) {
            console.error('[stripe webhook] falha ao ler metadata da assinatura:', err)
          }
        }
        if (!userId && customerId) {
          const { data } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle()
          userId = (data?.id as string | undefined) ?? null
        }
        if (!userId) {
          console.error('[stripe webhook] subscription_create sem user resolvível:', invoice.id)
          return NextResponse.json({ received: true })
        }

        const ok = await activatePlan(supabase, {
          userId,
          planId:        match.plan.id,
          nodes:         match.plan.nodes,
          customerId,
          subscriptionId,
          billingCycle:  match.billing,
          valueCents:    invoice.amount_paid ?? null,
          source:        'invoice',
          eventMetadata: { stripe_invoice_id: invoice.id },
        })
        if (!ok) return NextResponse.json({ error: 'db' }, { status: 500 })

        // Indicações — primeira mensalidade do indicado paga: confirma a
        // indicação e agenda a recompensa do indicador (liberada só depois da
        // janela de reembolso). Best-effort: nunca derruba a ativação.
        await handleReferredFirstPayment(stripe, supabase, event, invoice, userId)

        return NextResponse.json({ received: true })
      }

      // ── Renovação ──────────────────────────────────────────────────────
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

  // ── Programa de Indicações ───────────────────────────────────────────────
  //
  // Estes eventos NÃO tocam plano, saldo, assinatura nem cupom existente: só
  // aplicam e liquidam o benefício acumulado de indicações. Ver
  // lib/referral/webhook.ts para o mapa completo dos sinais.

  // Mensalidade do indicador nasce como rascunho: única janela em que o Stripe
  // aceita alterar a fatura antes de finalizá-la (~1h depois).
  if (event.type === 'invoice.created') {
    const invoice = event.data.object as Stripe.Invoice
    const outcome = await handleReferrerInvoiceCreated(stripe, supabase, invoice)
    // 500 → Stripe reentrega. A reserva já foi devolvida à fila, então a
    // retentativa recomeça limpa.
    if (outcome === 'retry') return NextResponse.json({ error: 'referral' }, { status: 500 })
  }

  // Fatura que não vingou: o benefício volta para a fila e entra na
  // mensalidade seguinte — benefício excedente nunca se perde.
  if (
    event.type === 'invoice.payment_failed' ||
    event.type === 'invoice.voided' ||
    event.type === 'invoice.marked_uncollectible'
  ) {
    await handleReferrerInvoiceUnpaid(supabase, event.data.object as Stripe.Invoice)
  }

  // Dinheiro do indicado voltou: indicação e recompensa caem. É a garantia de
  // que nenhum benefício sobrevive a pagamento reembolsado ou contestado.
  if (event.type === 'charge.refunded') {
    await handleChargeRefunded(supabase, event.data.object as Stripe.Charge)
  }
  if (event.type === 'charge.dispute.created') {
    await handleDisputeCreated(supabase, event.data.object as Stripe.Dispute)
  }

  // Cancelamento AGENDADO (cancel_at_period_end) — o caminho do portal do
  // Stripe, e o mais comum. O `customer.subscription.deleted` correspondente só
  // chega no fim do período, muito depois da janela de reembolso; é aqui que o
  // pedido de cancelamento é visto na hora em que acontece.
  //
  // Só mexe em indicação: plano, saldo e assinatura seguem intocados (o
  // downgrade continua sendo do subscription.deleted, mais abaixo).
  if (event.type === 'customer.subscription.updated') {
    const sub  = event.data.object as Stripe.Subscription
    const prev = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined

    // Só reage quando o próprio campo mudou neste evento — `updated` dispara
    // por muitos motivos, e reprocessar a cada um seria ruído.
    if (prev && 'cancel_at_period_end' in prev) {
      const userId = await resolveSubscriptionUserId(supabase, sub)
      if (userId) {
        if (sub.cancel_at_period_end) {
          await handleReferredSubscriptionCanceled(supabase, userId)
        } else {
          await handleReferredSubscriptionReactivated(supabase, userId)
        }
      }
    }
  }

  // ── mandate.updated: cliente mexeu na autorização do Pix Automático ──────
  //
  // O mandato vive no app do banco e pode ser revogado lá, fora do SPACENODE.
  // Revogado, as próximas faturas falham até a assinatura ser cancelada — e aí
  // o customer.subscription.deleted abaixo faz o downgrade. Não há o que
  // corrigir por código: o cliente precisa autorizar de novo. O log existe
  // para o suporte responder "por que parei de receber nodes" sem adivinhar.
  if (event.type === 'mandate.updated') {
    const mandate = event.data.object as Stripe.Mandate
    if (mandate.status !== 'active') {
      console.warn(
        `[stripe webhook] mandato Pix ${mandate.id} agora está "${mandate.status}" — ` +
        'as próximas cobranças da assinatura vão falhar até o cliente reautorizar'
      )
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

      // Indicações — cancelamento imediato (sem passar por cancel_at_period_end).
      // Dentro da janela de reembolso, derruba a recompensa do indicador.
      await handleReferredSubscriptionCanceled(supabase, cancelingProfile.id as string)
    }
  }

  return NextResponse.json({ received: true })
}
