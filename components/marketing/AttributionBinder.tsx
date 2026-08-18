'use client'

// Vincula (uma única vez) a jornada pré-login ao usuário autenticado:
// POST /api/marketing/track {type:'bind_signup'} — o SERVIDOR lê os cookies
// first-party da requisição (sn_attribution + sn_aid + sn_intent) e grava o
// evento de signup; o browser não envia dado nenhum além do type. O flag em
// localStorage evita repetir a chamada a cada visita (o índice único no banco
// já garante idempotência de qualquer forma).
//
// Roda TAMBÉM sem cookie de atribuição: cadastro orgânico gera o evento de
// signup do mesmo jeito (sem UTM) — sem isso o funil visita→cadastro só
// enxergava tráfego de campanha.
//
// Renderiza null; o integrador monta no layout autenticado (/app).

import { useEffect } from 'react'

const BOUND_FLAG = 'sn_attr_bound'

export default function AttributionBinder() {
  useEffect(() => {
    try {
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
