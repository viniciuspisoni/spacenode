// Pix no checkout — fonte única da configuração.
//
// São DUAS coisas diferentes, e o Stripe as trata como produtos distintos:
//
//  • Pix comum (`mode: 'payment'`) — QR code, pagamento único. É o dos packs
//    de Nodes extras. Assíncrono: a Checkout Session completa ANTES do dinheiro entrar,
//    com `payment_status: 'unpaid'`. Quem credita é o webhook, em
//    `checkout.session.async_payment_succeeded`.
//
//  • Pix Automático (`mode: 'subscription'`) — mandato autorizado no app do
//    banco, com teto de valor e periodicidade. É o único caminho para
//    assinatura via Pix. A recorrência exige notificação de pré-débito 3 dias
//    antes de cada cobrança, então a fatura mensal só é paga alguns dias
//    DEPOIS da virada do ciclo (até 7, com as retentativas).
//
// Campos de mandate_options sondados contra a API real em 2026-07-27: no modo
// `subscription` o Stripe aceita só `amount`, `payment_schedule` e
// `amount_includes_iof`. `amount_type`, `reference`, `start_date` e `end_date`
// são rejeitados com 400 — não adianta "melhorar" a config com eles aqui.

import Stripe from 'stripe'
import type { BillingCycle } from '@/lib/plans'

// O SDK reexporta `Stripe.Checkout.SessionCreateParams` como tipo, mas não o
// namespace aninhado — `SessionCreateParams.PaymentMethodType` não resolve.
// Derivar por acesso indexado pega os mesmos tipos e não depende do formato
// interno do .d.ts, que já mudou entre versões.
type CreateParams   = Stripe.Checkout.SessionCreateParams
type PaymentMethod  = NonNullable<CreateParams['payment_method_types']>[number]
type PixOptions     = NonNullable<NonNullable<CreateParams['payment_method_options']>['pix']>

/**
 * Liga o Pix no checkout. Desligado por padrão de propósito: `pix` precisa
 * estar ATIVADO no Dashboard do Stripe (por modo — teste e live são contas
 * separadas) e, para assinatura, com Pix Automático habilitado. Enquanto não
 * estiver, mandar `pix` em payment_method_types faz o Stripe recusar a session
 * inteira — o que derrubaria também o checkout no cartão.
 */
export function isPixEnabled(): boolean {
  return process.env.STRIPE_PIX_ENABLED === '1'
}

/**
 * Janela do QR do Pix avulso. O padrão do Stripe é 4h; 1h é tempo de sobra
 * para pagar e evita que o cliente volte muito depois sem lembrar da compra.
 * (Mutuamente exclusivo com `expires_at` na mesma session.)
 */
export const PIX_EXPIRES_AFTER_SECONDS = 3600

/**
 * Pix Automático só é oferecido no ciclo mensal. `payment_schedule` do mandato
 * espelha a periodicidade da cobrança, e o ciclo anual está pausado
 * (ANNUAL_BILLING_ENABLED) — sem uma assinatura anual real para testar contra,
 * oferecer Pix nela seria chutar.
 */
export function pixAllowedForCycle(billing: BillingCycle): boolean {
  return billing === 'monthly'
}

export function paymentMethodTypes(withPix: boolean): PaymentMethod[] {
  return withPix ? ['card', 'pix'] : ['card']
}

/**
 * Teto que o cliente autoriza no app do banco. `amount_type` não é aceito em
 * subscription mode e o default do Stripe é `maximum`, então este valor é um
 * LIMITE, não o valor cobrado: a primeira mensalidade com o desconto de
 * lançamento passa tranquila por baixo dele.
 *
 * Passar o valor é obrigatório, não afinação: sem ele o Stripe assume um teto
 * de R$ 400 — que o plano Office (R$ 699) estoura, e a renovação falharia.
 *
 * Sem folga proposital — o cliente autoriza exatamente o preço anunciado.
 * A contrapartida: um aumento de preço não cabe no mandato antigo e exige um
 * mandato novo (Checkout em `setup` mode). Se algum dia os preços subirem,
 * este é o ponto que quebra primeiro.
 */
export function pixMandateOptions(amountInCents: number): PixOptions {
  return {
    mandate_options: {
      amount:           amountInCents,
      payment_schedule: 'monthly',
    },
  }
}

/**
 * Rede de segurança: distingue "o Stripe recusou o Pix" de qualquer outro erro.
 *
 * Se o Pix não estiver ativado na conta (ou a env for ligada antes disso), a
 * session inteira falha — inclusive para quem ia pagar no cartão. A rota
 * detecta esse erro e refaz a session sem Pix: melhor vender só no cartão do
 * que não vender.
 *
 * O erro vem sem `code` e com `param` inconsistente entre os modos (em
 * `payment` é `payment_method_types`, em `subscription` vem vazio), por isso a
 * checagem é pela mensagem. Escopo estreito: só `StripeInvalidRequestError`
 * que cite explicitamente o tipo pix.
 */
export function isPixRejectedError(err: unknown): boolean {
  return (
    err instanceof Stripe.errors.StripeInvalidRequestError &&
    /payment method type provided:\s*pix/i.test(err.message)
  )
}
