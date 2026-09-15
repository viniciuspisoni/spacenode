// lib/analytics/attribution.ts
//
// Identidade anônima + intenção de plano, ao lado da atribuição de campanha
// que já existe em lib/marketing/ads/naming.ts (cookie sn_attribution).
//
//   • sn_aid    — id anônimo first-party (uuid), 400 dias. Liga a jornada
//                 pré-cadastro ao user_id no evento de signup (o servidor lê
//                 o cookie; o browser nunca envia o valor no corpo).
//   • sn_intent — intenção de plano/oferta capturada no CTA ("Começar com
//                 Starter") e em /login?plan=…; sobrevive ao redirect do
//                 Google (GIS faz POST cross-site → SameSite=None em https)
//                 e à confirmação por e-mail. Lida e LIMPA pelos handlers de
//                 auth, que retomam o usuário em /app/billing no plano
//                 escolhido em vez do fluxo genérico.
//
// Nada aqui contém dado pessoal — só identificadores aleatórios e parâmetros
// de produto (plano/ciclo/oferta/destino). Cláusula 7 da política de
// privacidade cobre os dois cookies (first-party, sem terceiros).
//
// Isomórfico: no servidor, use os parsers com o valor cru do cookie; as
// funções de escrita são no-op fora do browser.

import { isPaidPlanId, type BillingCycle, type PaidPlanId } from '@/lib/plans'

export const ANON_COOKIE = 'sn_aid'
export const INTENT_COOKIE = 'sn_intent'

const ANON_MAX_AGE_S = 400 * 24 * 60 * 60 // teto prático do Chrome (~400 dias)
const INTENT_MAX_AGE_S = 24 * 60 * 60     // intenção vale por 1 dia

const ANON_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  const found = document.cookie.split('; ').find(c => c.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

/** Valida um valor de sn_aid vindo de cookie (browser ou request). */
export function parseAnonymousId(value: string | undefined | null): string | null {
  if (!value) return null
  try {
    const v = decodeURIComponent(value)
    return ANON_RE.test(v) ? v.toLowerCase() : null
  } catch {
    return null
  }
}

/** Garante o cookie sn_aid e retorna o id (browser). Best-effort: em ambiente
 *  sem cookies retorna null e nada quebra. */
export function ensureAnonymousId(): string | null {
  try {
    const existing = parseAnonymousId(readCookie(ANON_COOKIE))
    if (existing) return existing
    const id = crypto.randomUUID()
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${ANON_COOKIE}=${id}; Max-Age=${ANON_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`
    return id
  } catch {
    return null
  }
}

export function readAnonymousId(): string | null {
  return parseAnonymousId(readCookie(ANON_COOKIE))
}

// ── Intenção de plano/oferta ───────────────────────────────────────────────────

export interface PlanIntent {
  plan: PaidPlanId
  billing: BillingCycle
  /** Oferta anunciada no momento do clique (ex.: 'launch50'). Quem decide a
   *  aplicação real é o checkout — isto é só contexto de funil/UI. */
  offer?: string
  /** Rota interna de retorno pós-auth quando não é fluxo de plano. */
  next?: string
}

const OFFER_RE = /^[a-z0-9_-]{1,40}$/
// Só caminho interno absoluto ("/app/…") — nunca URL externa (open redirect).
const NEXT_RE = /^\/(?!\/)[\w\-/?=&#.%]{0,200}$/

/** Parse defensivo do cookie sn_intent (valor controlado pelo browser). */
export function parseIntentCookie(value: string | undefined | null): PlanIntent | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>
    if (!isPaidPlanId(parsed.plan)) return null
    const billing: BillingCycle = parsed.billing === 'annual' ? 'annual' : 'monthly'
    const intent: PlanIntent = { plan: parsed.plan, billing }
    if (typeof parsed.offer === 'string' && OFFER_RE.test(parsed.offer)) intent.offer = parsed.offer
    if (typeof parsed.next === 'string' && NEXT_RE.test(parsed.next)) intent.next = parsed.next
    return intent
  } catch {
    return null
  }
}

export function serializeIntentCookie(intent: PlanIntent): string {
  return encodeURIComponent(JSON.stringify(intent))
}

/** Grava a intenção no browser. SameSite=None em https porque o retorno do
 *  Google (GIS) chega por POST cross-site — com Lax o cookie não acompanharia
 *  a requisição e a intenção se perderia exatamente no caminho principal.
 *  Em http (dev) cai para Lax: o fluxo GIS não carrega a intenção em dev,
 *  os demais caminhos (OAuth redirect, e-mail) continuam funcionando. */
export function writeIntentCookie(intent: PlanIntent): void {
  try {
    const https = window.location.protocol === 'https:'
    const attrs = https ? '; SameSite=None; Secure' : '; SameSite=Lax'
    document.cookie =
      `${INTENT_COOKIE}=${serializeIntentCookie(intent)}; Max-Age=${INTENT_MAX_AGE_S}; Path=/${attrs}`
  } catch {
    // Best-effort: sem cookie o usuário só cai no fluxo genérico.
  }
}

export function clearIntentCookie(): void {
  try {
    document.cookie = `${INTENT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
  } catch {
    // idem
  }
}

/** Querystring de retomada pós-auth (/app/billing?…). Mantida numa função
 *  única para client e server montarem SEMPRE a mesma URL. */
export function intentResumePath(intent: PlanIntent): string {
  const params = new URLSearchParams({ plan: intent.plan, billing: intent.billing, resume: '1' })
  if (intent.offer) params.set('offer', intent.offer)
  return `/app/billing?${params.toString()}`
}
