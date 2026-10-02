// lib/billing/landing-checkout.ts
//
// Clique no botão de um plano da landing. Com sessão, abre o checkout do
// Stripe; sem sessão (401), leva ao cadastro carregando plano e ciclo — antes
// o redirect era para /login?mode=signup puro e quem escolheu "Começar com
// Essence" terminava o cadastro no /app genérico, longe do checkout.
//
// Dependências injetáveis só para o teste; a landing usa os padrões.

import { planSignupPath, writeIntentCookie } from '@/lib/analytics/attribution'
import type { BillingCycle, PaidPlanId } from '@/lib/plans'

export interface LandingCheckoutDeps {
  fetch: typeof fetch
  navigate: (url: string) => void
  rememberIntent: typeof writeIntentCookie
}

const defaultDeps = (): LandingCheckoutDeps => ({
  fetch: (...args) => fetch(...args),
  navigate: url => { window.location.href = url },
  rememberIntent: writeIntentCookie,
})

export async function startLandingCheckout(
  id: PaidPlanId,
  billing: BillingCycle,
  deps: LandingCheckoutDeps = defaultDeps(),
): Promise<void> {
  const res = await deps.fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'plan', id, billing }),
  })
  if (res.status === 401) {
    // Cookie além da URL: sobrevive ao POST do Google e a uma aba nova.
    deps.rememberIntent({ plan: id, billing })
    deps.navigate(planSignupPath(id, billing))
    return
  }
  // Já assinante (guarda anti-cobrança-dupla) — plano se gerencia no billing.
  if (res.status === 409) { deps.navigate('/app/billing'); return }
  if (!res.ok) return
  const data = (await res.json()) as { url?: string }
  if (data.url) deps.navigate(data.url)
}
