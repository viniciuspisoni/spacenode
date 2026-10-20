'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Sheet } from '@/components/app/glass'
import NodiAvatar from './NodiAvatar'
import { uploadPrint } from './upload-print'
import { ONBOARDING_GOALS, type OnboardingGoal } from '@/lib/onboarding'
import type { ProjectType } from '@/lib/prompts'
import type { PilotAnswer, PilotContext, PilotTurn, PilotVariant } from '@/lib/nodi/first-image/contract'
import { observeFirstImagePilot } from '@/lib/nodi/first-image/client'
import styles from './FirstImagePilot.module.css'

interface Message { role: 'user' | 'assistant'; text: string; answer?: PilotAnswer; helpful?: boolean }

export default function FirstImagePilot({ file, previewUrl, projectType, goal, onClose, onReview }: {
  file: File; previewUrl: string; projectType: ProjectType; goal: OnboardingGoal | null
  onClose: () => void; onReview: (answer: PilotAnswer) => void
}) {
  const [variant, setVariant] = useState<PilotVariant>('grok')
  const [caseId, setCaseId] = useState('')
  const [type, setType] = useState(projectType)
  const [intention, setIntention] = useState<OnboardingGoal | null>(goal)
  const [kind, setKind] = useState<'' | PilotContext['referenceKind']>('')
  const [qa, setQa] = useState(true)
  const [conversations, setConversations] = useState<Record<PilotVariant, Message[]>>({ grok: [], control: [] })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attachment = useRef<string | null>(null)
  const alive = useRef(true)
  const controller = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort() } }, [])
  const messages = conversations[variant]
  const started = caseId !== ''
  useEffect(() => { if (started || busy) end.current?.scrollIntoView({ block: 'nearest' }) }, [conversations, busy, started])
  async function send() {
    if (inFlight.current || !kind) return
    const message = input.trim() || (messages.length ? '' : 'Quero preparar esta referência para minha primeira imagem. Me ajude a escolher os ajustes.')
    if (!message) return
    inFlight.current = true; setBusy(true); setError('')
    const id = caseId || crypto.randomUUID()
    setCaseId(id)
    const abort = new AbortController(); controller.current = abort
    try {
      if (!attachment.current) {
        const uploaded = await uploadPrint(file)
        if (!alive.current) return
        attachment.current = uploaded.id
      }
      const history: PilotTurn[] = messages.slice(-8).map(m => ({ role: m.role, text: m.text }))
      const res = await fetch('/api/nodi/first-image', { method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        variant, caseId: id, message, attachmentId: attachment.current, history,
        context: { projectType: type, goal: intention, referenceKind: kind, qa },
      }) })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.answer) throw new Error(body?.error || 'Não foi possível concluir esta orientação agora.')
      if (!alive.current || abort.signal.aborted) return
      const answer = body.answer as PilotAnswer
      setConversations(prev => ({ ...prev, [variant]: [...prev[variant], { role: 'user', text: message }, { role: 'assistant', text: answer.text, answer }] }))
      setInput('')
    } catch (err) {
      if (alive.current && !abort.signal.aborted) setError(err instanceof Error ? err.message : 'Não foi possível concluir esta orientação agora.')
    } finally {
      inFlight.current = false
      if (alive.current) setBusy(false)
    }
  }
  return <Sheet open title="Nodi · primeira imagem" onClose={onClose} doneLabel="Voltar à referência">
    <div className={styles.body}>
      <div className={styles.intro}><NodiAvatar size={32} state={busy ? 'thinking' : 'idle'} /><div><strong>Piloto interno</strong><p>Compare a preparação com Grok e com Gemini, o modelo base do Nodi atual. Cada opção tem sua própria conversa.</p></div></div>
      <div className={styles.reference}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="Referência desta comparação" />
        <p>A mesma referência nas duas opções. O arquivo completo continua disponível em Renderizar.</p>
      </div>
      <fieldset disabled={busy || started} className={styles.context}><legend>Confirme sua referência</legend>
        <label>Origem da imagem<select className="spn-input" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="">Escolha uma opção</option><option value="model">Vista de um modelo 3D</option><option value="photo">Foto do espaço</option><option value="render">Render já pronto</option></select></label>
        <label>Tipo de projeto<select className="spn-input" value={type} onChange={e => setType(e.target.value as ProjectType)}><option value="interior">Interior</option><option value="exterior">Exterior</option></select></label>
        <label>Objetivo<select className="spn-input" value={intention ?? ''} onChange={e => setIntention((e.target.value || null) as OnboardingGoal | null)}><option value="">Quero ajuda para definir</option>{Object.entries(ONBOARDING_GOALS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label>
        <label className={styles.check}><input type="checkbox" checked={qa} onChange={e => setQa(e.target.checked)} />Conversa de teste técnico; excluir da medição de usuários reais</label>
      </fieldset>
      {started && <button type="button" className="spn-pill" disabled={busy} onClick={() => { setCaseId(''); setConversations({ grok: [], control: [] }); setError(''); setInput('') }}>Recomeçar comparação</button>}
      <div className={styles.variants} role="group" aria-label="Modelo da comparação">{(['grok', 'control'] as const).map(item => <button type="button" className="spn-pill" key={item} disabled={busy} aria-pressed={variant === item} onClick={() => {
        if (item === variant) return
        if (!input.trim() && !conversations[item].length) setInput(messages.find(m => m.role === 'user')?.text ?? '')
        setVariant(item); setError('')
      }}>{item === 'grok' ? 'Grok' : 'Gemini · comparação'}</button>)}</div>
      <p className={styles.caption}>Ao enviar, a referência e esta conversa serão analisadas pelo modelo escolhido. Use JPG, PNG ou WebP de até 8 MB. Você revisa os ajustes antes de aplicar e confere o custo antes de gerar.</p>
      <div className={styles.thread} aria-live="polite" aria-label={`Conversa com ${variant === 'grok' ? 'Grok' : 'Gemini'}`}>
        {messages.map((m, i) => <article key={`${variant}:${i}`} className={m.role === 'user' ? styles.user : styles.answer}>
          <strong>{m.role === 'user' ? 'Você' : `Nodi · ${m.answer?.modelLabel ?? ''}`}</strong><p>{m.text}</p>
          {m.answer?.recommendation && <button type="button" className="spn-cta" disabled={busy} onClick={() => onReview(m.answer!)}>Revisar configuração e custo</button>}
          {m.answer && <div className={styles.feedback}><span>Esta orientação ajudou a preparar a imagem?</span>{[true, false].map(helpful => <button type="button" className="spn-pill" key={String(helpful)} aria-pressed={m.helpful === helpful} disabled={m.helpful !== undefined} onClick={() => {
            observeFirstImagePilot(m.answer!.receipt, 'feedback', { helpful })
            setConversations(prev => ({ ...prev, [variant]: prev[variant].map((item, j) => j === i ? { ...item, helpful } : item) }))
          }}>{helpful ? 'Ajudou' : 'Ainda não'}</button>)}</div>}
        </article>)}
        {busy && <p role="status">O Nodi está preparando a análise da referência…</p>}
        <div ref={end} />
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <form onSubmit={e => { e.preventDefault(); void send() }} className={styles.form}>
        <label>O que você quer alcançar com esta imagem?<textarea className="spn-input" value={input} maxLength={900} rows={3} placeholder="Ex.: apresentar a fachada ao cliente com uma luz de fim de tarde" disabled={busy} onChange={e => setInput(e.target.value)} /></label>
        <button type="submit" className="spn-cta" disabled={busy || !kind || (messages.length > 0 && !input.trim())}>{busy ? 'Analisando…' : messages.length ? 'Enviar para o Nodi' : 'Analisar referência'}</button>
      </form>
      {kind === 'render' && <p>Para trabalhar sobre um render pronto, o Nodi vai orientar o caminho Editar. <Link href="/app/editar?onboarding=1">Abrir Editar →</Link></p>}
    </div>
  </Sheet>
}
