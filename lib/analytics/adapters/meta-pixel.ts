// lib/analytics/adapters/meta-pixel.ts
//
// Adapter OPCIONAL do Meta Pixel no client. Desligado por padrão: só age com
// NEXT_PUBLIC_META_PIXEL_ID definido E consentimento (lib/analytics/consent).
// O script é injetado por components/analytics/MarketingPixels.tsx; aqui fica
// só o envio de eventos.
//
// ANTES de definir a env em produção: atualizar a cláusula 7 da política de
// privacidade (hoje promete "sem rastreadores de terceiros").

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
  plans_viewed: 'ViewContent',
}

export function metaPixelTrack(event: AnalyticsEvent, props: AnalyticsProps): void {
  if (!metaPixelEnabled()) return
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return
  const standard = STANDARD[event]
  if (standard) window.fbq('track', standard, props)
  else window.fbq('trackCustom', event, props)
}
