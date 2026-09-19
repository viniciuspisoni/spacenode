'use client'

// Barra fixa da landing de campanha no mobile.
//
// Genérica por decisão do dono (18/09/26): não empurra um plano, leva à
// seção de planos ("Escolher meu plano" → #planos), onde cada plano tem o
// próprio CTA com a própria intenção. O clique registra `cta_clicked` com
// posição 'sticky' pela mesma rotina dos outros CTAs; sem `intent`, nada de
// cookie de plano é gravado.
//
// Some enquanto a seção-alvo está na tela: ali os CTAs de plano já estão
// visíveis e a barra só cobriria o último deles.

import { useEffect, useState } from 'react'
import { MobileCTA } from '@/components/landing/MobileCTA'
import { fireLpCta } from './LpCtaLink'
import type { PlanIntent } from '@/lib/analytics/attribution'

export default function LpStickyCta({
  slug,
  href,
  label,
  note,
  intent,
  hideWhenVisibleId,
}: {
  slug: string
  href: string
  label: string
  note?: string | null
  /** Plano que o CTA vende; ausente = CTA genérico. */
  intent?: PlanIntent
  /** id de uma seção: enquanto ela estiver no viewport, a barra some. */
  hideWhenVisibleId?: string
}) {
  const [suppressed, setSuppressed] = useState(false)

  useEffect(() => {
    if (!hideWhenVisibleId) return
    const target = document.getElementById(hideWhenVisibleId)
    if (!target || typeof IntersectionObserver !== 'function') return
    const io = new IntersectionObserver(
      entries => setSuppressed(entries.some(e => e.isIntersecting)),
      // A barra ocupa o rodapé do viewport: a seção conta como "na tela" a
      // partir do momento em que passa da metade inferior.
      { rootMargin: '0px 0px -40% 0px', threshold: 0 },
    )
    io.observe(target)
    return () => io.disconnect()
  }, [hideWhenVisibleId])

  return (
    <MobileCTA
      href={href}
      label={label}
      note={note ?? null}
      suppressed={suppressed}
      onClick={() => fireLpCta(slug, 'sticky', intent)}
    />
  )
}
