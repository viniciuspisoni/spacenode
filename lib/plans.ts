// Catálogo de planos da Pricing v2.1.
//
// Os Stripe price IDs ficam em env vars server-side, não no array
// (mantém o padrão atual do .env.local: STRIPE_PRICE_ID_X_Y, sem
// NEXT_PUBLIC_). getStripePriceId() resolve o ID dinamicamente em
// rotas de servidor.

export type PlanId       = 'free' | 'starter' | 'pro' | 'studio' | 'office'
export type PaidPlanId   = Exclude<PlanId, 'free'>
export type BillingCycle = 'monthly' | 'annual'

/**
 * Venda do ciclo anual PAUSADA para o go-live: a reposição mensal de nodes
 * de uma assinatura anual ainda não existe (o webhook só recarrega em
 * `invoice.paid` com billing_reason=subscription_cycle, que numa assinatura
 * anual dispara 1× por ano — mas a UI e os Termos prometem nodes/mês).
 * Religar apenas quando houver mecanismo de recarga mensal para anuais.
 */
export const ANNUAL_BILLING_ENABLED = false

export interface Plan {
  id: PaidPlanId
  name: string
  /** Preço mensal pago mês a mês. */
  monthlyPrice: number
  /** Preço /mês equivalente quando pago anualmente. */
  annualMonthlyPrice: number
  /** Total cobrado uma vez ao ano. */
  annualTotal: number
  nodes: number
  description: string
  recommended: boolean
  cta: string
}

export const PLANS: Plan[] = [
  {
    id:                 'starter',
    name:               'Starter',
    monthlyPrice:       89,
    annualMonthlyPrice: 75,
    annualTotal:        890,
    nodes:              750,
    description:        'Estudante / freelancer testando',
    recommended:        false,
    cta:                'Começar com Starter',
  },
  {
    id:                 'pro',
    name:               'Pro',
    monthlyPrice:       199,
    annualMonthlyPrice: 167,
    annualTotal:        1990,
    nodes:              1800,
    description:        'Profissional autônomo em produção',
    recommended:        true,
    cta:                'Começar com Pro',
  },
  {
    id:                 'studio',
    name:               'Studio',
    monthlyPrice:       349,
    annualMonthlyPrice: 293,
    annualTotal:        3490,
    nodes:              3500,
    description:        'Escritório com volume e equipe',
    recommended:        false,
    cta:                'Começar com Studio',
  },
  {
    id:                 'office',
    name:               'Office',
    monthlyPrice:       699,
    annualMonthlyPrice: 583,
    annualTotal:        6990,
    nodes:              8000,
    description:        'Escritório consolidado, alto volume',
    recommended:        false,
    cta:                'Começar com Office',
  },
]

export function getPlanById(id: PlanId): Plan | undefined {
  return PLANS.find(p => p.id === id)
}

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return value === 'starter' || value === 'pro' || value === 'studio' || value === 'office'
}

/** Sugere o menor plano cujo limite de nodes cobre a necessidade. */
export function recommendPlan(nodesNeeded: number): Plan {
  return PLANS.find(p => p.nodes >= nodesNeeded) ?? PLANS[PLANS.length - 1]
}

/**
 * Server-side only. Lê o Stripe price ID a partir das envs no padrão
 * STRIPE_PRICE_ID_{PLAN}_{CYCLE} (ex.: STRIPE_PRICE_ID_OFFICE_ANNUAL).
 */
export function getStripePriceId(planId: PaidPlanId, billing: BillingCycle): string | undefined {
  const key = `STRIPE_PRICE_ID_${planId.toUpperCase()}_${billing.toUpperCase()}`
  return process.env[key]
}

/**
 * Server-side only. Reverse lookup pra resolver `priceId → {plan, billing}`.
 * Usado pelo webhook em `invoice.paid` pra descobrir qual plano renovou.
 */
export function findPlanByStripePriceId(
  priceId: string
): { plan: Plan; billing: BillingCycle } | undefined {
  for (const plan of PLANS) {
    for (const billing of ['monthly', 'annual'] as const) {
      if (getStripePriceId(plan.id, billing) === priceId) {
        return { plan, billing }
      }
    }
  }
  return undefined
}
