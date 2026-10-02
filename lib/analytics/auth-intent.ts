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
// Contas recém-criadas (proxy: created_at OU email_confirmed_at há menos de
// 60s) ganham `signup=1` no destino — é o gatilho do ping de conversão
// (Google Ads + Meta Pixel, components/SignupConversionPing.tsx). Até
// 18/09/26 só o /auth/callback fazia isso; o caminho do Google redirecionava
// seco e o cadastro nunca virava conversão. Até 01/10/26 só valia o
// created_at — mas no cadastro por e-mail ele é a hora do formulário, e o
// callback roda no clique do link de confirmação, quase sempre mais de 60s
// depois: o cadastro por e-mail não virava conversão.
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

function withinNewUserWindow(iso: string | null | undefined): boolean {
  return !!iso && Date.now() - new Date(iso).getTime() < NEW_USER_WINDOW_MS
}

/** Conta criada agora (Google, cadastro com sessão imediata) ou e-mail
 *  confirmado agora (o clique no link de confirmação é o fim do cadastro). */
export function isNewUser(user: User | null | undefined): boolean {
  return withinNewUserWindow(user?.created_at) || withinNewUserWindow(user?.email_confirmed_at)
}

/** Acrescenta `signup=1` a um caminho interno já resolvido, preservando a
 *  query. Para o cadastro que devolve sessão na hora (confirmação de e-mail
 *  desligada no Supabase): o browser vai direto ao destino, sem passar pelo
 *  /auth/callback que marcaria a conta nova. */
export function withSignupFlag(path: string): string {
  const url = new URL(path, 'https://spacenode.app')
  url.searchParams.set('signup', '1')
  return `${url.pathname}${url.search}${url.hash}`
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
