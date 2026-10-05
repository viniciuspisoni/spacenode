'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getPlanById } from '@/lib/plans'
import { track } from '@/lib/analytics/client'

const plan = getPlanById('essence')!

/** Optional offer after a successful result; never opens a checkout automatically. */
export default function PostResultPlanOffer({ renderId, nodeCost }: { renderId: string; nodeCost: number }) {
  const [dismissed, setDismissed] = useState(false)
  const recorded = useRef(false)
  useEffect(() => {
    if (recorded.current) return
    recorded.current = true
    track('plans_viewed', { surface: 'render_result', plan: plan.id, render_id: renderId })
  }, [renderId])
  if (dismissed) return null
  const estimate = Number.isFinite(nodeCost) && nodeCost > 0 ? Math.floor(plan.nodes / nodeCost) : null
  return (
    <section className="mt-4 rounded-xl border border-border bg-bg-elevated p-4" aria-label="Continuar com um plano">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong>Gostou do resultado? Continue criando para seus projetos.</strong>
          <p className="mt-2 text-sm text-text-secondary">
            {plan.name} · {plan.monthlyPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês · {plan.nodes} Nodes por mês.
          </p>
          {estimate !== null && <p className="mt-1 text-xs text-text-tertiary">Estimativa de {estimate} imagens nesta configuração. O consumo varia por motor e resolução.</p>}
        </div>
        <button type="button" aria-label="Dispensar oferta de plano" className="rounded px-2 py-1 text-text-secondary" onClick={() => setDismissed(true)}>×</button>
      </div>
      <Link className="spn-ghost mt-3 inline-flex" href="/app/billing?plan=essence&billing=monthly" onClick={() => track('cta_clicked', { cta: 'render_result_essence', plan: plan.id, render_id: renderId })}>Conhecer o Essence →</Link>
      <p className="mt-2 text-xs text-text-tertiary">Confira sua imagem antes de usar na apresentação. Você escolhe se quer assinar.</p>
    </section>
  )
}
