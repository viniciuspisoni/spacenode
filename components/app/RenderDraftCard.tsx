'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { readRenderDraft, type RenderDraft } from '@/lib/onboarding/render-draft'
import { track } from '@/lib/analytics/client'
import styles from './Onboarding.module.css'

export function RenderDraftCard({ draft, onResume, onDiscard }: {
  draft: RenderDraft
  onResume?: () => void
  onDiscard?: () => void
}) {
  const [preview, setPreview] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(draft.image)
    const raf = requestAnimationFrame(() => setPreview(url))
    return () => { cancelAnimationFrame(raf); URL.revokeObjectURL(url) }
  }, [draft.image])
  return <section className={`${styles.draftCard} spn-glass`} aria-label="Retomar rascunho">
    {/* Local Blob URL: the browser reads this preview without sending it to an image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {preview && <img src={preview} alt="Referência do seu rascunho" className={styles.draftPreview} />}
    <div className={styles.draftContent}>
      <strong>Seu projeto está esperando por você.</strong>
      <p>{draft.filename} · imagem e configuração guardadas.</p>
      <small>Salvo nesta conta e neste navegador por até 7 dias. Não usa Nodes.</small>
      <div className={styles.tipActions}>
        {onResume ? <button type="button" className="spn-pill" onClick={onResume}>Retomar rascunho →</button>
          : <Link className="spn-pill" href="/app/generate?resume=1#guia" onClick={() => track('cta_clicked', { cta: 'onboarding_draft_dashboard' })}>Continuar meu projeto →</Link>}
        {onDiscard && <button type="button" className={styles.mutedButton} onClick={onDiscard}>Descartar rascunho</button>}
      </div>
    </div>
  </section>
}

export default function DashboardRenderDraft({ userId }: { userId: string }) {
  const [draft, setDraft] = useState<RenderDraft | null>(null)
  useEffect(() => {
    let alive = true
    const refresh = () => { void readRenderDraft(userId).then(value => { if (alive) setDraft(value) }).catch(() => {}) }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { alive = false; window.removeEventListener('focus', refresh) }
  }, [userId])
  return draft ? <RenderDraftCard draft={draft} /> : null
}
