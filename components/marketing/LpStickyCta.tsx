'use client'

// Barra fixa da landing de campanha no mobile: vende o plano de entrada com
// o preço no rótulo. O clique grava a intenção do plano e o evento de CTA
// com posição 'sticky' (mesma rotina dos outros CTAs da LP) e navega para o
// cadastro com `plan=` na query, redundância para quem chega sem JS.

import { MobileCTA } from '@/components/landing/MobileCTA'
import { fireLpCta } from './LpCtaLink'
import type { PlanIntent } from '@/lib/analytics/attribution'

export default function LpStickyCta({
  slug,
  href,
  label,
  note,
  intent,
}: {
  slug: string
  href: string
  label: string
  note?: string | null
  intent: PlanIntent
}) {
  return (
    <MobileCTA
      href={href}
      label={label}
      note={note ?? null}
      onClick={() => fireLpCta(slug, 'sticky', intent)}
    />
  )
}
