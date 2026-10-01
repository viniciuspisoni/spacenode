'use client'

import { useEffect, useState } from 'react'
import type { RenderFeedbackInput, RenderFeedbackReason } from '@/lib/render-feedback'

const REASONS: { id: RenderFeedbackReason; label: string }[] = [
  { id: 'geometry', label: 'Geometria' },
  { id: 'materials', label: 'Materiais' },
  { id: 'lighting', label: 'Luz' },
  { id: 'other', label: 'Outro motivo' },
]

export function RenderFeedback({ renderId }: { renderId: string }) {
  const [available, setAvailable] = useState(false)
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

  if (!available) return null

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
        </>
      )}
      {feedback && <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Obrigado. Sua resposta ajuda a melhorar os renders.
      </p>}
      {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--color-error)' }}>{error}</p>}
    </section>
  )
}
