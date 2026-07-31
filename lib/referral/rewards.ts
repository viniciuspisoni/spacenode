// Contas do painel de indicações — funções puras.
//
// A escolha de QUAIS recompensas entram numa fatura é atômica e mora no banco
// (claim_referral_rewards). Aqui ficam só as agregações de exibição, puras e
// testáveis, para a UI nunca inventar um número diferente do que o banco fará.

import {
  MAX_PERCENT_OFF_PER_INVOICE,
  REFERRALS_FOR_FREE_MONTH,
  REFERRER_PERCENT_OFF,
} from './config'

export type RewardStatus = 'pending' | 'available' | 'applied' | 'consumed' | 'revoked'

export interface RewardRow {
  id: string
  percent_off: number
  status: RewardStatus
  available_at: string
  applied_invoice_id: string | null
  applied_at: string | null
  consumed_at: string | null
  created_at: string
}

export interface RewardSummary {
  /** Percentual pronto para entrar na próxima mensalidade. */
  availablePercent: number
  /** Confirmado, mas ainda dentro do prazo de reembolso. */
  pendingPercent: number
  /** Já reservado numa fatura em aberto. */
  appliedPercent: number
  /** Já usado numa mensalidade paga. */
  consumedPercent: number
  /** Quanto entra de fato na PRÓXIMA mensalidade (teto de 100%). */
  nextInvoicePercent: number
  /** Mensalidades inteiras já garantidas pelo saldo disponível. */
  freeMonthsBanked: number
  /** Indicações confirmadas rumo à próxima mensalidade grátis. */
  progressCount: number
  /** Quantas faltam para fechar a próxima mensalidade grátis. */
  progressRemaining: number
  /** 0–1, para a barra de progresso. */
  progressRatio: number
}

const sum = (rows: RewardRow[], status: RewardStatus): number =>
  rows.filter(r => r.status === status).reduce((acc, r) => acc + r.percent_off, 0)

export function summarizeRewards(rows: RewardRow[]): RewardSummary {
  const availablePercent = sum(rows, 'available')
  const pendingPercent   = sum(rows, 'pending')
  const appliedPercent   = sum(rows, 'applied')
  const consumedPercent  = sum(rows, 'consumed')

  const nextInvoicePercent = Math.min(availablePercent, MAX_PERCENT_OFF_PER_INVOICE)
  const freeMonthsBanked   = Math.floor(availablePercent / MAX_PERCENT_OFF_PER_INVOICE)

  // O progresso é do saldo que ainda não fecha uma mensalidade inteira: com
  // 120% disponíveis, uma mensalidade já está garantida e o progresso mostra
  // 1 de 5 rumo à seguinte.
  const leftover      = availablePercent % MAX_PERCENT_OFF_PER_INVOICE
  const progressCount = Math.round(leftover / REFERRER_PERCENT_OFF)

  return {
    availablePercent,
    pendingPercent,
    appliedPercent,
    consumedPercent,
    nextInvoicePercent,
    freeMonthsBanked,
    progressCount,
    progressRemaining: REFERRALS_FOR_FREE_MONTH - progressCount,
    progressRatio: progressCount / REFERRALS_FOR_FREE_MONTH,
  }
}

/** Rótulo do estado de uma recompensa no histórico. */
export function rewardStatusLabel(status: RewardStatus): string {
  switch (status) {
    case 'pending':   return 'aguardando prazo'
    case 'available': return 'disponível'
    case 'applied':   return 'na próxima fatura'
    case 'consumed':  return 'utilizada'
    case 'revoked':   return 'cancelada'
  }
}
