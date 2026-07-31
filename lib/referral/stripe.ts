// lib/referral/stripe.ts
//
// Ponte entre o Programa de Indicações e o ciclo de cobrança do Stripe.
// Server-only.
//
// DESENHO — por que cupom por percentual, criado sob demanda:
//   • O benefício é percentual (10% / 20% × N), então precisa acompanhar o
//     valor real do plano: upgrade, downgrade e reajuste ficam corretos sem
//     nenhuma conta nossa. Crédito de saldo (valor fixo) não teria essa
//     propriedade.
//   • Os cupons vivem POR MODO na conta Stripe (teste ≠ live). Um id
//     determinístico (`spn-referral-20`) criado no primeiro uso dispensa
//     env var nova e funciona nos dois modos sem passo manual de deploy.
//   • `duration: 'once'` e aplicação na FATURA (não na assinatura): a
//     assinatura do cliente nunca é alterada e o histórico dela fica intacto.

import Stripe from 'stripe'

/** Id determinístico do cupom de N% — mesmo objeto reaproveitado sempre. */
export function referralCouponId(percentOff: number): string {
  return `spn-referral-${percentOff}`
}

function isResourceMissing(err: unknown): boolean {
  return err instanceof Stripe.errors.StripeError && err.code === 'resource_missing'
}

/**
 * Devolve o id de um cupom de `percentOff`% de uso único, criando-o se ainda
 * não existir neste modo do Stripe. Idempotente: a criação com id fixo em
 * corrida devolve `resource_already_exists`, que é tratado como sucesso.
 */
export async function ensureReferralCoupon(
  stripe: Stripe,
  percentOff: number,
): Promise<string> {
  const id = referralCouponId(percentOff)
  try {
    const coupon = await stripe.coupons.retrieve(id)
    if (!coupon.deleted) return id
  } catch (err) {
    if (!isResourceMissing(err)) throw err
  }

  try {
    await stripe.coupons.create({
      id,
      percent_off: percentOff,
      duration:    'once',
      name:        `Indicações SpaceNode — ${percentOff}%`,
      metadata:    { program: 'referral', percent_off: String(percentOff) },
    })
  } catch (err) {
    // Outra entrega do mesmo webhook criou primeiro — o objeto existe, segue.
    const already =
      err instanceof Stripe.errors.StripeError && err.code === 'resource_already_exists'
    if (!already) throw err
  }
  return id
}

/**
 * A fatura já tem desconto? Se tiver, o programa NÃO entra: sobrescrever
 * `discounts` apagaria um cupom que não é nosso (é o que garante "não altera
 * cupons atuais") e seria acúmulo indevido.
 */
export function invoiceHasDiscount(invoice: Stripe.Invoice): boolean {
  return Array.isArray(invoice.discounts) && invoice.discounts.length > 0
}

/**
 * Aplica um cupom a uma fatura EM RASCUNHO. Só rascunho aceita alteração —
 * finalizada, o Stripe recusa (`invoice_not_editable`).
 */
export async function applyCouponToDraftInvoice(
  stripe: Stripe,
  invoiceId: string,
  couponId: string,
): Promise<void> {
  await stripe.invoices.update(invoiceId, { discounts: [{ coupon: couponId }] })
}

/**
 * PaymentIntent que pagou uma fatura. Guardado na indicação para conseguir
 * ligar um `charge.refunded`/`charge.dispute.created` de volta à indicação —
 * o Charge não carrega o id da fatura.
 */
export async function resolveInvoicePaymentIntent(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<string | null> {
  const fromPayload = invoice.payments?.data?.[0]?.payment?.payment_intent
  if (fromPayload) {
    return typeof fromPayload === 'string' ? fromPayload : fromPayload.id
  }
  if (!invoice.id) return null
  try {
    const payments = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 1 })
    const pi = payments.data[0]?.payment?.payment_intent
    return pi ? (typeof pi === 'string' ? pi : pi.id) : null
  } catch (err) {
    console.warn('[referral] falha ao resolver payment intent da fatura:', err)
    return null
  }
}

/**
 * Fingerprint do cartão usado num pagamento — a mesma string para o mesmo
 * cartão em contas diferentes, que é o sinal de conta duplicada.
 * Pix e outros métodos sem cartão devolvem null (e nunca bloqueiam).
 */
export async function resolveCardFingerprint(
  stripe: Stripe,
  paymentIntentId: string | null,
): Promise<string | null> {
  if (!paymentIntentId) return null
  try {
    const charges = await stripe.charges.list({ payment_intent: paymentIntentId, limit: 1 })
    return charges.data[0]?.payment_method_details?.card?.fingerprint ?? null
  } catch (err) {
    console.warn('[referral] falha ao ler fingerprint do cartão:', err)
    return null
  }
}

/** Fingerprint direto de um Charge (caminho de reembolso/contestação). */
export function chargeCardFingerprint(charge: Stripe.Charge): string | null {
  return charge.payment_method_details?.card?.fingerprint ?? null
}
