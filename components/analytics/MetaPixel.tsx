'use client'

import Script from 'next/script'
import { META_PIXEL_ID } from '@/lib/analytics/adapters/meta-pixel'
import { useMarketingConsent } from './useMarketingConsent'

// Snippet base do Meta Pixel (init + PageView). Duas travas, ambas obrigatórias:
//   1. NEXT_PUBLIC_META_PIXEL_ID presente;
//   2. consentimento de marketing 'granted' (cookie sn_consent).
// Sem as duas, nada é injetado — nenhuma requisição sai para o Meta.
//
// O evento de cadastro NÃO sai daqui — quem dispara CompleteRegistration é
// components/SignupConversionPing.tsx, reaproveitando o mesmo gatilho
// `?signup=1` que já existia para a conversão do Google Ads. Um único ponto
// de disparo por cadastro, sem CAPI.
export default function MetaPixel() {
  const consent = useMarketingConsent()

  if (!META_PIXEL_ID) return null
  if (consent !== 'granted') return null

  return (
    <Script id="meta-pixel-init" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
        document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${META_PIXEL_ID}');
        fbq('track', 'PageView');
      `}
    </Script>
  )
}
