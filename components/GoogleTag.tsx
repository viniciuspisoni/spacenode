'use client'

import Script from 'next/script'
import { GOOGLE_ADS_ID } from '@/lib/gtag'
import { useMarketingConsent } from '@/components/analytics/useMarketingConsent'

// Tag do Google Ads. Duas travas, ambas obrigatórias:
//   1. produção — o ID é fixo no código, evita poluir a conta com hits de
//      dev/preview (regra que já existia antes do consentimento);
//   2. consentimento de marketing 'granted' (cookie sn_consent).
// Sem as duas, nenhum script do Google é injetado.
//
// Mudança de comportamento em 2026-09-15: antes o gtag carregava para todo
// visitante em produção. Agora carrega só depois do "Aceitar" — é o que a
// cláusula 7 de /privacidade passou a descrever.
export default function GoogleTag() {
  const consent = useMarketingConsent()

  if (process.env.NODE_ENV !== 'production') return null
  if (consent !== 'granted') return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GOOGLE_ADS_ID}');
        `}
      </Script>
    </>
  )
}
