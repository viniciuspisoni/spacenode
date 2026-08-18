// lib/analytics/adapters/ga4.ts
//
// Adapter OPCIONAL de GA4 no client. Desligado por padrão: só age quando
// NEXT_PUBLIC_GA4_ID está definido E lib/analytics/consent.ts permite.
// Reusa o gtag.js que components/GoogleTag.tsx já injeta para o Google Ads —
// nenhum script novo; o config extra do GA4 é feito por
// components/analytics/MarketingPixels.tsx.
//
// ANTES de definir a env em produção: atualizar a cláusula 7 da política de
// privacidade (hoje promete "sem rastreadores de terceiros").

import { marketingConsentClient } from '../consent'
import type { AnalyticsEvent, AnalyticsProps } from '../events'

export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID

export function ga4Enabled(): boolean {
  return Boolean(GA4_ID) && marketingConsentClient()
}

/** Envia o evento ao GA4 via gtag já carregado. Nome do catálogo vira nome de
 *  evento custom no GA4 (snake_case já é o formato recomendado). */
export function ga4Track(event: AnalyticsEvent, props: AnalyticsProps): void {
  if (!ga4Enabled()) return
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', event, { ...props, send_to: GA4_ID })
}
