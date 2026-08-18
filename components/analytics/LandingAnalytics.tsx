'use client'

// Instrumentação da landing "/" — três sinais, zero mudança visual:
//
//   • landing_view   — 1× por carga da página.
//   • plans_viewed   — quando a seção #planos entra de fato no viewport (1×).
//   • cta_clicked    — listener DELEGADO em fase de captura para todo <a> que
//     leva ao /login: nenhum CTA precisa de onClick próprio (e o redesign da
//     landing pode mexer nos componentes sem quebrar o tracking). O rótulo do
//     CTA sai de data-cta (quando existir) ou da âncora/section mais próxima.
//
// Os cards de plano (PricingToggle) têm instrumentação própria — são <button>
// com intenção de plano (cookie sn_intent), não <a>.
//
// Renderiza null; montado só em app/page.tsx. As LPs de campanha (/lp/…) já
// têm lp_view/lp_cta_click server-side e ficam fora disto.

import { useEffect } from 'react'
import { track } from '@/lib/analytics/client'

function ctaLabelFor(anchor: HTMLAnchorElement): string {
  const explicit = anchor.closest<HTMLElement>('[data-cta]')?.dataset.cta
  if (explicit) return explicit
  const cls = anchor.className
  if (typeof cls === 'string') {
    if (cls.includes('spn-hero-cta')) return 'hero'
    if (cls.includes('nav-pill')) return 'navbar'
  }
  const section = anchor.closest('section')
  if (section?.id) return section.id
  if (section?.className && typeof section.className === 'string') {
    const m = section.className.match(/spn-([a-z-]+)/)
    if (m) return m[1]
  }
  return 'landing'
}

export default function LandingAnalytics() {
  useEffect(() => {
    track('landing_view')

    const onClick = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      if (!href.startsWith('/login')) return
      track('cta_clicked', { cta: ctaLabelFor(anchor) })
    }
    document.addEventListener('click', onClick, { capture: true, passive: true })

    let observer: IntersectionObserver | null = null
    const plans = document.getElementById('planos')
    if (plans && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        entries => {
          if (entries.some(en => en.isIntersecting)) {
            track('plans_viewed', { source: 'landing' })
            observer?.disconnect()
            observer = null
          }
        },
        { threshold: 0.25 },
      )
      observer.observe(plans)
    }

    return () => {
      document.removeEventListener('click', onClick, { capture: true })
      observer?.disconnect()
    }
  }, [])

  return null
}
