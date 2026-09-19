'use client'

import Script from 'next/script'
import { GOOGLE_ADS_ID } from '@/lib/gtag'
import { GA4_ID } from '@/lib/analytics/adapters/ga4'
import { useConsentState } from '@/components/analytics/useMarketingConsent'

// Injeta o gtag.js — a biblioteca que o Google Ads E o GA4 compartilham. Como
// são DUAS categorias de consentimento em cima de UM script, cada destino tem
// a sua trava e cada `config` sai só quando a sua categoria autoriza:
//
//   • Google Ads (GOOGLE_ADS_ID) → categoria "Marketing e atribuição", e só em
//     produção: o ID é fixo no código e hits de dev/preview sujariam a conta
//     (regra que já existia antes do consentimento);
//   • GA4 (NEXT_PUBLIC_GA4_ID) → categoria "Análise e desempenho". A trava é a
//     env var, como nos demais adapters; sem ela o GA4 não existe neste build.
//
// Sem nenhum dos dois autorizados, nada é injetado — nenhuma requisição sai
// para o Google. Aceitar só análise carrega o gtag.js e configura APENAS o
// GA4; aceitar só marketing configura APENAS o Ads.
//
// Mudança de comportamento em 2026-09-15: antes o gtag carregava para todo
// visitante em produção. Agora carrega só depois da escolha — é o que a
// cláusula 7 de /privacidade passou a descrever. Em 2026-09-18 o gate virou
// por categoria e o `config` do GA4 passou a morar aqui (antes o comentário de
// lib/analytics/adapters/ga4.ts apontava para um MarketingPixels.tsx que nunca
// existiu — o GA4 carregaria sem destino configurado).
export default function GoogleTag() {
  const consent = useConsentState()

  const ads = process.env.NODE_ENV === 'production' && consent?.marketing === true
  const ga4 = Boolean(GA4_ID) && consent?.analytics === true

  if (!ads && !ga4) return null

  // O `id` do loader é só qual medição carrega a biblioteca; os destinos de
  // verdade são os `config` abaixo. Com Ads ligado ele segue idêntico ao que
  // era, para não mexer na requisição que já existe em produção.
  const loaderId = ads ? GOOGLE_ADS_ID : GA4_ID

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${loaderId}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
${ads ? `          gtag('config', '${GOOGLE_ADS_ID}');\n` : ''}${ga4 ? `          gtag('config', '${GA4_ID}');\n` : ''}        `}
      </Script>
    </>
  )
}
