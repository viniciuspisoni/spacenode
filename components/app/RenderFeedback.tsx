'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ResultNextSteps from './ResultNextSteps'
import type { RenderFeedbackInput, RenderFeedbackReason } from '@/lib/render-feedback'

const REASONS: { id: RenderFeedbackReason; label: string }[] = [
  { id: 'geometry', label: 'Geometria' },
  { id: 'materials', label: 'Materiais' },
  { id: 'lighting', label: 'Luz' },
  { id: 'other', label: 'Outro motivo' },
]

export function RenderFeedback({ renderId, offer, outputUrl, onNextImage }: {
  renderId: string
  offer?: { nodeCost: number }
  outputUrl?: string
  onNextImage?: () => void
}) {
  const [available, setAvailable] = useState(false)
  const [loadedRenderId, setLoadedRenderId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<RenderFeedbackInput | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetch(`/api/renders/${encodeURIComponent(renderId)}/feedback`)
      .then(async response => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<{ feedback: RenderFeedbackInput | null }>
      })
      .then(data => {
        if (!alive) return
        setFeedback(data.feedback)
        setLoadedRenderId(renderId)
        setAvailable(true)
      })
      .catch(() => { if (alive) setAvailable(false) })
    return () => { alive = false }
  }, [renderId])

  async function submit(useful: boolean, reason: RenderFeedbackReason | null = null) {
    setPending(true)
    setError('')
    try {
      const response = await fetch(`/api/renders/${encodeURIComponent(renderId)}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useful, reason }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const data = await response.json() as { feedback: RenderFeedbackInput }
      setFeedback(data.feedback)
    } catch {
      setError('Não foi possível salvar sua resposta. Tente novamente.')
    } finally {
      setPending(false)
    }
  }

  if (!available || loadedRenderId !== renderId) return null

  return (
    <section className="spn-glass" aria-label="Avaliar render" style={{ padding: 16, borderRadius: 'var(--r-inner)', marginTop: 14 }}>
      <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 560, color: 'var(--color-text-primary)' }}>
        Este render serviu para o seu projeto?
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="spn-pill" aria-pressed={feedback?.useful === true}
          disabled={pending} onClick={() => void submit(true)}>Sim</button>
        <button type="button" className="spn-pill" aria-pressed={feedback?.useful === false}
          disabled={pending} onClick={() => void submit(false)}>Ainda não</button>
      </div>
      {feedback?.useful === false && (
        <>
          <p style={{ margin: '12px 0 8px', fontSize: 11, color: 'var(--color-text-secondary)' }}>
            O que faltou? Opcional.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {REASONS.map(item => (
              <button key={item.id} type="button" className="spn-pill"
                aria-pressed={feedback.reason === item.id} disabled={pending}
                onClick={() => void submit(false, item.id)}>{item.label}</button>
            ))}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            {feedback.reason === 'geometry'
              ? 'Compare com a referência: confira enquadramento, proporções e aberturas antes de tentar outra geração.'
              : feedback.reason === 'materials'
                ? 'Uma amostra do material pode ajudar. No Editar, peça uma mudança específica e confira o restante da imagem.'
                : feedback.reason === 'lighting'
                  ? 'Experimente um ajuste de luz no Editar e compare com a intenção do projeto.'
                  : 'Escolha o que precisa melhorar e faça um ajuste por vez. Você pode continuar no Editar.'}
          </p>
          {outputUrl && feedback.reason !== 'geometry' && <Link className="spn-ghost" style={{ marginTop: 10, display: 'inline-flex' }}
            href={`/app/editar?source=${encodeURIComponent(outputUrl)}&onboarding=1`}>Ajustar esta imagem →</Link>}
        </>
      )}
      {feedback && <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        {feedback.useful ? 'Resultado útil confirmado. Agora você pode baixar ou continuar seu projeto.' : 'Resposta salva. Vamos ajudar você a chegar a um resultado útil.'}
      </p>}
      {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--color-error)' }}>{error}</p>}
      {feedback?.useful === true && (outputUrl || offer || onNextImage) &&
        <ResultNextSteps key={renderId} renderId={renderId} outputUrl={outputUrl} offer={offer} onNextImage={onNextImage} />}
    </section>
  )
}
