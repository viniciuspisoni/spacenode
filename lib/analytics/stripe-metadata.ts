// lib/analytics/stripe-metadata.ts
//
// Identidade e atribuição que viajam DENTRO da session do Stripe (e espelhadas
// na assinatura, por causa do Pix) para o webhook conseguir gravar
// `subscription_started` com o mesmo `anonymous_id` e a mesma campanha do
// cadastro e do checkout. Sem isso, o evento de assinatura nasce sem origem —
// o webhook não tem request do visitante, só o objeto do Stripe.
//
// Também carrega a escolha de consentimento no momento da compra: um adapter
// server-side (Meta CAPI, quando entrar) precisa saber se pode enviar o
// evento de compra, e o webhook não tem o cookie sn_consent para consultar.
//
// Limites do Stripe: 50 chaves, 40 caracteres na chave, 500 no valor. Tudo
// aqui é identificador ou parâmetro de campanha — nenhum dado pessoal.

import type { AttributionSnapshot, AttributionTouch } from '@/lib/marketing/ads/naming'
import { parseConsentCookie, type ConsentChoice } from './consent'

/** Escolha de MARKETING no momento do fato: 'granted' | 'denied' | 'unknown'
 *  (sem cookie = ainda não escolheu). É o que governa os adapters
 *  server-side (server-adapters.ts) e vai no metadata do Stripe. */
export type MarketingConsentSnapshot = ConsentChoice | 'unknown'

/** Lê a escolha de marketing do valor cru do cookie sn_consent (qualquer um
 *  dos formatos que lib/analytics/consent.ts aceita). */
export function marketingConsentSnapshot(cookieValue: string | undefined | null): MarketingConsentSnapshot {
  const state = parseConsentCookie(cookieValue)
  if (!state) return 'unknown'
  return state.marketing ? 'granted' : 'denied'
}

export const STRIPE_META_KEYS = {
  anonymousId: 'sn_aid',
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  content: 'utm_content',
  landingPath: 'landing_path',
  touchedAt: 'attr_at',
  consent: 'consent',
} as const

const MAX_VALUE = 200

function clip(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return v ? v.slice(0, MAX_VALUE) : null
}

export interface StripeAttributionInput {
  anonymousId?: string | null
  attribution?: AttributionSnapshot | null
  consent: MarketingConsentSnapshot
}

/** Metadata pronto para `checkout.sessions.create` — só chaves com valor. */
export function attributionToStripeMetadata(input: StripeAttributionInput): Record<string, string> {
  const out: Record<string, string> = {}
  const last = input.attribution?.last
  const first = input.attribution?.first

  const put = (key: string, value: string | undefined | null) => {
    const v = clip(value)
    if (v) out[key] = v
  }

  put(STRIPE_META_KEYS.anonymousId, input.anonymousId)
  put(STRIPE_META_KEYS.source, last?.source)
  put(STRIPE_META_KEYS.medium, last?.medium)
  put(STRIPE_META_KEYS.campaign, last?.campaign)
  put(STRIPE_META_KEYS.content, last?.content)
  // A página de chegada é a do PRIMEIRO toque quando existe: é ela que diz
  // por onde a pessoa entrou, mesmo que a campanha do último toque seja outra.
  put(STRIPE_META_KEYS.landingPath, first?.landing_path ?? last?.landing_path)
  put(STRIPE_META_KEYS.touchedAt, last?.at)
  out[STRIPE_META_KEYS.consent] = input.consent
  return out
}

export interface StripeAttributionOutput {
  anonymousId: string | null
  attribution: AttributionSnapshot | null
  consent: MarketingConsentSnapshot
}

const ANON_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Reconstrói identidade e atribuição a partir do metadata que o Stripe
 *  devolve no webhook. Defensivo: o metadata é dado externo. */
export function attributionFromStripeMetadata(
  meta: Record<string, string | undefined> | null | undefined,
): StripeAttributionOutput {
  if (!meta || typeof meta !== 'object') {
    return { anonymousId: null, attribution: null, consent: 'unknown' }
  }
  const anon = clip(meta[STRIPE_META_KEYS.anonymousId])
  const anonymousId = anon && ANON_RE.test(anon) ? anon.toLowerCase() : null

  const touch: AttributionTouch = { at: clip(meta[STRIPE_META_KEYS.touchedAt]) ?? '' }
  const source = clip(meta[STRIPE_META_KEYS.source])
  const medium = clip(meta[STRIPE_META_KEYS.medium])
  const campaign = clip(meta[STRIPE_META_KEYS.campaign])
  const content = clip(meta[STRIPE_META_KEYS.content])
  const landingPath = clip(meta[STRIPE_META_KEYS.landingPath])
  if (source) touch.source = source
  if (medium) touch.medium = medium
  if (campaign) touch.campaign = campaign
  if (content) touch.content = content
  if (landingPath) touch.landing_path = landingPath

  const hasTouch = Boolean(source || medium || campaign || content || landingPath)
  const rawConsent = meta[STRIPE_META_KEYS.consent]
  const consent: MarketingConsentSnapshot =
    rawConsent === 'granted' || rawConsent === 'denied' ? rawConsent : 'unknown'

  return {
    anonymousId,
    attribution: hasTouch ? { last: touch } : null,
    consent,
  }
}
