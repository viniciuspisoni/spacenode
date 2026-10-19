'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { RenderFeedbackInput, RenderFeedbackReason } from '@/lib/render-feedback'
import { recoveryHref, type RenderRecovery } from '@/lib/onboarding/render-recovery'
import ResultNextSteps from './ResultNextSteps'
import styles from './RenderRecovery.module.css'

const REASONS: { id: RenderFeedbackReason; label: string }[] = [{ id: 'lighting', label: 'Luz' }, { id: 'materials', label: 'Materiais' }, { id: 'geometry', label: 'Geometria' }, { id: 'other', label: 'Outro motivo' }]
export default function RecoveryResultFeedback({ recovery, jobId, outputUrl, nodes, showPlanOffer = false, onAdjust }: {
  recovery: RenderRecovery; jobId: string | null; outputUrl: string; nodes: number
  showPlanOffer?: boolean; onAdjust: () => void
}) {
  const [feedback, setFeedback] = useState<RenderFeedbackInput | null>(null)
  const [pending, setPending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const url = jobId ? `/api/renders/${encodeURIComponent(recovery.renderId)}/recovery/${encodeURIComponent(jobId)}/feedback` : null
  useEffect(() => {
    if (!url) return
    const abort = new AbortController()
    fetch(url, { signal: abort.signal }).then(async res => {
      if (!res.ok) return
      const data = await res.json()
      if (!abort.signal.aborted) setFeedback(data.feedback)
    }).catch(() => {}).finally(() => { if (!abort.signal.aborted) setLoaded(true) })
    return () => abort.abort()
  }, [url])
  const submit = async (useful: boolean, reason: RenderFeedbackReason | null = null) => {
    if (!url || pending) return
    setPending(true); setError('')
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useful, reason }) })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setFeedback(data.feedback)
    } catch { setError('Não foi possível salvar sua resposta. Tente novamente.') }
    finally { setPending(false) }
  }
  return <section tabIndex={-1} className={`spn-glass ${styles.feedback}`} aria-label="Avaliar resultado do ajuste">
    <p>Compare o ajuste com a imagem anterior e confira o restante do projeto.</p>
    {url ? <>
      <strong style={{ fontSize: 12 }}>Este render serviu para o seu projeto?</strong>
      <div className={styles.actions}>
        <button type="button" className="spn-pill" aria-pressed={feedback?.useful === true} disabled={pending || !loaded} onClick={() => void submit(true)}>Sim</button>
        <button type="button" className="spn-pill" aria-pressed={feedback?.useful === false} disabled={pending || !loaded} onClick={() => void submit(false)}>Ainda não</button>
      </div>
      {feedback?.useful === false && <>
        <p>O que faltou? Opcional.</p>
        <div className={styles.actions}>{REASONS.map(item => <button type="button" className="spn-pill" key={item.id} aria-pressed={feedback.reason === item.id} disabled={pending} onClick={() => void submit(false, item.id)}>{item.label}</button>)}</div>
        <p>Resposta salva. Revise uma mudança por vez antes de uma nova edição.</p>
        {feedback.reason === 'geometry'
          ? <Link className="spn-ghost" href={recoveryHref(recovery.renderId, 'geometry')}>Conferir com a referência →</Link>
          : <button type="button" className="spn-ghost" onClick={onAdjust}>Revisar pedido</button>}
      </>}
      {feedback?.useful === true && <>
        <p role="status">Resultado útil confirmado após o ajuste.</p>
        <ResultNextSteps renderId={recovery.renderId} editJobId={jobId!} outputUrl={outputUrl} offer={showPlanOffer ? { nodeCost: nodes } : undefined} />
        <Link className="spn-ghost" href="/app/generate#guia">Preparar outra imagem →</Link>
      </>}
    </> : <p>A edição está pronta, mas a avaliação está indisponível para este resultado.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
