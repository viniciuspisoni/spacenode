// ── Google Ads (gtag) ─────────────────────────────────────────────────────
//
// GOOGLE_ADS_ID é público de propósito (vai no <Script> carregado no
// client). O conversion label do cadastro ainda não existe na conta —
// NEXT_PUBLIC_GADS_SIGNUP_LABEL fica como placeholder até a campanha
// definir um; sem a env var, reportSignupConversion() não faz nada.

export const GOOGLE_ADS_ID = 'AW-18345260541'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export function reportSignupConversion(): void {
  const label = process.env.NEXT_PUBLIC_GADS_SIGNUP_LABEL
  if (!label) return
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return

  window.gtag('event', 'conversion', {
    send_to: `${GOOGLE_ADS_ID}/${label}`,
  })
}
