// Política de PLANO da edição — ÚNICO arquivo (centralizado).
//
// Contém:
//   1. teto mensal de correções grátis por plano;
//   2. mapeamento PlanId (catálogo lib/plans.ts) → UserPlan (vocabulário da spec).
//
// `office`→`beta` é PLACEHOLDER temporário do ambiente de testes — o editRouter
// NÃO usa userPlan nas regras hoje; o que importa é o teto mensal abaixo. Plano
// desconhecido no banco cai no fallback seguro de testes ('beta').

import type { UserPlan } from './edit-router'

// Fallback seguro durante o ambiente de testes atual.
const FALLBACK_PLAN: UserPlan = 'beta'

// Teto mensal de quick fixes grátis. Chaveado por nome de plano do BANCO
// (free/starter/essence/pro/studio/office) e também 'beta' (plano só-da-spec
// + fallback). Starter é legado (2026-09-12): mantém o teto de sempre para
// quem já assina; Essence entra no lugar dele na vitrine com o mesmo teto.
export const MONTHLY_FREE_FIX_LIMIT: Record<string, number> = {
  free:    2,
  starter: 10,   // spec: 'start' — legado, só assinantes existentes
  essence: 10,   // spec: 'start'
  pro:     25,
  studio:  60,
  office:  80,
  beta:    20,
}

export function monthlyFreeFixLimit(plan: string): number {
  return MONTHLY_FREE_FIX_LIMIT[plan] ?? MONTHLY_FREE_FIX_LIMIT[FALLBACK_PLAN]
}

// PlanId → UserPlan (spec). Plano desconhecido → fallback de testes ('beta').
export function specUserPlanFromPlanId(plan: string): UserPlan {
  switch (plan) {
    case 'free':    return 'free'
    case 'starter': return 'start'  // legado — só assinantes existentes
    case 'essence': return 'start'
    case 'pro':     return 'pro'
    case 'studio':  return 'studio'
    case 'office':  return 'beta'   // placeholder temporário — ver nota no topo
    default:        return FALLBACK_PLAN
  }
}
