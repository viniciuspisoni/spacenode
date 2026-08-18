// lib/analytics/auth-intent.ts
//
// Retomada da intenção de plano depois da autenticação — usado pelos DOIS
// handlers de auth (/auth/callback e /auth/google) para decidir o destino
// pós-login com a MESMA regra:
//
//   1. `next` explícito na URL (só caminho interno) tem precedência;
//   2. senão, cookie sn_intent (CTA "Começar com <plano>") → /app/billing
//      com o plano/ciclo/oferta escolhidos + resume=1 (o BillingClient abre
//      o checkout sozinho, uma única vez);
//   3. senão, /app.
//
// Contas recém-criadas (proxy: created_at há menos de 60s) ganham `signup=1`
// no destino — é o gatilho do ping de conversão do Google Ads
// (components/SignupConversionPing.tsx), agora TAMBÉM no caminho GIS, que
// antes redirecionava seco para /app e perdia a conversão.
//
// O cookie de intenção é sempre LIMPO na resposta (intenção é de uso único).

import type { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { INTENT_COOKIE, intentResumePath, parseIntentCookie, type PlanIntent } from './attribution'

// Mesmo proxy de "acabou de se cadastrar" do /auth/callback original.
const NEW_USER_WINDOW_MS = 60_000

export function isNewUser(user: User | null | undefined): boolean {
  return (
    !!user?.created_at &&
    Date.now() - new Date(user.created_at).getTime() < NEW_USER_WINDOW_MS
  )
}

// Só caminho interno absoluto — nunca URL externa (open redirect).
function safeInternalPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  return value
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
  const explicitNext = safeInternalPath(input.next ?? null)

  const path = explicitNext ?? (intent ? intentResumePath(intent) : '/app')
  const url = new URL(path, input.origin)
  if (input.newUser) url.searchParams.set('signup', '1')
  return { url, intent }
}

/** Limpa o cookie de intenção na resposta (uso único). */
export function clearIntentCookieOn(res: NextResponse): void {
  res.cookies.set(INTENT_COOKIE, '', { maxAge: 0, path: '/' })
}
