'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PostResultPlanOffer from './PostResultPlanOffer'
import { canOfferForContinuation, type ContinuationNeed } from '@/lib/onboarding'
import { track } from '@/lib/analytics/client'
import styles from './Onboarding.module.css'
import { POST_RESULT_VERSION } from '@/lib/onboarding/post-result'

const NEEDS: { id: ContinuationNeed; label: string }[] = [
  { id: 'one_project', label: 'Só neste projeto' },
  { id: 'recurring', label: 'Em projetos todo mês' },
  { id: 'unknown', label: 'Ainda não sei' },
]

/** Mounted only after the authenticated feedback confirms usefulness. */
export default function ResultNextSteps({ renderId, outputUrl, offer, onNextImage, editJobId }: {
  renderId: string
  outputUrl?: string
  offer?: { nodeCost: number }
  onNextImage?: () => void
  editJobId?: string
}) {
  const [need, setNeed] = useState<ContinuationNeed | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const key = `spn:render-continuation:v1:${renderId}`
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(key)
        setNeed(NEEDS.some(item => item.id === saved) ? saved as ContinuationNeed : null)
      } catch { setNeed(null) }
      setLoadedFor(renderId)
    })
    return () => cancelAnimationFrame(raf)
  }, [key, renderId])
  const choose = (value: ContinuationNeed) => {
    setNeed(value)
    try { localStorage.setItem(key, value) } catch {}
    track('cta_clicked', { cta: 'onboarding_continuation_need', need: value, render_id: renderId, flow_version: POST_RESULT_VERSION })
  }
  return <div className={styles.nextSteps} aria-label="Próximo passo do projeto">
    {offer && loadedFor === renderId && canOfferForContinuation(true, true, need) &&
      <PostResultPlanOffer key={renderId} renderId={renderId} nodeCost={offer.nodeCost} kind={editJobId ? 'edit' : 'render'} />}
    <strong>Qual é seu próximo passo?</strong>
    <div className={styles.tipActions}>
      {outputUrl && <Link className="spn-pill" href={`/app/editar?source=${encodeURIComponent(outputUrl)}&source_type=${editJobId ? 'edit' : 'render'}&source_id=${encodeURIComponent(editJobId ?? renderId)}&onboarding=1`}
        onClick={() => track('cta_clicked', { cta: 'onboarding_next_step', action: 'edit', render_id: renderId })}>Ajustar esta imagem →</Link>}
      {onNextImage && <button type="button" className="spn-pill" onClick={() => {
        track('cta_clicked', { cta: 'onboarding_next_step', action: 'next_image', render_id: renderId })
        onNextImage()
      }}>Preparar outra imagem →</button>}
    </div>
    {offer && <><p>Como pretende usar a SpaceNode daqui para frente? Opcional.</p>
    <div className={styles.tipActions} role="group" aria-label="Necessidade de continuar">
      {NEEDS.map(item => <button type="button" key={item.id} className="spn-pill" aria-pressed={need === item.id} onClick={() => choose(item.id)}>{item.label}</button>)}
    </div>
    {need === 'one_project' && <p className={styles.caption}>Você pode seguir com os Nodes disponíveis e conferir as opções quando precisar.</p>}
    {need === 'unknown' && <p className={styles.caption}>Tudo bem. Sua imagem fica no histórico para você voltar quando precisar.</p>}
    </>}
  </div>
}
