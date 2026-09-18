'use client'

// CTA das landing pages de campanha (/lp/[slug]).
//
// No clique, três coisas best-effort e nenhuma bloqueia a navegação:
//
//   1. `cta_clicked` no coletor first-party, com a POSIÇÃO do botão (hero,
//      pricing, final, sticky…) e o plano, quando o CTA é de plano. É o que
//      permite saber qual CTA da página converte — antes só existia um
//      contador único por LP.
//   2. o beacon legado `lp_cta_click`, que o painel /admin/marketing/ads e os
//      alertas (lib/marketing/ads/alerts.ts) ainda leem. Sai junto até o
//      painel migrar para o catálogo novo.
//   3. quando há `intent`, o cookie sn_intent com o plano escolhido. É ele que
//      faz o cadastro terminar no checkout desse plano, e não no /app
//      genérico (lib/analytics/attribution.ts, app/login, app/app/billing).
//
// O <a> segue normalmente — sem JS o link ainda funciona, porque o href já
// carrega `plan=` para a página de login gravar a intenção por conta própria.

import type { ReactNode } from 'react'
import { track } from '@/lib/analytics/client'
import { writeIntentCookie, type PlanIntent } from '@/lib/analytics/attribution'

export type LpCtaPosition = 'hero' | 'pricing' | 'final' | 'sticky' | 'section'

interface LpCtaLinkProps {
  href: string
  slug: string
  position: LpCtaPosition
  /** Plano/ciclo que o CTA vende. Ausente = cadastro grátis. */
  intent?: PlanIntent
  children: ReactNode
  className?: string
}

export function fireLpCta(slug: string, position: LpCtaPosition, intent?: PlanIntent): void {
  try {
    if (intent) writeIntentCookie(intent)
    track('cta_clicked', {
      cta: position,
      lp: slug,
      plan: intent?.plan ?? null,
      billing: intent?.billing ?? null,
    })
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

export default function LpCtaLink({ href, slug, position, intent, children, className }: LpCtaLinkProps) {
  return (
    <a href={href} onClick={() => fireLpCta(slug, position, intent)} className={className}>
      {children}
    </a>
  )
}
