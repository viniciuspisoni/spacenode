// Nome de exibição do plano — fonte única.
//
// Regra de produto: "Beta" NUNCA é nome de plano (é status do produto e só
// aparece na pill do header). Conta sem assinatura ativa exibe sempre
// "Gratuito" — em qualquer tela que mostre plano (dashboard, conta, billing,
// popover de saldo, identidade). Nenhuma tela deve ter string local de plano.

import { getPlanById, isPaidPlanId } from '@/lib/plans'

export const FREE_PLAN_LABEL = 'Gratuito'

/**
 * Resolve o nome do plano exibido ao usuário a partir do plan id persistido
 * (`profiles.plan` do pagador). Sem assinatura ativa ('free', null ou id
 * desconhecido/legado) → "Gratuito", sempre.
 */
export function getPlanDisplayName(planId: string | null | undefined): string {
  if (!planId || !isPaidPlanId(planId)) return FREE_PLAN_LABEL
  return getPlanById(planId)?.name ?? FREE_PLAN_LABEL
}
