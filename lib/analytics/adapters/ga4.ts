// lib/analytics/adapters/ga4.ts
//
// Adapter OPCIONAL de GA4 no client. Desligado por padrão: só age quando
// NEXT_PUBLIC_GA4_ID está definido E o visitante aceitou a categoria
// "Análise e desempenho" (lib/analytics/consent.ts).
//
// Reusa o gtag.js que components/GoogleTag.tsx injeta — nenhum script novo. É
// lá que mora a outra metade deste gate: com consentimento de análise e
// NEXT_PUBLIC_GA4_ID presente, o GoogleTag carrega a biblioteca e emite
// `gtag('config', GA4_ID)` mesmo que o visitante tenha recusado marketing. Os
// dois destinos do gtag.js são independentes — Ads responde a marketing, GA4 a
// análise —, então aceitar só análise carrega o GA4 normalmente.
//
// ANTES de definir a env em produção: atualizar a cláusula 7 da política de
// privacidade (hoje promete "sem rastreadores de terceiros").

import { analyticsConsentClient } from '../consent'
import type { AnalyticsEvent, AnalyticsProps } from '../events'

export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID

export function ga4Enabled(): boolean {
  return Boolean(GA4_ID) && analyticsConsentClient()
}

/** Envia o evento ao GA4 via gtag já carregado. Nome do catálogo vira nome de
 *  evento custom no GA4 (snake_case já é o formato recomendado). */
export function ga4Track(event: AnalyticsEvent, props: AnalyticsProps): void {
  if (!ga4Enabled()) return
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', event, { ...props, send_to: GA4_ID })
}
