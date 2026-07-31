// lib/referral/webhook.ts
//
// Efeitos do Programa de Indicações no ciclo de cobrança do Stripe. Vive fora
// da rota para que o webhook continue legível e para que a lógica de indicação
// possa ser lida (e revisada) isolada da ativação de plano, que ela NÃO toca.
//
// Mapa dos sinais:
//
//   invoice.paid (subscription_create) → indicado pagou a primeira mensalidade
//        · confirma a indicação e cria a recompensa de 20% em `pending`,
//          liberada só depois da janela de reembolso.
//   invoice.created (subscription_cycle) → mensalidade do INDICADOR em rascunho
//        · reserva as recompensas disponíveis (até 100%) e aplica o cupom na
//          FATURA — a assinatura e os cupons dela ficam intactos.
//   invoice.paid (qualquer) → a fatura com desconto foi paga: recompensa vira
//        `consumed`.
//   invoice.payment_failed / voided / marked_uncollectible → a fatura não
//        vingou: a recompensa VOLTA para a fila e entra na mensalidade seguinte.
//   charge.refunded / charge.dispute.created → o dinheiro do indicado voltou:
//        indicação e recompensa são revogadas.
//   customer.subscription.updated (cancel_at_period_end) / .deleted → o
//        indicado cancelou: se ainda estiver DENTRO da janela de reembolso, a
//        recompensa cai; desfazer o cancelamento na mesma janela a traz de volta.
//
// Todas as funções são best-effort para a cobrança: nenhuma delas pode impedir
// a ativação de um plano. Só o caminho de `invoice.created` pede retentativa,
// porque ali existe uma reserva de recompensa que não pode ficar pendurada.

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findPlanByStripePriceId } from '@/lib/plans'
import { isReferralProgramOpen } from './config'
import {
  claimPaymentFingerprint,
  claimRewardsForInvoice,
  claimStripeEvent,
  confirmReferral,
  getPendingReferral,
  rejectReferral,
  restoreReferralReward,
  revokeReferralReward,
  setApplicationCoupon,
  settleApplication,
} from './service'
import {
  applyCouponToDraftInvoice,
  ensureReferralCoupon,
  invoiceHasDiscount,
  resolveCardFingerprint,
  resolveInvoicePaymentIntent,
} from './stripe'

function strId<T extends { id: string }>(value: string | T | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

/** Price da primeira linha da fatura, nos dois formatos possíveis (Basil e pré-Basil). */
function invoicePriceId(invoice: Stripe.Invoice): string | null {
  const lineItem   = invoice.lines?.data?.[0]
  const priceField = lineItem?.pricing?.price_details?.price
  const legacy     = (lineItem as unknown as { price?: { id?: string } | null })?.price
  const resolved   = (typeof priceField === 'string' ? priceField : priceField?.id) ?? legacy?.id
  return resolved ?? null
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromLine = strId(invoice.lines?.data?.[0]?.subscription)
  if (fromLine) return fromLine
  return strId((invoice as unknown as { subscription?: string | { id: string } }).subscription)
}

/**
 * Dono da fatura. Mesma ordem do resto do webhook: metadata da assinatura
 * primeiro (gravado no checkout justamente para não depender da ordem de
 * chegada dos eventos), profile por customer depois.
 */
async function resolveInvoiceUserId(
  stripe: Stripe,
  admin: SupabaseClient,
  invoice: Stripe.Invoice,
): Promise<string | null> {
  const subscriptionId = invoiceSubscriptionId(invoice)
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      const fromMeta = sub.metadata?.user_id
      if (fromMeta) return fromMeta
    } catch (err) {
      console.warn('[referral] falha ao ler metadata da assinatura:', err)
    }
  }
  const customerId = strId(invoice.customer)
  if (!customerId) return null
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

// ── Confirmação: o indicado pagou a primeira mensalidade ────────────────────

/**
 * Chamado depois da ativação do plano, em `invoice.paid` com
 * `billing_reason=subscription_create`. Nunca lança e nunca devolve erro: a
 * assinatura já está ativa e um problema aqui não pode derrubar o webhook.
 */
