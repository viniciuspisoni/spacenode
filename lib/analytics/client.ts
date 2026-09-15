// lib/analytics/client.ts
//
// API de rastreamento do BROWSER — a única porta que componentes client usam.
//
//   track('cta_clicked', { cta: 'pricing_card', plan: 'starter' })
//
// O que ela faz:
//   1. Garante o id anônimo (cookie sn_aid).
//   2. Envia o evento ao coletor first-party /api/analytics/track via
//      sendBeacon (sobrevive à navegação do clique) com fallback fetch
//      keepalive. O SERVIDOR anexa identidade (cookies) e atribuição — o corpo
//      leva só {event, props, page, referrer}.
//   3. Repassa aos adapters de terceiros habilitados (GA4/Meta Pixel), que são
//      no-op sem env var e respeitam lib/analytics/consent.ts.
//
// Best-effort por contrato: NUNCA lança, nunca bloqueia UI, no-op no SSR.
// Não aceita PII: props passam por sanitizeProps e o catálogo não tem campos
// de e-mail/telefone/prompt/imagem.

import {
  CLIENT_EVENTS,
  sanitizeProps,
  type AnalyticsEvent,
  type AnalyticsProps,
} from './events'
import { ensureAnonymousId } from './attribution'
import { ga4Track } from './adapters/ga4'
import { metaPixelTrack } from './adapters/meta-pixel'

const COLLECTOR = '/api/analytics/track'

/** Dispara um evento do funil a partir do browser. */
export function track(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  try {
    if (typeof window === 'undefined') return
    // Eventos server-only não saem do browser — evita duplicar com o servidor
    // e mantém o coletor com uma allowlist só (defesa em profundidade).
    if (!CLIENT_EVENTS.has(event)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[analytics] "${event}" é server-only — ignorado no client`)
      }
      return
    }

    ensureAnonymousId()

    const payload = JSON.stringify({
      event,
      props: sanitizeProps(props),
      page: window.location.pathname,
      referrer: document.referrer ? document.referrer.slice(0, 300) : null,
    })

    let sent = false
    if (typeof navigator.sendBeacon === 'function') {
      // text/plain evita o preflight CORS que Blob application/json provoca
      // em alguns browsers; o coletor faz o JSON.parse do corpo cru.
      sent = navigator.sendBeacon(COLLECTOR, new Blob([payload], { type: 'text/plain' }))
    }
    if (!sent) {
      void fetch(COLLECTOR, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
        body: payload,
      }).catch(() => {})
    }

    // Terceiros (no-op sem env/consentimento).
    ga4Track(event, props)
    metaPixelTrack(event, props)
  } catch {
    // Rastreamento jamais quebra a página.
  }
}
