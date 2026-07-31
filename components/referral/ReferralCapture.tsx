'use client'

// Captura first-party do código de indicação: quando a URL de chegada traz
// ?ref=CODIGO, grava o cookie sn_ref. Mesmo rigor do UtmCapture — o cookie
// guarda só um código gerado por nós, nenhum dado pessoal, nenhum terceiro.
//
// O link bonito (/convite/CODIGO) grava o mesmo cookie no servidor; este
// componente cobre o formato com query string, que é o que sobrevive quando
// alguém compartilha a URL já navegada.
//
// Renderiza null; o integrador monta no layout raiz.

import { useEffect } from 'react'
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE_DAYS } from '@/lib/referral/config'
import { normalizeReferralCode } from '@/lib/referral/codes'

export default function ReferralCapture() {
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('ref')
      const code = normalizeReferralCode(raw)
      if (!code) return

      // Primeiro convite vence: quem já tem um código guardado não é
      // "roubado" por um segundo link antes de se cadastrar.
      if (document.cookie.includes(`${REFERRAL_COOKIE}=`)) return

      const maxAge = REFERRAL_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `${REFERRAL_COOKIE}=${code}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
    } catch {
      // Best-effort: indicação nunca pode quebrar a página.
    }
  }, [])

  return null
}
