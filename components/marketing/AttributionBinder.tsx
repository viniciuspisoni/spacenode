'use client'

// Vincula (uma única vez) o cookie first-party sn_attribution ao usuário
// autenticado: POST /api/marketing/track {type:'bind_signup'} — o SERVIDOR lê
// o cookie da requisição e grava o evento de signup; o browser não envia dado
// nenhum além do type. O flag em localStorage evita repetir a chamada a cada
// visita (o índice único no banco já garante idempotência de qualquer forma).
//
// Renderiza null; o integrador monta no layout autenticado (/app).

import { useEffect } from 'react'
import { ATTRIBUTION_COOKIE } from '@/lib/marketing/ads/naming'

const BOUND_FLAG = 'sn_attr_bound'

export default function AttributionBinder() {
  useEffect(() => {
    try {
      if (!document.cookie.includes(`${ATTRIBUTION_COOKIE}=`)) return
      if (window.localStorage.getItem(BOUND_FLAG) === '1') return
      void fetch('/api/marketing/track', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'bind_signup' }),
      })
        .then((res) => {
          if (res.ok) window.localStorage.setItem(BOUND_FLAG, '1')
        })
        .catch(() => {
          // Silencioso: tenta de novo na próxima visita.
        })
    } catch {
      // localStorage/cookies indisponíveis — melhor não vincular do que quebrar.
    }
  }, [])

  return null
}
