// Programa de Indicações — parâmetros e cópia.
//
// Mesmo desenho de lib/launch-offer.ts, e pela mesma razão: a janela precisa ser
// lida pelo servidor (checkout, webhook) E pelo cliente (painel). Data fixa no
// código = uma fonte só; env `NEXT_PUBLIC_` seria inlinada no build e abriria
// espaço para a UI prometer o que o Stripe não cobra.
//
// Os IDs de cupom do Stripe ficam em env (lib/referral/stripe.ts) porque os
// objetos vivem na conta Stripe e diferem entre modo teste e live.

import { isLaunchOfferOpen } from '@/lib/launch-offer'
import type { BillingCycle } from '@/lib/plans'

/**
 * Entrada em vigor. Horário de Brasília (UTC-3).
 *
 * Casa com o fim da promoção de lançamento (31/08/2026 23h59) de propósito:
 * as duas campanhas nunca se sobrepõem no calendário. Ainda assim, o
 * não-acúmulo é imposto por código em `resolveCheckoutDiscount` — mudar uma
 * data não pode virar desconto duplo por acidente.
 */
export const REFERRAL_PROGRAM_STARTS_AT = new Date('2026-09-01T00:00:00-03:00')

/** Desliga o programa inteiro sem mexer na data (kill switch de deploy). */
export const REFERRAL_PROGRAM_ENABLED = true

/** Indicado: desconto na PRIMEIRA mensalidade. */
export const REFERRED_PERCENT_OFF = 10

/** Indicador: desconto na PRÓXIMA mensalidade, por indicação confirmada. */
export const REFERRER_PERCENT_OFF = 20

/** Teto por mensalidade — 5 × 20% = uma mensalidade inteira. */
export const MAX_PERCENT_OFF_PER_INVOICE = 100

/** Indicações confirmadas que equivalem a uma mensalidade grátis. */
export const REFERRALS_FOR_FREE_MONTH = MAX_PERCENT_OFF_PER_INVOICE / REFERRER_PERCENT_OFF

/**
 * Janela de reembolso. A recompensa do indicador só fica disponível depois
 * deste prazo contado do pagamento confirmado do indicado — é o que impede
 * pagar benefício sobre dinheiro que ainda pode voltar.
 */
export const REWARD_HOLD_DAYS = 7

/**
 * Idade máxima da conta para aceitar um código. "Cada nova conta pode utilizar
 * apenas uma indicação" — nova de verdade: quem já usa a plataforma há meses
 * não entra pelo programa com um link de amigo.
 */
export const REFERRAL_BIND_WINDOW_DAYS = 30

/** Cookie first-party com o código de quem indicou (sem dado pessoal). */
export const REFERRAL_COOKIE = 'sn_ref'
export const REFERRAL_COOKIE_MAX_AGE_DAYS = 90

/** O programa está valendo agora? */
export function isReferralProgramOpen(now: Date = new Date()): boolean {
  return REFERRAL_PROGRAM_ENABLED && now.getTime() >= REFERRAL_PROGRAM_STARTS_AT.getTime()
}

/** "1 de setembro de 2026" — usado nos avisos de "ainda não começou". */
export function referralProgramStartLabel(): string {
  return REFERRAL_PROGRAM_STARTS_AT.toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  })
}

// ── Não-acúmulo ─────────────────────────────────────────────────────────────

export type CheckoutDiscount =
  | { kind: 'launch';   percentOff: number }
  | { kind: 'referral'; percentOff: number }
  | { kind: 'none';     percentOff: 0 }

export interface CheckoutDiscountInput {
  /** Já elegível à promoção de lançamento (mensal + janela aberta + 1ª assinatura). */
  launchEligible: boolean
  /** Tem uma indicação vinculada e ainda não usada. */
  hasPendingReferral: boolean
  /** Primeira assinatura da conta — o 10% é da PRIMEIRA mensalidade. */
  firstSubscription: boolean
  billing: BillingCycle
  now?: Date
}

/**
 * Decide QUAL desconto entra no checkout. Um só, nunca dois.
 *
 * A promoção de lançamento vence quando as duas coincidem: é a maior (50% × 10%)
 * e é a que a landing está anunciando. "Os descontos não podem ser acumulados
 * com a promoção de lançamento" vira, aqui, uma escolha exclusiva.
 */
export function resolveCheckoutDiscount(input: CheckoutDiscountInput): CheckoutDiscount {
  const now = input.now ?? new Date()

  if (input.launchEligible) {
    return { kind: 'launch', percentOff: 50 }
  }
  // Cinto e suspensório: mesmo sem elegibilidade calculada pelo caller, a
  // indicação não entra enquanto a campanha de lançamento estiver no ar.
  if (isLaunchOfferOpen(now)) {
    return { kind: 'none', percentOff: 0 }
  }
  if (
    isReferralProgramOpen(now) &&
    input.hasPendingReferral &&
    input.firstSubscription &&
    input.billing === 'monthly'
  ) {
    return { kind: 'referral', percentOff: REFERRED_PERCENT_OFF }
  }
  return { kind: 'none', percentOff: 0 }
}

// ── Cópia central ───────────────────────────────────────────────────────────
// Mensagem única em todos os pontos de contato. Tom do produto: preciso, sem
// aparência promocional — é um benefício de uso, não uma liquidação.

export const REFERRAL_HEADLINE = 'Indicações'
export const REFERRAL_PITCH =
  'Quem entra pelo seu convite tem 10% na primeira mensalidade. ' +
  'Você recebe 20% na próxima mensalidade a cada indicação confirmada.'
export const REFERRAL_FINE_PRINT =
  'A recompensa é liberada depois do pagamento confirmado do indicado e do ' +
  'encerramento do prazo de reembolso. Os descontos somam até 100% de uma ' +
  'mensalidade; o que exceder entra nas mensalidades seguintes. Não acumula ' +
  'com a promoção de lançamento.'
