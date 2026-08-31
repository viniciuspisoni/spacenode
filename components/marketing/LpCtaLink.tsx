'use client'

// CTA das landing pages de campanha (/lp/[slug]). Dispara o evento de clique
// via navigator.sendBeacon (first-party, não bloqueia a navegação) e deixa o
// <a> seguir normalmente. Falha do beacon é silenciosa — rastreamento é
// best-effort e nunca atrapalha o visitante.

import type { ReactNode } from 'react'

interface LpCtaLinkProps {
  href: string
  slug: string
  children: ReactNode
  className?: string
}

export default function LpCtaLink({ href, slug, children, className }: LpCtaLinkProps) {
  function handleClick() {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(
          '/api/marketing/track',
          new Blob([JSON.stringify({ type: 'lp_cta_click', slug })], { type: 'application/json' }),
        )
      }
    } catch {
      // Silencioso: o clique navega mesmo sem rastreio.
    }
  }

  return (
    <a href={href} onClick={handleClick} className={className}>
      {children}
    </a>
  )
}
