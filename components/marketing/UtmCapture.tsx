'use client'

// Captura first-party de atribuição: quando a URL de chegada traz utm_*/gclid/
// fbclid, grava/atualiza o cookie sn_attribution (first-party, sem dados
// pessoais — só parâmetros da URL, referrer e timestamps; nada de IP, nada de
// terceiros). A cláusula 7 da política de privacidade cobre a atualização do
// documento ANTES de qualquer terceiro entrar na stack — este cookie não é um
// terceiro, mas mantemos o mesmo rigor: nenhum script externo, nenhum pixel.
//
// Renderiza null; o integrador monta no layout raiz.

import { useEffect } from 'react'
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_COOKIE_MAX_AGE_DAYS,
  mergeAttribution,
  parseAttributionCookie,
  serializeAttributionCookie,
  touchFromSearchParams,
} from '@/lib/marketing/ads/naming'

/** Lê o valor cru de um cookie (ainda URL-encoded — o parse decodifica). */
function readCookie(name: string): string | null {
  const prefix = `${name}=`
  const found = document.cookie.split('; ').find((c) => c.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

export default function UtmCapture() {
  useEffect(() => {
    try {
      const touch = touchFromSearchParams(new URLSearchParams(window.location.search), {
        referrer: document.referrer,
        path: window.location.pathname,
        now: new Date().toISOString(),
      })
      // Sem parâmetro de campanha na URL → não gravamos cookie à toa.
      if (!touch) return

      const existing = parseAttributionCookie(readCookie(ATTRIBUTION_COOKIE))
      const snapshot = mergeAttribution(existing, touch)

      const maxAge = ATTRIBUTION_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie =
        `${ATTRIBUTION_COOKIE}=${serializeAttributionCookie(snapshot)}` +
        `; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
    } catch {
      // Best-effort: atribuição nunca pode quebrar a página.
    }
  }, [])

  return null
}
