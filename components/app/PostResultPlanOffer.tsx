'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getPlanById } from '@/lib/plans'
import { track } from '@/lib/analytics/client'
import { POST_RESULT_BILLING_HREF, POST_RESULT_VERSION, postResultCapacity } from '@/lib/onboarding/post-result'
import { useResultExposure } from './useResultExposure'
import styles from './Onboarding.module.css'
import { NODES_ROLLOVER_COPY } from '@/lib/billing/nodes'

const plan = getPlanById('essence')!

/** Shown by RenderFeedback after explicit confirmation of usefulness. */
export default function PostResultPlanOffer({ renderId, nodeCost, kind = 'render' }: { renderId: string; nodeCost: number; kind?: 'render' | 'edit' }) {
  const [dismissed, setDismissed] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const storageKey = `spn:result-plan-offer:v2:${renderId}`
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let saved = false
      try { saved = sessionStorage.getItem(storageKey) === 'dismissed' } catch {}
      setDismissed(saved)
      setLoadedFor(renderId)
    })
    return () => cancelAnimationFrame(frame)
  }, [renderId, storageKey])
  const visible = loadedFor === renderId && !dismissed
  const exposure = useResultExposure(renderId, 'offer', visible, kind)
  const dismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem(storageKey, 'dismissed') } catch {}
    track('cta_clicked', { cta: 'render_result_offer_dismissed', plan: plan.id, render_id: renderId, flow_version: POST_RESULT_VERSION, kind })
  }
  if (!visible) return null
  const estimate = postResultCapacity(nodeCost)
  return (
    <section ref={exposure} className={styles.planOffer} aria-label="Continuar com um plano">
      <div className={styles.planOfferHead}>
        <div>
          <span className={styles.eyebrow}>Para os seus próximos projetos</span>
          <h3>Continue criando com a SpaceNode.</h3>
          <p>Para continuar criando em projetos todos os meses.</p>
        </div>
        <button type="button" aria-label="Dispensar oferta de plano" className={styles.close} onClick={dismiss}>×</button>
      </div>
      <div className={styles.planOfferPrice}>
        <strong>{plan.name}</strong>
        <span>{plan.monthlyPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<small>/mês</small></span>
        <p>{plan.nodes.toLocaleString('pt-BR')} Nodes por mês</p>
      </div>
      <div className={styles.planOfferActions}>
        <Link className="spn-cta" href={POST_RESULT_BILLING_HREF} onClick={() => track('cta_clicked', { cta: 'render_result_essence', plan: plan.id, render_id: renderId, flow_version: POST_RESULT_VERSION, kind })}>Continuar com o Essence →</Link>
        <button type="button" className="spn-ghost" onClick={dismiss}>Continuar sem assinar</button>
      </div>
      {estimate !== null && <p className={styles.planOfferEstimate}>
        Estimativa de {estimate} {kind === 'edit' ? 'ajustes deste tipo' : 'imagens na configuração atual'}. O consumo varia conforme a operação, o motor e a resolução.
      </p>}
      <p>{NODES_ROLLOVER_COPY}</p>
      <p className={styles.caption}>Assinatura mensal. Cancele quando quiser. Você confere o plano antes de abrir o pagamento.</p>
    </section>
  )
}
