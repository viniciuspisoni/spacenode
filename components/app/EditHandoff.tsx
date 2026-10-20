'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { readEditHandoff } from '@/lib/onboarding/edit-handoff'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import { createClient } from '@/lib/supabase/client'
import type { FinalizeProjectSummary } from '@/lib/finalizar/types'
import styles from './EditHandoff.module.css'

type Ready = { url: string; intention: string }
const FinalizeEditor = dynamic(() => import('@/components/finalizar/FinalizeEditor').then(m => m.FinalizeEditor))
const EditV3Flow = dynamic(() => import('@/components/edit-v3/EditV3Flow').then(m => m.EditV3Flow))

/** Upload the account-bound original once per mount, including React's effect replay. Never submit an edit. */
export default function EditHandoff({ ownerId, handoffId, editor, initialBalance, nodesPerEdit, aiEnabled, savedProjects = [], showPlanOffer }: {
  ownerId: string; handoffId: string; editor: 'v4' | 'v3'; initialBalance: number
  nodesPerEdit: number; aiEnabled: boolean; savedProjects?: FinalizeProjectSummary[]; showPlanOffer: boolean
}) {
  const router = useRouter()
  const [ready, setReady] = useState<Ready | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const pending = useRef<Promise<Ready> | null>(null)

  useEffect(() => {
    let active = true
    const work = pending.current ?? (pending.current = (async () => {
      const handoff = await readEditHandoff(ownerId, handoffId)
      if (!handoff) throw new Error('Esta transferência expirou ou pertence a outra conta. Volte à referência e use “Continuar em Editar” novamente.')
      const { data: { user } } = await createClient().auth.getUser()
      if (user?.id !== ownerId) throw new Error('Sua conta mudou. Volte à referência para continuar com a conta atual.')
      const { url } = await uploadDirect(handoff.image, 'retocar-asset', { kind: 'source' })
      if (!url) throw new Error('Não foi possível abrir a imagem em Editar. Tente novamente.')
      return { url, intention: handoff.intention }
    })())
    void work.then(value => { if (active) setReady(value) }, err => {
      if (active) setError(err instanceof Error ? err.message : 'Não foi possível abrir a imagem. Tente novamente.')
    })
    return () => { active = false }
  }, [ownerId, handoffId, attempt])

  if (!ready) return <section className={styles.status} aria-live="polite">
    <h1>Editar</h1>
    {error ? <>
      <p role="alert">{error}</p>
      <button type="button" className="spn-cta" onClick={() => { pending.current = null; setError(''); setAttempt(n => n + 1) }}>Tentar novamente</button>
      <button type="button" className="spn-pill" onClick={() => router.back()}>Voltar à referência</button>
      <Link href="/app/editar?onboarding=1">Abrir Editar sem transferência</Link>
    </> : <><p>Levando sua imagem e seu pedido para Editar…</p><p>Você não precisa selecionar o arquivo novamente.</p></>}
  </section>

  return <div className={styles.layout}>
    <section className={styles.received} aria-label="Pedido trazido do Nodi">
      <strong>Seu pedido veio com a imagem</strong>
      <p>{ready.intention || 'Sua imagem está pronta para começar. Descreva a mudança desejada no painel.'}</p>
      <small>{editor === 'v4' && !aiEnabled
        ? 'A edição por IA está indisponível neste ambiente. Seu pedido foi preservado; os ajustes de luz e cor continuam disponíveis.'
        : 'Confira o pedido no painel. Você revisa o custo antes de confirmar a edição.'}</small>
    </section>
    <div className={styles.editor}>
      {editor === 'v4' ? <FinalizeEditor initialSourceUrl={ready.url} initialInstruction={ready.intention}
        reviewBeforeEdit editorTitle="Editar" savedProjects={savedProjects} initialBalance={initialBalance}
        nodesPerEdit={nodesPerEdit} aiEnabled={aiEnabled} showPlanOffer={showPlanOffer} />
        : <EditV3Flow initialSourceUrl={ready.url} initialInstruction={ready.intention} reviewBeforeEdit initialBalance={initialBalance} showPlanOffer={showPlanOffer} />}
    </div>
  </div>
}
