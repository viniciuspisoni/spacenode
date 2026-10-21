'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet } from '@/components/app/glass'
import NodiAvatar from './NodiAvatar'
import { uploadPrint } from './upload-print'
import { ONBOARDING_GOALS, type OnboardingGoal } from '@/lib/onboarding'
import { PRESERVE, type ProjectType } from '@/lib/prompts'
import { ENGINES } from '@/lib/engines'
import { FIRST_IMAGE_MATERIAL_FIELDS } from '@/lib/onboarding/first-image'
import { editHandoffIntention, saveEditHandoff } from '@/lib/onboarding/edit-handoff'
import { DEFAULT_PILOT_VARIANT, type PilotAnswer, type PilotContext, type PilotTurn, type PilotVariant } from '@/lib/nodi/first-image/contract'
import { observeFirstImagePilot } from '@/lib/nodi/first-image/client'
import styles from './FirstImagePilot.module.css'

interface Message { role: 'user' | 'assistant'; text: string; answer?: PilotAnswer; helpful?: boolean }

export default function FirstImagePilot({ file, previewUrl, projectType, goal, ownerId, onClose, onReview }: {
  file: File; previewUrl: string; projectType: ProjectType; goal: OnboardingGoal | null
  ownerId: string
  onClose: () => void; onReview: (answer: PilotAnswer) => void
}) {
  const router = useRouter()
  const [variant, setVariant] = useState<PilotVariant>(DEFAULT_PILOT_VARIANT)
  const [caseId, setCaseId] = useState('')
  const [type, setType] = useState(projectType)
  const [intention, setIntention] = useState<OnboardingGoal | null>(goal)
  const [kind, setKind] = useState<'' | PilotContext['referenceKind']>('')
  const [qa, setQa] = useState(true)
  const [conversations, setConversations] = useState<Record<PilotVariant, Message[]>>({ grok: [], control: [] })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [transferring, setTransferring] = useState(false)
  const transferLock = useRef(false)
  const attachment = useRef<string | null>(null)
  const alive = useRef(true)
  const controller = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort() } }, [])
  const messages = conversations[variant]
  const started = caseId !== ''
  const locked = busy || transferring
  useEffect(() => { if (started || busy) end.current?.scrollIntoView({ block: 'nearest' }) }, [conversations, busy, started])
  async function send() {
    if (inFlight.current || transferLock.current || !kind || kind === 'render') return
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
  async function continueInEdit() {
    if (inFlight.current || transferLock.current) return
    transferLock.current = true; setTransferring(true); setError('')
    try {
      const id = await saveEditHandoff(ownerId, file, editHandoffIntention(messages, input))
      if (alive.current) router.push(`/app/editar?onboarding=1&handoff=${id}`)
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : 'Não foi possível transferir a imagem. Tente novamente.')
      transferLock.current = false
      if (alive.current) setTransferring(false)
    }
  }
  return <Sheet open title="Nodi · primeira imagem" onClose={onClose} doneLabel="Voltar à referência">
    <div className={styles.body}>
      <div className={styles.intro}><NodiAvatar size={32} state={busy ? 'thinking' : 'idle'} /><div><strong>Piloto interno · Gemini como padrão</strong><p>O Nodi prepara sua primeira imagem com Gemini. A comparação com Grok continua disponível para testes da equipe, em conversa separada.</p></div></div>
      <div className={styles.reference}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="Referência desta comparação" />
        <p>A mesma referência nas duas opções. O arquivo completo continua disponível em Renderizar.</p>
      </div>
      <fieldset disabled={locked || started} className={styles.context}><legend>Confirme sua referência</legend>
        <label>Origem da imagem<select className="spn-input" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="">Escolha uma opção</option><option value="model">Vista de um modelo 3D</option><option value="photo">Foto do espaço</option><option value="render">Render já pronto</option></select></label>
        <label>Tipo de projeto<select className="spn-input" value={type} onChange={e => setType(e.target.value as ProjectType)}><option value="interior">Interior</option><option value="exterior">Exterior</option></select></label>
        <label>Objetivo<select className="spn-input" value={intention ?? ''} onChange={e => setIntention((e.target.value || null) as OnboardingGoal | null)}><option value="">Quero ajuda para definir</option>{Object.entries(ONBOARDING_GOALS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label>
        <label className={styles.check}><input type="checkbox" checked={qa} onChange={e => setQa(e.target.checked)} />Conversa de teste técnico; excluir da medição de usuários reais</label>
      </fieldset>
      {started && <button type="button" className="spn-pill" disabled={locked} onClick={() => { setCaseId(''); setConversations({ grok: [], control: [] }); setError(''); setInput('') }}>Recomeçar comparação</button>}
      {kind !== 'render' && <div className={styles.variants} role="group" aria-label="Modelo da comparação">{(['control', 'grok'] as const).map(item => <button type="button" className="spn-pill" key={item} disabled={locked} aria-pressed={variant === item} onClick={() => {
        if (item === variant) return
        if (!input.trim() && !conversations[item].length) setInput(messages.find(m => m.role === 'user')?.text ?? '')
        setVariant(item); setError('')
      }}>{item === 'grok' ? 'Grok · comparação' : 'Gemini · padrão'}</button>)}</div>}
      <p className={styles.caption}>{kind === 'render' ? 'Sua imagem já está pronta. Leve-a direto para Editar com seu pedido, sem esperar uma análise de IA.' : 'Ao enviar, a referência e esta conversa serão analisadas pelo modelo escolhido. Use JPG, PNG ou WebP de até 8 MB. Você revisa os ajustes antes de aplicar e confere o custo antes de gerar.'}</p>
      <div className={styles.thread} aria-live="polite" aria-label={`Conversa com ${variant === 'grok' ? 'Grok' : 'Gemini'}`}>
        {messages.map((m, i) => <article key={`${variant}:${i}`} className={m.role === 'user' ? styles.user : styles.answer}>
          <strong>{m.role === 'user' ? 'Você' : `Nodi · ${m.answer?.modelLabel ?? ''}`}</strong><p>{m.text}</p>
          {m.answer?.recommendation && <>
            <dl className={styles.summary} aria-label="Configuração preparada">
              <div><dt>Objetivo</dt><dd>{ONBOARDING_GOALS[m.answer.recommendation.goal].label}</dd></div>
              <div><dt>Saída</dt><dd>{ENGINES[m.answer.recommendation.config.selectedEngine].name} · {m.answer.recommendation.config.selectedResolution.toUpperCase()}</dd></div>
              <div><dt>Luz</dt><dd>{m.answer.recommendation.config.lighting === PRESERVE ? 'Manter a luz original' : m.answer.recommendation.config.lighting}</dd></div>
              {m.answer.recommendation.materialChange && <div><dt>Material</dt><dd>{FIRST_IMAGE_MATERIAL_FIELDS[m.answer.recommendation.config.projectType].find(f => f.id === m.answer!.recommendation!.materialChange!.field)?.label}: {m.answer.recommendation.materialChange.value}</dd></div>}
              <div><dt>Custo</dt><dd><strong>{m.answer.recommendation.nodeCost} Nodes por geração</strong></dd></div>
            </dl>
            <p className={styles.caption}>A revisão permite ajustar a sugestão. Aplicar preenche os controles; gerar exige outra confirmação.</p>
            <button type="button" className="spn-cta" disabled={locked} onClick={() => onReview(m.answer!)}>Revisar configuração e custo</button>
          </>}
          {m.answer && <div className={styles.feedback}><span>Esta orientação ajudou a preparar a imagem?</span>{[true, false].map(helpful => <button type="button" className="spn-pill" key={String(helpful)} aria-pressed={m.helpful === helpful} disabled={m.helpful !== undefined} onClick={() => {
            observeFirstImagePilot(m.answer!.receipt, 'feedback', { helpful })
            setConversations(prev => ({ ...prev, [variant]: prev[variant].map((item, j) => j === i ? { ...item, helpful } : item) }))
          }}>{helpful ? 'Ajudou' : 'Ainda não'}</button>)}</div>}
        </article>)}
        {busy && <p role="status">O Nodi está preparando a análise da referência…</p>}
        <div ref={end} />
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <form onSubmit={e => { e.preventDefault(); if (kind === 'render') void continueInEdit(); else void send() }} className={styles.form}>
        <label>O que você quer alcançar com esta imagem?<textarea className="spn-input" value={input} maxLength={900} rows={3} placeholder={kind === 'render' ? 'Ex.: suavizar a luz e manter os materiais da fachada' : 'Ex.: apresentar a fachada ao cliente com uma luz de fim de tarde'} disabled={locked} onChange={e => setInput(e.target.value)} /></label>
        <button type="submit" className="spn-cta" disabled={locked || !kind || (kind !== 'render' && messages.length > 0 && !input.trim())}>{transferring ? 'Preparando imagem…' : kind === 'render' ? 'Continuar em Editar com esta imagem' : busy ? 'Analisando…' : messages.length ? 'Enviar para o Nodi' : 'Analisar referência'}</button>
      </form>
      {kind === 'render' && <div className={styles.form}>
        <p className={styles.caption}>O pedido vai preenchido. Nenhuma edição é enviada nesta etapa.</p>
      </div>}
    </div>
  </Sheet>
}