export async function handleReferredFirstPayment(
  stripe: Stripe,
  admin: SupabaseClient,
  event: Stripe.Event,
  invoice: Stripe.Invoice,
  referredUserId: string,
): Promise<void> {
  try {
    if (!isReferralProgramOpen()) return

    // Fatura sem dinheiro entrando não confirma indicação nenhuma.
    if ((invoice.amount_paid ?? 0) <= 0) return

    const referral = await getPendingReferral(admin, referredUserId)
    if (!referral) return

    // Reentrega do mesmo evento não cria recompensa duas vezes (confirm_referral
    // já é idempotente; isto evita até as chamadas ao Stripe).
    const fresh = await claimStripeEvent(admin, `${event.id}:referral-confirm`, event.type)
    if (!fresh) return

    const paymentIntentId = await resolveInvoicePaymentIntent(stripe, invoice)
    const fingerprint     = await resolveCardFingerprint(stripe, paymentIntentId)

    // Mesmo cartão em duas contas: não é indicação, é a mesma pessoa.
    const claimed = await claimPaymentFingerprint(admin, fingerprint, referredUserId)
    if (!claimed.ok) {
      await rejectReferral(
        admin,
        referredUserId,
        'duplicate_payment_method',
        'shared_card_fingerprint',
      )
      console.warn(
        `[referral] indicação recusada — meio de pagamento já usado pela conta ` +
        `${claimed.ownerUserId ?? '?'} (indicado ${referredUserId})`,
      )
      return
    }

    const result = await confirmReferral(admin, {
      referredUserId,
      invoiceId: invoice.id!,
      paymentIntentId,
    })
    if (result.ok) {
      console.log(
        `[referral] indicação confirmada (indicado ${referredUserId}) — recompensa ` +
        `disponível em ${result.availableAt ?? '?'}`,
      )
    }
  } catch (err) {
    console.error('[referral] falha ao confirmar indicação:', err)
  }
}

// ── Aplicação: mensalidade do indicador em rascunho ─────────────────────────

export type InvoiceCreatedOutcome = 'skipped' | 'applied' | 'retry'

/**
 * `invoice.created` com `billing_reason=subscription_cycle`: a mensalidade do
 * indicador acabou de nascer como rascunho e ainda aceita alteração (o Stripe
 * só finaliza ~1h depois). É a janela para aplicar o desconto acumulado.
 *
 * Devolve 'retry' quando a reserva foi feita mas o Stripe falhou — aí o caller
 * responde 500 e o Stripe reentrega.
 */
export async function handleReferrerInvoiceCreated(
  stripe: Stripe,
  admin: SupabaseClient,
  invoice: Stripe.Invoice,
): Promise<InvoiceCreatedOutcome> {
  if (!isReferralProgramOpen()) return 'skipped'
  if (invoice.billing_reason !== 'subscription_cycle') return 'skipped'
  if (invoice.status !== 'draft') return 'skipped'
  if (!invoice.id) return 'skipped'

  // Nunca sobrescrever um desconto que não é nosso: seria apagar cupom alheio
  // e, no limite, acumular com a promoção de lançamento.
  if (invoiceHasDiscount(invoice)) {
    console.log(`[referral] fatura ${invoice.id} já tem desconto — programa não entra`)
    return 'skipped'
  }

  // O benefício é de MENSALIDADE. Ciclo anual (ou price desconhecido) fica fora.
  const priceId = invoicePriceId(invoice)
  const match   = priceId ? findPlanByStripePriceId(priceId) : undefined
  if (!match || match.billing !== 'monthly') return 'skipped'

  const userId = await resolveInvoiceUserId(stripe, admin, invoice)
  if (!userId) return 'skipped'

  const claim = await claimRewardsForInvoice(admin, userId, invoice.id)
  if (claim.percentOff <= 0) return 'skipped'

  try {
    const couponId = await ensureReferralCoupon(stripe, claim.percentOff)
    await applyCouponToDraftInvoice(stripe, invoice.id, couponId)
    await setApplicationCoupon(admin, invoice.id, couponId)
    console.log(
      `[referral] ${claim.percentOff}% aplicados na fatura ${invoice.id} ` +
      `(user ${userId}, ${claim.rewardIds.length} indicação(ões))`,
    )
    return 'applied'
  } catch (err) {
    // A reserva não pode ficar pendurada: devolve as recompensas para a fila.
    await settleApplication(admin, invoice.id, 'released')

    // Fatura finalizada entre o evento e este handler: retentar não adianta —
    // o benefício simplesmente entra na mensalidade seguinte.
    const notEditable =
      typeof err === 'object' && err !== null &&
      (err as { code?: string }).code === 'invoice_not_editable'
    if (notEditable) {
      console.warn(
        `[referral] fatura ${invoice.id} já finalizada — benefício devolvido à fila`,
      )
      return 'skipped'
    }
    console.error('[referral] falha ao aplicar desconto na fatura:', err)
    return 'retry'
  }
}

