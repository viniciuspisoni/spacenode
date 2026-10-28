// lib/analytics/adapters/meta-pixel.ts
//
// Adapter OPCIONAL do Meta Pixel no client. Desligado por padrão: só age com
// NEXT_PUBLIC_META_PIXEL_ID definido E consentimento (lib/analytics/consent).
// O script é injetado por components/analytics/MarketingPixels.tsx; aqui fica
// só o envio de eventos.
//
// O uso consentido do Pixel e da API de Conversões está descrito na cláusula 7
// da política de privacidade.

import { marketingConsentClient } from '../consent'
import type { AnalyticsEvent, AnalyticsProps } from '../events'

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

export function metaPixelEnabled(): boolean {
  return Boolean(META_PIXEL_ID) && marketingConsentClient()
}

/** Eventos do catálogo → eventos padrão do Meta quando existe equivalente. */
const STANDARD: Partial<Record<AnalyticsEvent, string>> = {
  plans_viewed:     'ViewContent',
  // Cadastro concluído. Não sai do coletor público (signup_completed é
  // server-only em CLIENT_EVENTS). AttributionBinder só envia após o servidor
  // confirmar a conta, com o mesmo eventID do envio pela API de Conversões.
  signup_completed: 'CompleteRegistration',
}

export function metaPixelTrack(event: AnalyticsEvent, props: AnalyticsProps, eventId?: string): boolean {
  if (!metaPixelEnabled()) return false
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false
  const standard = STANDARD[event]
  if (standard && eventId) window.fbq('track', standard, props, { eventID: eventId })
  else if (standard) window.fbq('track', standard, props)
  else window.fbq('trackCustom', event, props)
  return true
}
