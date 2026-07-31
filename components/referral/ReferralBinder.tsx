'use client'

// Vincula (uma única vez) o código de indicação guardado no cookie sn_ref à
// conta autenticada: POST /api/referrals/bind — o SERVIDOR lê o cookie da
// própria requisição; o browser não manda código nenhum.
//
// Mesmo desenho do AttributionBinder, com uma diferença: o flag em
// localStorage só é gravado quando a resposta é DEFINITIVA. Recusa temporária
// (o programa ainda não entrou em vigor) mantém o cookie e tenta de novo na
// próxima visita — é o que faz um convite compartilhado em agosto valer para
// quem assina em setembro.
//
// Renderiza null; o integrador monta no layout autenticado (/app).

import { useEffect } from 'react'
import { REFERRAL_COOKIE } from '@/lib/referral/config'

const BOUND_FLAG = 'sn_ref_bound'

export default function ReferralBinder() {
  useEffect(() => {
    try {
      if (!document.cookie.includes(`${REFERRAL_COOKIE}=`)) return
      if (window.localStorage.getItem(BOUND_FLAG) === '1') return

      void fetch('/api/referrals/bind', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
      })
        .then(res => (res.ok ? res.json() : null))
        .then((data: { bound?: boolean; retry?: boolean } | null) => {
          if (!data) return
          if (data.bound || data.retry === false) {
            window.localStorage.setItem(BOUND_FLAG, '1')
          }
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
