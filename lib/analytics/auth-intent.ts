// lib/analytics/auth-intent.ts
//
// Destino pós-autenticação — usado pelos DOIS handlers de auth
// (/auth/callback e /auth/google) para decidir para onde mandar o usuário
// com a MESMA regra:
//
//   1. `next` explícito (query ou cookie sn_login_next; só caminho interno)
//      tem precedência — a página de login já embute nele a intenção de
//      plano quando chega `?plan=`;
//   2. senão, cookie sn_intent (CTA "Começar com <plano>") → /app/billing
//      com plano/ciclo + resume=1 (o BillingClient abre o checkout sozinho,
//      uma única vez). É a rede de segurança para quando o `next` se perde
//      no caminho (allowlist do Supabase, aba nova, link de e-mail antigo);
//   3. senão, /app.
//
// Contas recém-criadas (proxy: created_at há menos de 60s) ganham `signup=1`
// no destino — é o gatilho do ping de conversão (Google Ads + Meta Pixel,
// components/SignupConversionPing.tsx). Até 18/09/26 só o /auth/callback
// fazia isso; o caminho do Google redirecionava seco e o cadastro nunca
// virava conversão.
//
// O cookie de intenção NÃO é limpo aqui de propósito: o AttributionBinder
// ainda vai lê-lo no primeiro acesso ao /app para gravar `plan_intent` no
// evento de cadastro. Quem o consome e apaga é o BillingClient, ao retomar o
// checkout; o Max-Age de 24 h é o teto.

import type { User } from '@supabase/supabase-js'
import { internalNextPath } from '@/lib/auth/safe-next-path'
import { intentResumePath, parseIntentCookie, type PlanIntent } from './attribution'

// Mesmo proxy de "acabou de se cadastrar" do /auth/callback original.
const NEW_USER_WINDOW_MS = 60_000

export function isNewUser(user: User | null | undefined): boolean {
  return (
    !!user?.created_at &&
    Date.now() - new Date(user.created_at).getTime() < NEW_USER_WINDOW_MS
  )
}

export interface PostAuthDestination {
  url: URL
  intent: PlanIntent | null
}

/** Monta a URL pós-auth (next > intenção > /app) e marca signup=1 se novo. */
export function postAuthDestination(input: {
  origin: string
  next?: string | null
  intentCookie?: string | null
  newUser: boolean
}): PostAuthDestination {
  const intent = parseIntentCookie(input.intentCookie)
  const explicitNext = internalNextPath(input.next ?? null)

  const path = explicitNext ?? (intent ? intentResumePath(intent) : '/app')
  const url = new URL(path, input.origin)
  if (input.newUser) url.searchParams.set('signup', '1')
  return { url, intent }
}
