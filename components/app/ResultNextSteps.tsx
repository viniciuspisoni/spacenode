'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PostResultPlanOffer from './PostResultPlanOffer'
import { canOfferForContinuation, type ContinuationNeed } from '@/lib/onboarding'
import { track } from '@/lib/analytics/client'
import styles from './Onboarding.module.css'

const NEEDS: { id: ContinuationNeed; label: string }[] = [
  { id: 'one_project', label: 'Só neste projeto' },
  { id: 'recurring', label: 'Em projetos todo mês' },
  { id: 'unknown', label: 'Ainda não sei' },
]

/** Mounted only after the authenticated feedback confirms usefulness. */
export default function ResultNextSteps({ renderId, outputUrl, offer, onNextImage }: {
  renderId: string
  outputUrl?: string
  offer?: { nodeCost: number }
  onNextImage?: () => void
}) {
  const [need, setNeed] = useState<ContinuationNeed | null>(null)
  const key = `spn:render-continuation:v1:${renderId}`
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(key)
        if (NEEDS.some(item => item.id === saved)) setNeed(saved as ContinuationNeed)
      } catch {}
    })
    return () => cancelAnimationFrame(raf)
  }, [key])
  const choose = (value: ContinuationNeed) => {
    setNeed(value)
    try { localStorage.setItem(key, value) } catch {}
    track('cta_clicked', { cta: 'onboarding_continuation_need', need: value, render_id: renderId, flow_version: '2026-10-15' })
  }
  return <div className={styles.nextSteps} aria-label="Próximo passo do projeto">
    <strong>Qual é seu próximo passo?</strong>
    <div className={styles.tipActions}>
      {outputUrl && <Link className="spn-pill" href={`/app/editar?source=${encodeURIComponent(outputUrl)}&source_type=render&source_id=${encodeURIComponent(renderId)}&onboarding=1`}
        onClick={() => track('cta_clicked', { cta: 'onboarding_next_step', action: 'edit', render_id: renderId })}>Ajustar esta imagem →</Link>}
      {onNextImage && <button type="button" className="spn-pill" onClick={() => {
        track('cta_clicked', { cta: 'onboarding_next_step', action: 'next_image', render_id: renderId })
        onNextImage()
      }}>Preparar outra imagem →</button>}
    </div>
    <p>Como pretende usar a SpaceNode daqui para frente? Opcional.</p>
    <div className={styles.tipActions} role="group" aria-label="Necessidade de continuar">
      {NEEDS.map(item => <button type="button" key={item.id} className="spn-pill" aria-pressed={need === item.id} onClick={() => choose(item.id)}>{item.label}</button>)}
    </div>
    {need === 'one_project' && <p className={styles.caption}>Você pode seguir com os Nodes disponíveis e conferir as opções quando precisar.</p>}
    {need === 'unknown' && <p className={styles.caption}>Tudo bem. Sua imagem fica no histórico para você voltar quando precisar.</p>}
    {offer && canOfferForContinuation(true, true, need) && <PostResultPlanOffer renderId={renderId} nodeCost={offer.nodeCost} />}
  </div>
}
