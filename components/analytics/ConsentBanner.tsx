'use client'

// Banner mínimo de consentimento de marketing. Aparece só enquanto o visitante
// não escolheu; some assim que escolhe, e a escolha persiste 180 dias no cookie
// sn_consent.
//
// Escopo deliberadamente pequeno — NÃO é uma CMP: uma pergunta binária
// ("aceitar" / "recusar" marketing de terceiros), sem categorias por
// finalidade, sem lista de fornecedores, sem TCF. O que ele governa está em
// lib/analytics/consent.ts: Google Ads e Meta Pixel.
//
// Não bloqueia a página. Cookies essenciais, tema e o cookie first-party de
// atribuição não dependem desta escolha e continuam funcionando — eles não são
// terceiros. Ver cláusula 7 de /privacidade.
//
// Estilo em .spn-consent* (globals.css) e não em utilitário do Tailwind: o
// reset `*` não-layered do globals zera padding das utilities no Tailwind v4.

import Link from 'next/link'
import { writeConsentChoice } from '@/lib/analytics/consent'
import { useMarketingConsent } from './useMarketingConsent'

export default function ConsentBanner() {
  const choice = useMarketingConsent()

  // `null` no servidor e no primeiro render do cliente — o banner só aparece
  // depois da hidratação, quando dá pra ler o cookie de verdade.
  if (choice !== null) return null

  return (
    <div role="region" aria-label="Consentimento de cookies de marketing" className="spn-consent">
      <div className="spn-consent-card">
        <p className="spn-consent-text">
          Usamos cookies de marketing de terceiros (Google e Meta) para medir de onde vêm os
          cadastros. Sem eles o site funciona igual.{' '}
          <Link href="/privacidade">Política de Privacidade</Link>.
        </p>

        <div className="spn-consent-actions">
          <button
            type="button"
            onClick={() => writeConsentChoice('denied')}
            className="spn-consent-btn spn-consent-btn--ghost"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => writeConsentChoice('granted')}
            className="spn-consent-btn spn-consent-btn--primary"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  )
}