// ── Liquidação da fatura do indicador ───────────────────────────────────────

/** Mensalidade paga: o desconto foi usado de fato. */
export async function handleReferrerInvoicePaid(
  admin: SupabaseClient,
  invoice: Stripe.Invoice,
): Promise<void> {
  if (!invoice.id) return
  await settleApplication(admin, invoice.id, 'consumed')
}

/** Mensalidade que não vingou: benefício volta para a fila, nada se perde. */
export async function handleReferrerInvoiceUnpaid(
  admin: SupabaseClient,
  invoice: Stripe.Invoice,
): Promise<void> {
  if (!invoice.id) return
  await settleApplication(admin, invoice.id, 'released')
}

// ── Revogação: o dinheiro do indicado voltou ────────────────────────────────

export async function handleChargeRefunded(
  admin: SupabaseClient,
  charge: Stripe.Charge,
): Promise<void> {
  const paymentIntentId = strId(charge.payment_intent)
  if (!paymentIntentId) return
  const result = await revokeReferralReward(admin, {
    reason: 'refunded',
    paymentIntentId,
  })
  if (result.found) {
    console.warn(
      `[referral] indicação revogada por reembolso (payment intent ${paymentIntentId})` +
      (result.note ? ` — atenção: ${result.note}` : ''),
    )
  }
}

export async function handleDisputeCreated(
  admin: SupabaseClient,
  dispute: Stripe.Dispute,
): Promise<void> {
  const paymentIntentId = strId(dispute.payment_intent)
  if (!paymentIntentId) return
  const result = await revokeReferralReward(admin, {
    reason: 'disputed',
    paymentIntentId,
  })
  if (result.found) {
    console.warn(
      `[referral] indicação revogada por contestação (payment intent ${paymentIntentId})` +
      (result.note ? ` — atenção: ${result.note}` : ''),
    )
  }
}

// ── Cancelamento do indicado dentro da janela ───────────────────────────────

/**
 * Dono de uma assinatura, sem ida ao Stripe: o objeto do evento já traz tudo.
 * Ordem igual à do resto do webhook — metadata primeiro (gravado no checkout),
 * depois o profile pela assinatura e, por fim, pelo customer.
 */
export async function resolveSubscriptionUserId(
  admin: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = sub.metadata?.user_id
  if (fromMeta) return fromMeta

  const bySubscription = await admin
    .from('profiles')
    .select('id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()
  if (bySubscription.data?.id) return bySubscription.data.id as string

  const customerId = strId(sub.customer)
  if (!customerId) return null
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/**
 * O indicado cancelou. Dentro da janela de reembolso a recompensa cai — é o
 * mesmo raciocínio do reembolso: a assinatura não se sustentou.
 *
 * Vale tanto para o cancelamento imediato (`customer.subscription.deleted`)
 * quanto para o agendado no portal do Stripe (`cancel_at_period_end`), que é o
 * caminho comum. Ouvir só o `deleted` deixaria o caso comum de fora: ele só
 * chega no fim do período, muito depois da janela.
 *
 * Fora da janela não desfaz nada: o indicado usou o mês que pagou e o
 * indicador cumpriu o que o programa pede.
 */
export async function handleReferredSubscriptionCanceled(
  admin: SupabaseClient,
  referredUserId: string,
): Promise<void> {
  if (!isReferralProgramOpen()) return
  const result = await revokeReferralReward(admin, {
    reason:         'canceled_within_hold',
    referredUserId,
    onlyWithinHold: true,
  })
  if (result.found && !result.skipped) {
    console.warn(
      `[referral] indicação revogada — indicado ${referredUserId} cancelou ` +
      'dentro da janela de reembolso',
    )
  }
}

/** O indicado desfez o cancelamento ainda dentro da janela. */
export async function handleReferredSubscriptionReactivated(
  admin: SupabaseClient,
  referredUserId: string,
): Promise<void> {
  if (!isReferralProgramOpen()) return
  const { restored } = await restoreReferralReward(admin, referredUserId)
  if (restored) {
    console.log(
      `[referral] indicação restaurada — indicado ${referredUserId} desfez o ` +
      'cancelamento dentro da janela',
    )
  }
}
