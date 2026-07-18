'use client'

// Tracker mínimo de eventos de conversão — empurra pro window.dataLayer
// (padrão GTM/GA4); sem GTM instalado, vira no-op silencioso.
//
// Onde cada evento dispara:
//  - page_view            → components/analytics/AnalyticsListener.tsx (troca de rota)
//  - signup_started       → app/login/page.tsx (mode muda pra 'signup')
//  - signup_completed     → app/login/page.tsx (signUp concluído)
//  - checkout_started     → components/landing/PricingToggle.tsx e
//                            app/app/billing/BillingClient.tsx (POST autenticado em /api/stripe/checkout)
//  - subscription_created → app/app/billing/BillingClient.tsx (retorno do Stripe com ?success=true)

export type AnalyticsEvent =
  | 'page_view'
  | 'signup_started'
  | 'signup_completed'
  | 'checkout_started'
  | 'subscription_created'

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
  }
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
const UTM_STORAGE_KEY  = 'spn_utm'
const FIRED_ONCE_KEY   = 'spn_events_fired'

/** Grava UTMs da URL atual na sessão — preservados nos eventos seguintes mesmo após navegação. */
export function captureUtm(search: URLSearchParams) {
  if (typeof window === 'undefined') return
  const utm: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const value = search.get(key)
    if (value) utm[key] = value
  }
  if (Object.keys(utm).length > 0) {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm))
  }
}

function getStoredUtm(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function readFiredKeys(): string[] {
  try {
    const raw = sessionStorage.getItem(FIRED_ONCE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Envia um evento de conversão. `opts.once` (com `opts.key`, default = nome
 * do evento) evita disparo duplicado do mesmo evento na mesma aba/sessão —
 * usado em signup_started/signup_completed/checkout_started/subscription_created.
 */
export function track(event: AnalyticsEvent, params: Record<string, unknown> = {}, opts?: { once?: boolean; key?: string }) {
  if (typeof window === 'undefined') return

  if (opts?.once) {
    const key = opts.key ?? event
    const fired = readFiredKeys()
    if (fired.includes(key)) return
    sessionStorage.setItem(FIRED_ONCE_KEY, JSON.stringify([...fired, key]))
  }

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event, ...getStoredUtm(), ...params })
}
