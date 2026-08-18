import Script from 'next/script'
import { GA4_ID } from '@/lib/analytics/adapters/ga4'
import { META_PIXEL_ID } from '@/lib/analytics/adapters/meta-pixel'
import { marketingConsentClient } from '@/lib/analytics/consent'

// Scripts OPCIONAIS de marketing (GA4 / Meta Pixel) — nada renderiza sem a
// env var correspondente, e o gate de consentimento (lib/analytics/consent)
// segue a mesma regra do GoogleTag: só produção. O gtag.js em si já é
// carregado por components/GoogleTag.tsx (Google Ads) — o GA4 só acrescenta
// um `config`; o Meta Pixel injeta o snippet oficial.
//
// LGPD: antes de definir NEXT_PUBLIC_GA4_ID / NEXT_PUBLIC_META_PIXEL_ID em
// produção, atualizar a cláusula 7 da política de privacidade (hoje ela
// promete "sem rastreadores de terceiros"). Ver docs/ANALYTICS.md.
export default function MarketingPixels() {
  if (!marketingConsentClient()) return null

  return (
    <>
      {GA4_ID && (
        <Script id="ga4-config" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('config', '${GA4_ID}');
          `}
        </Script>
      )}
      {META_PIXEL_ID && (
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
      )}
    </>
  )
}
