'use client'

// ── Painel do Nodi ────────────────────────────────────────────────────────────
//
// A conversa inteira vive aqui: home (saudação contextual + sugestões + FAQ +
// suporte), chat (perguntas → /api/nodi/ask) e o fluxo guiado "Estou com um
// problema" (categoria → geração → diagnóstico → descrição → revisão →
// chamado). Nada é enviado ao suporte sem o usuário revisar e confirmar.
//
// Estado é local (useState) + persistência da conversa em sessionStorage —
// "histórico da sessão" no sentido literal: sobrevive à navegação, morre com
// a aba. Estilos na seção "Nodi" do globals.css (tokens dos dois temas).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supportWhatsAppUrl } from '@/lib/support'
import { statusDisplayLabel } from '@/lib/history/generation-detail'
import { TICKET_CATEGORY_LABEL, TICKET_PRIORITY_LABEL, TICKET_STATUS_LABEL } from '@/lib/nodi/tickets'
import type {
  DiagnosisReport,
  GenerationSummary,
  NodiAction,
  NodiConfidence,
  NodiContext,
  NodiTurn,
  TicketCategory,
  TicketDraft,
  TicketRecord,
} from '@/lib/nodi/types'
import type {
  AnalysisReport, ConfigRecommendation, GenerationPlan, MemoryProposal,
  NodiAttachment, NodiV2Answer, PromptSuggestion, SupervisedAction,
} from '@/lib/nodi/v2/types'
import NodiAvatar, { type NodiAvatarState } from './NodiAvatar'
import {
  askNodi,
  chatV2,
  executeIntent,
  fetchBootstrap,
  fetchMyTickets,
  fetchRecentGenerations,
  runDiagnosis,
  saveProjectMemoryV2,
  sendNodiEvent,
  submitTicket,
  type NodiBootstrap,
} from './nodi-client'
import { actionDestination, writeHandoff, moduleHref } from './actions-bus'

// ── Modelo de mensagem ────────────────────────────────────────────────────────

type MsgKind =
  | 'text'        // fala comum (user ou nodi)
  | 'v2'          // resposta do copiloto (texto + artefatos em cards)
  | 'options'     // chips de categoria do fluxo de problema
  | 'generations' // seletor de geração recente
  | 'diagnosis'   // cartão de diagnóstico
  | 'describe'    // formulário de descrição do chamado
  | 'review'      // resumo do chamado pra confirmação
  | 'sent'        // chamado registrado
  | 'executed'    // resultado de execução V3 (imagem gerada pelo chat)
  | 'notice'      // aviso (erro, sucesso, indisponibilidade)

interface PanelMsg {
  id: string
  role: 'user' | 'nodi'
  kind: MsgKind
  text?: string
  confidence?: NodiConfidence
  actions?: NodiAction[]
  options?: { id: TicketCategory; label: string }[]
  generations?: GenerationSummary[]
  /** generations: 'diagnose' (fluxo de problema) ou 'attach' (anexar imagem V2) */
  purpose?: 'diagnose' | 'attach'
  report?: DiagnosisReport
  draft?: TicketDraft
  ticket?: TicketRecord
  summary?: string
  tone?: 'error' | 'success' | 'warning'
  /** envelope do copiloto (kind 'v2') */
  v2?: NodiV2Answer
  /** kind 'executed': imagem gerada (URL assinada — expira; Histórico é o acervo) */
  outputUrl?: string
  /** feedback já dado nesta resposta */
  feedback?: 'up' | 'down'
  /** bloco interativo já consumido → chips desabilitados */
  done?: boolean
}

type PanelView = 'home' | 'chat' | 'tickets'
type Pending = null | 'ask' | 'list' | 'diagnose' | 'ticket' | 'execute'

/** "sim", "pode", "confirma"… digitados executam a proposta pendente (V3). */
const CONFIRM_RE = /^(sim|pode|confirma|confirmar|confirmo|manda|vai|faz|executa|bora|ok)\b/i

const WELCOME_TEXT =
  'Olá, sou o Nodi. Posso ajudar você a usar a SpaceNode ou entender o que aconteceu com uma geração.'
const LOW_CONFIDENCE_TEXT =
  'Não consegui confirmar a causa com segurança. Posso reunir os dados da geração e encaminhar tudo para o suporte.'
const REVIEW_INTRO = 'Revise as informações abaixo antes de encaminhá-las para a equipe.'
const UNAVAILABLE_TEXT =
  'O assistente está indisponível no momento. Você ainda pode falar com o suporte.'

const CATEGORY_OPTIONS: { id: TicketCategory; label: string }[] = [
  { id: 'generation_failed', label: 'Uma geração falhou' },
  { id: 'unexpected_result', label: 'O resultado veio diferente do esperado' },
  { id: 'billing',           label: 'Nodes ou cobrança' },
  { id: 'access',            label: 'Conta ou acesso' },
  { id: 'other',             label: 'Outro assunto' },
]

const STORAGE_KEY = 'spn:nodi:session:v1'

let msgSeq = 0
const newId = () => `m${Date.now().toString(36)}${(msgSeq++).toString(36)}`

/** Conversa da sessão (sessionStorage). Blocos interativos antigos voltam
 *  desativados — uma ação velha não pode disparar de novo num remount. */
function readSession(): { view: PanelView; messages: PanelMsg[] } {
  const empty = { view: 'home' as PanelView, messages: [] as PanelMsg[] }
  if (typeof window === 'undefined') return empty
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const saved = JSON.parse(raw) as { view?: PanelView; messages?: PanelMsg[] }
    if (!Array.isArray(saved.messages) || saved.messages.length === 0) return empty
    return {
      view: saved.view === 'chat' ? 'chat' : 'home',
      messages: saved.messages.map(m => (m.kind === 'text' || m.kind === 'sent' ? m : { ...m, done: true })),
    }
  } catch {
    return empty
  }
}

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ── Ícones (traço 1.3, herdam currentColor — convenção da sidebar) ───────────

const Icon = {
  close: (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  minimize: (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 8.5l4 3 4-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  back: (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  clear: (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 4h9M5.5 4V2.8h3V4M4 4l.5 7.2h5L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  send: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 7h9M8 3.5L11.5 7 8 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

// ── Painel ────────────────────────────────────────────────────────────────────

export default function NodiPanel({ context, onClose }: { context: NodiContext; onClose: () => void }) {
  const router = useRouter()
  const [view, setView] = useState<PanelView>(() => readSession().view)
  const [messages, setMessages] = useState<PanelMsg[]>(() => readSession().messages)
  const [pending, setPending] = useState<Pending>(null)
  const [input, setInput] = useState('')
  const [bootstrap, setBootstrap] = useState<NodiBootstrap | null>(null)
  const [offline, setOffline] = useState(false)
  const [tickets, setTickets] = useState<TicketRecord[] | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [avatarFlash, setAvatarFlash] = useState<'success' | null>(null)
  // V2: imagem anexada à próxima pergunta (geração escolhida ou vista da rota)
  const [attachment, setAttachment] = useState<NodiAttachment | null>(null)

  const bodyRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  // dados do fluxo de problema em andamento (não renderiza — não precisa de state)
  const flowRef = useRef<{ category: TicketCategory | null; report: DiagnosisReport | null }>({
    category: null,
    report: null,
  })

  // ── Sessão: persiste a conversa (restauração é lazy, no useState) ──────────
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ view: view === 'tickets' ? 'home' : view, messages: messages.slice(-40) }))
    } catch {}
  }, [messages, view])

  // ── Bootstrap (sugestões/FAQ do módulo atual) + telemetria de abertura ─────
  useEffect(() => {
    let alive = true
    void fetchBootstrap(context.route).then(res => {
      if (!alive) return
      if (res.ok) {
        setBootstrap(res.data)
        setOffline(false)
      } else if (res.offline) {
        setOffline(true)
      }
    })
    sendNodiEvent('panel_open', context.route, context.moduleId)
    return () => { alive = false }
    // reabertura em outra rota refaz o bootstrap
  }, [context.route, context.moduleId])

  // rolagem acompanha a conversa; foco começa no campo de pergunta
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [messages, pending, view])

  useEffect(() => {
    inputRef.current?.focus()
  }, [view])

  const append = useCallback((...msgs: PanelMsg[]) => {
    setMessages(prev => [...prev, ...msgs])
  }, [])

  /** Desativa um bloco interativo (chips consumidos). */
  const markDone = useCallback((id: string) => {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, done: true } : m)))
  }, [])

  const historyTurns = useCallback((): NodiTurn[] => {
    return messages
      .filter(m => (m.kind === 'text' || m.kind === 'v2') && m.text)
      .slice(-8)
      .map(m => ({ role: m.role === 'user' ? 'user' as const : 'nodi' as const, text: m.text!, at: 0 }))
  }, [messages])

  const caps = bootstrap?.capabilities

  // ── Perguntas ───────────────────────────────────────────────────────────────

  const ask = useCallback(async (question: string | null, kbId?: string, kbTitle?: string) => {
    if (pending) return
    setView('chat')
    const shown = question ?? kbTitle ?? ''
    if (shown) append({ id: newId(), role: 'user', kind: 'text', text: shown })
    setPending('ask')
    const res = await askNodi({
      question: question ?? undefined,
      kbId,
      route: context.route,
      history: historyTurns(),
    })
    setPending(null)
    if (!res.ok) {
      setOffline(!!res.offline)
      append({
        id: newId(), role: 'nodi', kind: 'notice', tone: res.offline ? 'warning' : 'error',
        text: res.offline ? UNAVAILABLE_TEXT : res.error,
        actions: [{ type: 'whatsapp', label: 'Falar com o suporte no WhatsApp', href: supportWhatsAppUrl() }],
      })
      return
    }
    setOffline(false)
    const a = res.data.answer
    append({
      id: newId(), role: 'nodi', kind: 'text', text: a.text,
      confidence: a.confidence, actions: a.actions,
    })
  }, [pending, context.route, historyTurns, append])

  // ── V2 (copiloto): pergunta livre com contexto + anexo → envelope com cards
  const sendV2 = useCallback(async (message: string) => {
    if (pending) return
    setView('chat')
    append({ id: newId(), role: 'user', kind: 'text', text: message })
    const att = attachment
    setAttachment(null) // anexo é consumido por pergunta — sem custo de visão surpresa
    setPending('ask')
    const res = await chatV2({ message, route: context.route, history: historyTurns(), attachment: att })
    setPending(null)
    if (!res.ok) {
      setOffline(!!res.offline)
      append({
        id: newId(), role: 'nodi', kind: 'notice', tone: res.offline ? 'warning' : 'error',
        text: res.offline ? UNAVAILABLE_TEXT : res.error,
        actions: [{ type: 'whatsapp', label: 'Falar com o suporte no WhatsApp', href: supportWhatsAppUrl() }],
      })
      return
    }
    setOffline(false)
    const answer = res.data.answer
    append({ id: newId(), role: 'nodi', kind: 'v2', text: answer.text, v2: answer })
    // chamado preparado pelo copiloto entra direto no fluxo de revisão da V1
    if (answer.ticketDraft) {
      append(
        { id: newId(), role: 'nodi', kind: 'text', text: REVIEW_INTRO },
        { id: newId(), role: 'nodi', kind: 'review', draft: answer.ticketDraft },
      )
    }
  }, [pending, attachment, context.route, historyTurns, append])

  /** V3: executa uma proposta com intent assinada (após confirmação). */
  const runExecutable = useCallback(async (msgId: string, action: SupervisedAction) => {
    if (pending || !action.intentToken) return
    markDone(msgId)
    sendNodiEvent('v2_action_confirmed', context.route, context.moduleId, { type: 'execute' })
    append({ id: newId(), role: 'nodi', kind: 'text', text: 'Gerando — isso leva de segundos a ~2 minutos. Deixo o resultado aqui.' })
    setPending('execute')
    const res = await executeIntent(action.intentToken)
    setPending(null)
    if (!res.ok) {
      append({ id: newId(), role: 'nodi', kind: 'notice', tone: res.offline ? 'warning' : 'error', text: res.error })
      return
    }
    setAvatarFlash('success')
    window.setTimeout(() => setAvatarFlash(null), 2600)
    append({
      id: newId(), role: 'nodi', kind: 'executed',
      text: `Pronto — ${res.data.cost} nodes debitados. Está no Histórico também. Quer refinar algo, ampliar ou animar?`,
      outputUrl: res.data.outputUrl,
      actions: [{ type: 'navigate', label: 'Abrir no Histórico', href: '/app/history' }],
    })
  }, [pending, markDone, context.route, context.moduleId, append])

  /** Ação supervisionada CONFIRMADA pelo usuário no card. */
  const confirmProposal = useCallback((msgId: string, action: SupervisedAction) => {
    if (action.executable && action.intentToken) {
      void runExecutable(msgId, action)
      return
    }
    markDone(msgId)
    sendNodiEvent('v2_action_confirmed', context.route, context.moduleId, { type: action.type })
    if (action.type !== 'navigate') writeHandoff(action)
    const destination = actionDestination(action)
    if (destination) {
      router.push(destination)
      onClose()
      return
    }
    append({ id: newId(), role: 'nodi', kind: 'notice', tone: 'warning', text: 'Não encontrei a rota dessa ação — nada foi executado.' })
  }, [runExecutable, markDone, context.route, context.moduleId, router, onClose, append])

  /** Usar um prompt sugerido no módulo alvo (o clique é a confirmação). */
  const usePrompt = useCallback((suggestion: PromptSuggestion) => {
    const moduleId = suggestion.moduleId ?? 'renderizar'
    sendNodiEvent('v2_action_confirmed', context.route, context.moduleId, { type: 'fill_prompt' })
    writeHandoff({ id: 'p', type: 'fill_prompt', label: 'usar prompt', moduleId, prompt: suggestion.prompt })
    const href = moduleHref(moduleId)
    if (href) {
      router.push(href)
      onClose()
    }
  }, [context.route, context.moduleId, router, onClose])

  /** Memória de projeto: gravação só aqui, após confirmação. */
  const confirmMemory = useCallback(async (msgId: string, proposal: MemoryProposal) => {
    markDone(msgId)
    const res = await saveProjectMemoryV2(proposal.spaceId, proposal.patch)
    if (res.ok) {
      setAvatarFlash('success')
      window.setTimeout(() => setAvatarFlash(null), 2600)
      append({ id: newId(), role: 'nodi', kind: 'notice', tone: 'success', text: 'Memória do projeto atualizada. Vou considerar isso nas próximas gerações deste projeto.' })
    } else {
      append({ id: newId(), role: 'nodi', kind: 'notice', tone: res.status === 503 ? 'warning' : 'error', text: res.error })
    }
  }, [markDone, append])

  /** Feedback da resposta (sem texto — só útil/não ajudou). */
  const giveFeedback = useCallback((msgId: string, helpful: boolean) => {
    sendNodiEvent('answer_feedback', context.route, context.moduleId, { helpful: helpful ? 1 : 0 })
    setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, feedback: helpful ? 'up' : 'down' } : m)))
  }, [context.route, context.moduleId])

  /** Anexar imagem: escolhe uma geração recente como contexto visual. */
  const openAttachPicker = useCallback(async () => {
    if (pending) return
    setView('chat')
    setPending('list')
    const res = await fetchRecentGenerations()
    setPending(null)
    if (!res.ok || res.data.generations.length === 0) {
      append({ id: newId(), role: 'nodi', kind: 'notice', tone: 'warning', text: 'Não encontrei gerações recentes para anexar.' })
      return
    }
    append(
      { id: newId(), role: 'nodi', kind: 'text', text: 'Qual imagem devo usar como contexto?' },
      { id: newId(), role: 'nodi', kind: 'generations', purpose: 'attach', generations: res.data.generations },
    )
  }, [pending, append])

  const pickAttachment = useCallback((msgId: string, g: GenerationSummary) => {
    markDone(msgId)
    setAttachment({ kind: g.kind, id: g.id })
    append({ id: newId(), role: 'nodi', kind: 'text', text: `Certo — vou olhar a imagem de ${g.tool} (${formatWhen(g.createdAt) ?? 'recente'}). Me diga o que você quer saber dela.` })
    inputRef.current?.focus()
  }, [markDone, append])

  // ── Fluxo "Estou com um problema" ───────────────────────────────────────────

  const startProblemFlow = useCallback(() => {
    if (pending) return
    setView('chat')
    flowRef.current = { category: null, report: null }
    sendNodiEvent('problem_flow_started', context.route, context.moduleId)
    append(
      { id: newId(), role: 'user', kind: 'text', text: 'Estou com um problema' },
      { id: newId(), role: 'nodi', kind: 'text', text: 'Vamos resolver. O que aconteceu?' },
      { id: newId(), role: 'nodi', kind: 'options', options: CATEGORY_OPTIONS },
    )
  }, [pending, context.route, context.moduleId, append])

  const pickCategory = useCallback(async (msgId: string, category: TicketCategory) => {
    if (pending) return
    markDone(msgId)
    flowRef.current.category = category
    const label = CATEGORY_OPTIONS.find(o => o.id === category)?.label ?? category
    append({ id: newId(), role: 'user', kind: 'text', text: label })

    if (category === 'generation_failed' || category === 'unexpected_result') {
      setPending('list')
      const res = await fetchRecentGenerations()
      setPending(null)
      if (res.ok && res.data.generations.length > 0) {
        append(
          { id: newId(), role: 'nodi', kind: 'text', text: 'Essa geração não saiu como esperado. Posso analisar as informações disponíveis e tentar identificar a causa. Qual delas é?' },
          { id: newId(), role: 'nodi', kind: 'generations', generations: res.data.generations },
        )
        return
      }
      append(
        { id: newId(), role: 'nodi', kind: 'text', text: res.ok
          ? 'Não encontrei gerações recentes na sua conta. Me descreva o que aconteceu que eu preparo o chamado com o contexto desta página.'
          : 'Não consegui listar suas gerações agora. Me descreva o que aconteceu que eu preparo o chamado mesmo assim.' },
        { id: newId(), role: 'nodi', kind: 'describe' },
      )
      return
    }

    append(
      { id: newId(), role: 'nodi', kind: 'text', text: 'Entendi. Me descreva a situação — vou juntar o contexto técnico desta página e preparar um chamado pra sua revisão.' },
      { id: newId(), role: 'nodi', kind: 'describe' },
    )
  }, [pending, markDone, append])

  const pickGeneration = useCallback(async (msgId: string, g: GenerationSummary) => {
    if (pending) return
    markDone(msgId)
    append({ id: newId(), role: 'user', kind: 'text', text: `${g.tool} · ${formatWhen(g.createdAt) ?? g.id.slice(0, 8)}` })
    setPending('diagnose')
    const res = await runDiagnosis(g.kind, g.id)
    setPending(null)
    if (!res.ok) {
      append({
        id: newId(), role: 'nodi', kind: 'notice', tone: res.offline ? 'warning' : 'error',
        text: res.offline ? UNAVAILABLE_TEXT : res.error,
      })
      return
    }
    flowRef.current.report = res.data.report
    append({ id: newId(), role: 'nodi', kind: 'diagnosis', report: res.data.report })
  }, [pending, markDone, append])

  const retryDiagnosis = useCallback(async (report: DiagnosisReport) => {
    const g = report.generation
    if (!g || pending) return
    setPending('diagnose')
    const res = await runDiagnosis(g.kind, g.id)
    setPending(null)
    if (res.ok) {
      flowRef.current.report = res.data.report
      append({ id: newId(), role: 'nodi', kind: 'diagnosis', report: res.data.report })
    } else {
      append({ id: newId(), role: 'nodi', kind: 'notice', tone: 'error', text: res.error })
    }
  }, [pending, append])

  const openDescribe = useCallback((report: DiagnosisReport | null) => {
    if (report) flowRef.current.report = report
    if (!flowRef.current.category) flowRef.current.category = 'generation_failed'
    append({ id: newId(), role: 'nodi', kind: 'describe' })
  }, [append])

  const buildDraft = useCallback((description: string, stepsTried: string): TicketDraft => {
    const category = flowRef.current.category ?? 'other'
    const report = flowRef.current.report
    const g = report?.generation ?? null
    const where = g ? ` no ${g.tool}` : context.moduleLabel ? ` no ${context.moduleLabel}` : ''
    return {
      title: `${TICKET_CATEGORY_LABEL[category]}${where}`,
      description,
      category,
      priority: report?.known?.priority ?? (category === 'access' ? 'high' : 'normal'),
      stepsTried: stepsTried || undefined,
      probableCause: report?.known?.cause,
      context: {
        route: context.route,
        module: context.moduleLabel ?? undefined,
        projectId: context.projectId ?? undefined,
        extra: context.extra,
        ...(report?.collected ?? {}),
      },
      transcript: historyTurns(),
      generationKind: g?.kind,
      generationId: g?.id,
    }
  }, [context, historyTurns])

  const submitDescribe = useCallback((msgId: string, description: string, stepsTried: string) => {
    markDone(msgId)
    const draft = buildDraft(description, stepsTried)
    append(
      { id: newId(), role: 'nodi', kind: 'text', text: REVIEW_INTRO },
      { id: newId(), role: 'nodi', kind: 'review', draft },
    )
  }, [markDone, buildDraft, append])

  const sendTicket = useCallback(async (msgId: string, draft: TicketDraft) => {
    if (pending) return
    markDone(msgId)
    setPending('ticket')
    const res = await submitTicket(draft)
    setPending(null)
    if (!res.ok) {
      const summaryFallback = plainDraftSummary(draft)
      append({
        id: newId(), role: 'nodi', kind: 'notice',
        tone: res.status === 503 || res.offline ? 'warning' : 'error',
        text: res.error,
        summary: summaryFallback,
        actions: [
          { type: 'copy', label: 'Copiar resumo do problema', payload: summaryFallback },
          { type: 'whatsapp', label: 'Enviar pro suporte no WhatsApp', href: supportWhatsAppUrl(summaryFallback) },
        ],
      })
      return
    }
    setAvatarFlash('success')
    window.setTimeout(() => setAvatarFlash(null), 2600)
    append({
      id: newId(), role: 'nodi', kind: 'sent',
      ticket: res.data.ticket, summary: res.data.summary,
    })
  }, [pending, markDone, append])

  const cancelReview = useCallback((msgId: string) => {
    markDone(msgId)
    flowRef.current = { category: null, report: null }
    append({ id: newId(), role: 'nodi', kind: 'text', text: 'Sem problema — descartei o rascunho. Se precisar, é só recomeçar.' })
  }, [markDone, append])

  // ── Ações genéricas ─────────────────────────────────────────────────────────

  const runAction = useCallback((a: NodiAction, msgId: string) => {
    sendNodiEvent('action_clicked', context.route, context.moduleId, { action: a.type })
    switch (a.type) {
      case 'navigate':
        if (a.href) router.push(a.href)
        onClose()
        return
      case 'link':
      case 'whatsapp':
        if (a.href) window.open(a.href, '_blank', 'noopener')
        return
      case 'copy':
        if (a.payload) {
          void navigator.clipboard?.writeText(a.payload).then(() => {
            setCopiedId(msgId + a.label)
            window.setTimeout(() => setCopiedId(null), 1800)
          }).catch(() => {})
        }
        return
      case 'start-problem':
        startProblemFlow()
        return
    }
  }, [context.route, context.moduleId, router, onClose, startProblemFlow])

  const clearConversation = useCallback(() => {
    setMessages([])
    flowRef.current = { category: null, report: null }
    try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
    setView('home')
  }, [])

  const openTickets = useCallback(async () => {
    setView('tickets')
    if (tickets === null) {
      const res = await fetchMyTickets()
      setTickets(res.ok ? res.data.tickets : [])
    }
  }, [tickets])

  const onSubmitInput = useCallback(() => {
    const q = input.trim()
    if (!q || pending) return
    // "sim"/"pode"/"confirma" digitado com uma execução pendente → executa
    // (confirmação por texto, sem precisar do clique)
    if (CONFIRM_RE.test(q)) {
      const pendingExec = [...messages].reverse().find(
        m => !m.done && m.v2?.proposals?.some(p => p.executable && p.intentToken),
      )
      const action = pendingExec?.v2?.proposals?.find(p => p.executable && p.intentToken)
      if (pendingExec && action) {
        setInput('')
        append({ id: newId(), role: 'user', kind: 'text', text: q })
        void runExecutable(pendingExec.id, action)
        return
      }
    }
    setInput('')
    // com o copiloto liberado, pergunta livre vai pra V2 (o servidor ainda
    // atalha na base quando dá); sugestões/FAQ continuam na V1 (kbId)
    if (caps?.v2) void sendV2(q)
    else void ask(q)
  }, [input, pending, messages, append, runExecutable, caps, sendV2, ask])

  // ── Estado do avatar do cabeçalho ───────────────────────────────────────────
  const avatarState: NodiAvatarState = useMemo(() => {
    if (pending) return 'thinking'
    if (avatarFlash === 'success') return 'success'
    if (offline) return 'muted'
    return 'idle'
  }, [pending, avatarFlash, offline])

  const greetingModule = bootstrap?.moduleLabel ?? context.moduleLabel

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="spn-nodi-panel" role="dialog" aria-label="Nodi — assistente da SpaceNode">
      {/* Cabeçalho */}
      <header className="spn-nodi-header">
        {view !== 'home' ? (
          <button type="button" className="spn-nodi-iconbtn" aria-label="Voltar ao início" onClick={() => setView('home')}>
            {Icon.back}
          </button>
        ) : (
          <span className="spn-nodi-iconbtn" aria-hidden style={{ visibility: 'hidden' }}>{Icon.back}</span>
        )}
        <div className="spn-nodi-header-title">
          <NodiAvatar size={22} state={avatarState} />
          <div>
            <strong>Nodi</strong>
            {/* "copiloto" = V2 ativo nesta sessão; "assistente" = V1 (sinal honesto de modo) */}
            <span>{pending ? 'analisando…' : offline ? 'indisponível' : caps?.v2 ? 'copiloto da SpaceNode' : 'assistente da SpaceNode'}</span>
          </div>
        </div>
        <div className="spn-nodi-header-actions">
          {messages.length > 0 && (
            <button type="button" className="spn-nodi-iconbtn" aria-label="Limpar conversa" title="Limpar conversa" onClick={clearConversation}>
              {Icon.clear}
            </button>
          )}
          <button type="button" className="spn-nodi-iconbtn" aria-label="Minimizar" title="Minimizar" onClick={onClose}>
            {Icon.minimize}
          </button>
          <button
            type="button" className="spn-nodi-iconbtn" aria-label="Fechar" title="Fechar"
            onClick={() => { setView('home'); onClose() }}
          >
            {Icon.close}
          </button>
        </div>
      </header>

      {/* Corpo */}
      <div ref={bodyRef} className="spn-nodi-body">
        {view === 'home' && (
          <div className="spn-nodi-home">
            <div className="spn-nodi-hello">
              <NodiAvatar size={34} state={avatarState} />
              <p>{WELCOME_TEXT}</p>
              {greetingModule && <span className="spn-nodi-hello-context">Você está em {greetingModule}.</span>}
            </div>

            {offline && (
              <div className="spn-nodi-notice spn-nodi-notice--warning" role="status">
                {UNAVAILABLE_TEXT}
                <div className="spn-nodi-actions">
                  <button type="button" className="spn-nodi-actionbtn" onClick={() => window.open(supportWhatsAppUrl(), '_blank', 'noopener')}>
                    Falar com o suporte no WhatsApp
                  </button>
                </div>
              </div>
            )}

            {caps?.v2 && (
              <section aria-label="Ações rápidas do copiloto">
                <h3 className="spn-nodi-section-title">Copiloto</h3>
                <div className="spn-nodi-chips">
                  {caps.multimodal && context.vistaId && (
                    <button
                      type="button" className="spn-nodi-chip"
                      onClick={() => {
                        setAttachment({ kind: 'vista', id: context.vistaId! })
                        void sendV2('Analise a imagem desta vista e me diga o que melhorar.')
                      }}
                    >
                      Analisar a imagem desta vista
                    </button>
                  )}
                  {caps.multimodal && !context.vistaId && (
                    <button type="button" className="spn-nodi-chip" onClick={openAttachPicker}>
                      Analisar uma geração
                    </button>
                  )}
                  <button
                    type="button" className="spn-nodi-chip"
                    onClick={() => { setView('chat'); setInput('Quero apresentar este projeto para meu cliente. Monte um plano.'); inputRef.current?.focus() }}
                  >
                    Montar um plano de apresentação
                  </button>
                  <button
                    type="button" className="spn-nodi-chip"
                    onClick={() => { setView('chat'); setInput('Me ajude a escrever a direção criativa para esta cena: '); inputRef.current?.focus() }}
                  >
                    Melhorar meu prompt
                  </button>
                </div>
              </section>
            )}

            {bootstrap && bootstrap.suggestions.length > 0 && (
              <section aria-label="Sugestões para esta página">
                <h3 className="spn-nodi-section-title">Sugestões para esta página</h3>
                <div className="spn-nodi-chips">
                  {bootstrap.suggestions.map(s => (
                    <button key={s.id} type="button" className="spn-nodi-chip" onClick={() => void ask(null, s.id, s.title)}>
                      {s.title}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <button type="button" className="spn-nodi-problem" onClick={startProblemFlow}>
              Estou com um problema
              <span>Analiso a geração e, se precisar, preparo um chamado completo.</span>
            </button>

            {bootstrap && bootstrap.faq.length > 0 && (
              <section aria-label="Dúvidas frequentes">
                <h3 className="spn-nodi-section-title">Dúvidas frequentes</h3>
                <div className="spn-nodi-faq">
                  {bootstrap.faq.map(f => (
                    <button key={f.id} type="button" onClick={() => void ask(null, f.id, f.title)}>
                      {f.title}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="spn-nodi-home-footer">
              <button type="button" onClick={() => window.open(supportWhatsAppUrl(), '_blank', 'noopener')}>
                Falar com o suporte
              </button>
              <span aria-hidden>·</span>
              <button type="button" onClick={openTickets}>Meus chamados</button>
            </div>
          </div>
        )}

        {view === 'tickets' && (
          <div className="spn-nodi-home">
            <h3 className="spn-nodi-section-title">Meus chamados</h3>
            {tickets === null && <p className="spn-nodi-muted">Carregando…</p>}
            {tickets !== null && tickets.length === 0 && (
              <p className="spn-nodi-muted">Nenhum chamado por aqui. Quando você registrar um, ele aparece nesta lista com o protocolo e o status.</p>
            )}
            {tickets?.map(t => (
              <div key={t.id} className="spn-nodi-ticket-row">
                <div>
                  <strong>{t.protocol}</strong>
                  <span>{t.title}</span>
                </div>
                <span className={`spn-nodi-badge spn-nodi-badge--${t.status === 'resolved' ? 'green' : 'neutral'}`}>
                  {TICKET_STATUS_LABEL[t.status] ?? t.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {view === 'chat' && (
          <div className="spn-nodi-thread" aria-live="polite">
            {messages.map(m => (
              <Message
                key={m.id}
                msg={m}
                copiedId={copiedId}
                onAction={runAction}
                onPickCategory={pickCategory}
                onPickGeneration={pickGeneration}
                onPickAttachment={pickAttachment}
                onConfirmProposal={confirmProposal}
                onUsePrompt={usePrompt}
                onConfirmMemory={confirmMemory}
                onFeedback={giveFeedback}
                onRetryDiagnosis={retryDiagnosis}
                onResolved={(id) => { markDone(id); setAvatarFlash('success'); window.setTimeout(() => setAvatarFlash(null), 2600); append({ id: newId(), role: 'nodi', kind: 'text', text: 'Ótimo. Qualquer coisa, estou por aqui.' }) }}
                onOpenTicket={(id, report) => { markDone(id); openDescribe(report) }}
                onSubmitDescribe={submitDescribe}
                onSendTicket={sendTicket}
                onCancelReview={cancelReview}
              />
            ))}
            {pending && (
              <div className="spn-nodi-msg spn-nodi-msg--nodi">
                <span className="spn-nodi-typing" aria-label={pending === 'ask' ? 'Analisando a pergunta' : pending === 'ticket' ? 'Preparando o chamado' : pending === 'execute' ? 'Gerando a imagem' : 'Analisando'}>
                  <i /><i /><i />
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Entrada */}
      {view !== 'tickets' && (
        <footer className="spn-nodi-inputrow">
          {attachment && (
            <span className="spn-nodi-attach" title="Imagem anexada à próxima pergunta">
              imagem anexada
              <button type="button" aria-label="Remover anexo" onClick={() => setAttachment(null)}>×</button>
            </span>
          )}
          {caps?.multimodal && !attachment && (
            <button
              type="button"
              className="spn-nodi-iconbtn"
              aria-label="Anexar uma geração para análise"
              title="Anexar uma geração"
              onClick={openAttachPicker}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <rect x="2" y="3" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4.5 8.5l2-2 2 2 1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="5" cy="5.4" r="0.8" fill="currentColor" />
              </svg>
            </button>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            placeholder="Pergunte sobre ferramentas ou nodes"
            aria-label="Pergunta para o Nodi"
            disabled={pending === 'ticket'}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSubmitInput()
              }
            }}
          />
          <button
            type="button"
            className="spn-nodi-sendbtn"
            aria-label="Enviar pergunta"
            disabled={!input.trim() || !!pending}
            onClick={onSubmitInput}
          >
            {Icon.send}
          </button>
        </footer>
      )}
    </div>
  )
}

// ── Resumo de texto do rascunho (fallback quando o registro está fora) ───────

function plainDraftSummary(draft: TicketDraft): string {
  const c = draft.context
  const lines = [
    `Problema: ${draft.title}`,
    draft.description,
    c.module ? `Módulo: ${c.module}` : null,
    c.generationId ? `Geração: ${c.generationKind ?? ''} ${c.generationId}`.trim() : null,
    c.engine ? `Motor: ${c.engine}` : null,
    c.status ? `Status: ${c.status}` : null,
    c.occurredAt ? `Horário: ${c.occurredAt}` : null,
  ].filter(Boolean)
  return lines.join('\n')
}

// ── Mensagens ─────────────────────────────────────────────────────────────────

interface MessageProps {
  msg: PanelMsg
  copiedId: string | null
  onAction: (a: NodiAction, msgId: string) => void
  onPickCategory: (msgId: string, c: TicketCategory) => void
  onPickGeneration: (msgId: string, g: GenerationSummary) => void
  onPickAttachment: (msgId: string, g: GenerationSummary) => void
  onRetryDiagnosis: (r: DiagnosisReport) => void
  onResolved: (msgId: string) => void
  onOpenTicket: (msgId: string, r: DiagnosisReport | null) => void
  onSubmitDescribe: (msgId: string, description: string, steps: string) => void
  onSendTicket: (msgId: string, draft: TicketDraft) => void
  onCancelReview: (msgId: string) => void
  onConfirmProposal: (msgId: string, a: SupervisedAction) => void
  onUsePrompt: (s: PromptSuggestion) => void
  onConfirmMemory: (msgId: string, p: MemoryProposal) => void
  onFeedback: (msgId: string, helpful: boolean) => void
}

function Message(props: MessageProps) {
  const { msg } = props

  if (msg.kind === 'options') {
    return (
      <div className="spn-nodi-msg spn-nodi-msg--nodi spn-nodi-msg--block">
        <div className="spn-nodi-chips">
          {msg.options?.map(o => (
            <button key={o.id} type="button" className="spn-nodi-chip" disabled={msg.done} onClick={() => props.onPickCategory(msg.id, o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (msg.kind === 'generations') {
    const pick = msg.purpose === 'attach' ? props.onPickAttachment : props.onPickGeneration
    return (
      <div className="spn-nodi-msg spn-nodi-msg--nodi spn-nodi-msg--block">
        <div className="spn-nodi-genlist">
          {msg.generations?.map(g => (
            <button key={`${g.kind}:${g.id}`} type="button" disabled={msg.done} onClick={() => pick(msg.id, g)}>
              <strong>{g.tool}</strong>
              <span>{formatWhen(g.createdAt) ?? '—'}{g.engine ? ` · ${g.engine}` : ''}</span>
              <em className={`spn-nodi-status spn-nodi-status--${g.status}`}>{statusDisplayLabel(g.status)}</em>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (msg.kind === 'v2' && msg.v2) {
    return <V2Message {...props} answer={msg.v2} />
  }

  if (msg.kind === 'diagnosis' && msg.report) {
    return <DiagnosisCard {...props} report={msg.report} />
  }

  if (msg.kind === 'describe') {
    return <DescribeForm msgId={msg.id} done={!!msg.done} onSubmit={props.onSubmitDescribe} />
  }

  if (msg.kind === 'review' && msg.draft) {
    return <ReviewCard {...props} draft={msg.draft} />
  }

  if (msg.kind === 'sent' && msg.ticket) {
    return (
      <div className="spn-nodi-msg spn-nodi-msg--nodi spn-nodi-msg--block">
        <div className="spn-nodi-card spn-nodi-card--success">
          <strong>Chamado registrado — protocolo {msg.ticket.protocol}</strong>
          <p>A equipe recebe o contexto completo junto. Você acompanha o andamento em “Meus chamados”, aqui no painel.</p>
          <div className="spn-nodi-actions">
            <ActionBtn label={props.copiedId === msg.id + 'Copiar resumo' ? 'Copiado' : 'Copiar resumo'} onClick={() => props.onAction({ type: 'copy', label: 'Copiar resumo', payload: msg.summary ?? '' }, msg.id)} />
            <ActionBtn label="Enviar pro suporte no WhatsApp" onClick={() => props.onAction({ type: 'whatsapp', label: 'whatsapp', href: supportWhatsAppUrl(msg.summary ?? '') }, msg.id)} />
          </div>
        </div>
      </div>
    )
  }

  if (msg.kind === 'executed') {
    return (
      <div className="spn-nodi-msg spn-nodi-msg--nodi spn-nodi-msg--block">
        <div className="spn-nodi-card spn-nodi-card--success">
          <strong>Geração concluída</strong>
          {msg.outputUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="spn-nodi-result" src={msg.outputUrl} alt="Resultado da geração feita pelo Nodi" />
          )}
          {msg.text && <p>{msg.text}</p>}
          {msg.actions && msg.actions.length > 0 && (
            <div className="spn-nodi-actions">
              {msg.actions.map(a => (
                <ActionBtn key={a.label} label={a.label} onClick={() => props.onAction(a, msg.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (msg.kind === 'notice') {
    return (
      <div className="spn-nodi-msg spn-nodi-msg--nodi spn-nodi-msg--block">
        <div className={`spn-nodi-notice spn-nodi-notice--${msg.tone ?? 'error'}`} role="status">
          {msg.text}
          {msg.actions && msg.actions.length > 0 && (
            <div className="spn-nodi-actions">
              {msg.actions.map(a => (
                <ActionBtn
                  key={a.label}
                  label={props.copiedId === msg.id + a.label ? 'Copiado' : a.label}
                  onClick={() => props.onAction(a, msg.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // texto comum
  const isUser = msg.role === 'user'
  return (
    <div className={`spn-nodi-msg ${isUser ? 'spn-nodi-msg--user' : 'spn-nodi-msg--nodi'}`}>
      <div className="spn-nodi-bubble">
        {msg.text}
        {msg.confidence === 'low' && !isUser && (
          <span className="spn-nodi-lowconf">Resposta com baixa confiança — na dúvida, confirme com o suporte.</span>
        )}
      </div>
      {!isUser && msg.actions && msg.actions.length > 0 && (
        <div className="spn-nodi-actions">
          {msg.actions.map(a => (
            <ActionBtn
              key={a.label}
              label={props.copiedId === msg.id + a.label ? 'Copiado' : a.label}
              onClick={() => props.onAction(a, msg.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ActionBtn({ label, onClick, tone, disabled }: { label: string; onClick: () => void; tone?: 'green'; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`spn-nodi-actionbtn${tone === 'green' ? ' spn-nodi-actionbtn--green' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}

// ── Resposta do copiloto: texto + cards de artefatos + feedback ──────────────

function V2Message(props: MessageProps & { answer: NodiV2Answer }) {
  const { msg, answer } = props
  return (
    <div className="spn-nodi-msg spn-nodi-msg--nodi spn-nodi-msg--block">
      {msg.text && <div className="spn-nodi-bubble">{msg.text}</div>}
      {answer.analysis && <AnalysisCard report={answer.analysis} />}
      {answer.recommendation && (
        <RecommendationCard rec={answer.recommendation} onUse={() =>
          props.onConfirmProposal(msg.id, {
            id: 'r', type: 'apply_settings', label: 'aplicar recomendação',
            moduleId: answer.recommendation!.moduleId, settings: answer.recommendation!.settings,
          })}
        />
      )}
      {answer.plan && <PlanCard plan={answer.plan} />}
      {answer.promptSuggestion && (
        <PromptCard
          suggestion={answer.promptSuggestion}
          copied={props.copiedId === msg.id + 'Copiar prompt'}
          onCopy={() => props.onAction({ type: 'copy', label: 'Copiar prompt', payload: answer.promptSuggestion!.prompt }, msg.id)}
          onUse={() => props.onUsePrompt(answer.promptSuggestion!)}
        />
      )}
      {answer.proposals?.map(p => (
        <ProposalCard
          key={p.id}
          action={p}
          done={!!msg.done}
          onConfirm={() => props.onConfirmProposal(msg.id, p)}
          onCancel={() => props.onFeedback(msg.id, false)}
        />
      ))}
      {answer.memoryProposal && (
        <MemoryCard
          proposal={answer.memoryProposal}
          done={!!msg.done}
          onConfirm={() => props.onConfirmMemory(msg.id, answer.memoryProposal!)}
        />
      )}
      {answer.actions && answer.actions.length > 0 && (
        <div className="spn-nodi-actions">
          {answer.actions.map(a => (
            <ActionBtn key={a.label} label={props.copiedId === msg.id + a.label ? 'Copiado' : a.label} onClick={() => props.onAction(a, msg.id)} />
          ))}
        </div>
      )}
      <div className="spn-nodi-feedback">
        {msg.feedback ? (
          <span>Obrigado pelo retorno.</span>
        ) : (
          <>
            <button type="button" onClick={() => props.onFeedback(msg.id, true)}>Útil</button>
            <span aria-hidden>·</span>
            <button type="button" onClick={() => props.onFeedback(msg.id, false)}>Não ajudou</button>
          </>
        )}
      </div>
    </div>
  )
}

function AnalysisCard({ report }: { report: AnalysisReport }) {
  const blameLabel: Record<string, string> = {
    entrada: 'imagem de entrada', prompt: 'direção criativa', configuracao: 'configuração',
    engine: 'motor', tecnica: 'falha técnica', nenhum: 'nenhum problema dominante',
  }
  return (
    <div className="spn-nodi-card">
      <strong>Diagnóstico visual — {report.subject}</strong>
      {report.summary && <p>{report.summary}</p>}
      {report.blame && <p className="spn-nodi-muted">Origem provável: {blameLabel[report.blame] ?? report.blame}.</p>}
      {report.findings.length > 0 && (
        <ul className="spn-nodi-findings">
          {report.findings.map((f, i) => (
            <li key={i}>
              <i className={`spn-nodi-sev spn-nodi-sev--${f.severity}`} aria-hidden />
              <span><strong>{f.dimension}:</strong> {f.note}</span>
            </li>
          ))}
        </ul>
      )}
      {report.comparison && (
        <>
          {report.comparison.verdict && <p>{report.comparison.verdict}</p>}
          {report.comparison.preserved.length > 0 && (
            <p className="spn-nodi-muted">Preservado: {report.comparison.preserved.join('; ')}</p>
          )}
          {report.comparison.changed.length > 0 && (
            <p className="spn-nodi-muted">Alterado: {report.comparison.changed.join('; ')}</p>
          )}
        </>
      )}
    </div>
  )
}

function RecommendationCard({ rec, onUse }: { rec: ConfigRecommendation; onUse: () => void }) {
  return (
    <div className="spn-nodi-card">
      <strong>Recomendação — {rec.moduleLabel}</strong>
      <dl className="spn-nodi-dl">
        {rec.engine && <><dt>Motor</dt><dd>{rec.engine}</dd></>}
        {Object.entries(rec.settings).filter(([k]) => k !== 'engine').map(([k, v]) => (
          <FragmentRow key={k} k={k} v={v} />
        ))}
        {typeof rec.estimatedNodes === 'number' && <><dt>Custo estimado</dt><dd>{rec.estimatedNodes} nodes</dd></>}
      </dl>
      <p className="spn-nodi-muted">{rec.rationale}</p>
      <div className="spn-nodi-actions">
        <ActionBtn label={`Aplicar no ${rec.moduleLabel}`} onClick={onUse} />
      </div>
    </div>
  )
}

function FragmentRow({ k, v }: { k: string; v: string }) {
  return (<><dt>{k}</dt><dd>{v}</dd></>)
}

function PlanCard({ plan }: { plan: GenerationPlan }) {
  return (
    <div className="spn-nodi-card">
      <strong>Plano — {plan.objective}</strong>
      <ol className="spn-nodi-plan">
        {plan.steps.map(s => (
          <li key={s.order}>
            <strong>{s.moduleLabel}</strong> — {s.goal}
            <span className="spn-nodi-muted">
              {[s.engine, s.estimatedNodes ? `${s.estimatedNodes} nodes` : null].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ol>
      {typeof plan.totalEstimatedNodes === 'number' && (
        <p className="spn-nodi-muted">Total estimado: {plan.totalEstimatedNodes} nodes (etapas sem custo fixo mostram o valor na ferramenta).</p>
      )}
      {plan.notes && <p className="spn-nodi-muted">{plan.notes}</p>}
    </div>
  )
}

function PromptCard({ suggestion, copied, onCopy, onUse }: {
  suggestion: PromptSuggestion; copied: boolean; onCopy: () => void; onUse: () => void
}) {
  return (
    <div className="spn-nodi-card">
      <strong>Direção criativa sugerida</strong>
      <p className="spn-nodi-promptbox">{suggestion.prompt}</p>
      <p className="spn-nodi-muted">{suggestion.rationale}</p>
      <div className="spn-nodi-actions">
        <ActionBtn label={copied ? 'Copiado' : 'Copiar prompt'} onClick={onCopy} />
        {suggestion.moduleId && <ActionBtn label="Usar na ferramenta" onClick={onUse} />}
      </div>
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  navigate: 'Abrir página', fill_prompt: 'Preencher direção criativa',
  apply_settings: 'Aplicar configurações', start_generation: 'Preparar geração',
}

function ProposalCard({ action, done, onConfirm, onCancel }: {
  action: SupervisedAction; done: boolean; onConfirm: () => void; onCancel: () => void
}) {
  const p = action.preflight
  return (
    <div className="spn-nodi-card">
      <strong>{ACTION_LABEL[action.type] ?? action.type} — {action.label}</strong>
      {p ? (
        <>
          <dl className="spn-nodi-dl">
            <dt>Módulo</dt><dd>{p.moduleLabel}</dd>
            {p.engine && <><dt>Motor</dt><dd>{p.engine}</dd></>}
            {Object.entries(p.settings).filter(([k]) => k !== 'engine' && k !== 'model').map(([k, v]) => (
              <FragmentRow key={k} k={k} v={v} />
            ))}
            {p.imageLabel && <><dt>Imagem</dt><dd>{p.imageLabel}</dd></>}
            {p.prompt && <><dt>Direção</dt><dd>{p.prompt.slice(0, 140)}{p.prompt.length > 140 ? '…' : ''}</dd></>}
            <dt>Custo estimado</dt><dd>{p.estimatedNodes !== null ? `${p.estimatedNodes} nodes` : 'definido na ferramenta'}</dd>
            {p.balance !== null && <><dt>Saldo atual</dt><dd>{p.balance} nodes</dd></>}
          </dl>
          {p.risks.length > 0 && (
            <ul className="spn-nodi-risks">
              {p.risks.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          <p className="spn-nodi-muted">
            {action.executable
              ? `Ao confirmar, eu gero aqui mesmo e os ${p.estimatedNodes} nodes são debitados (estorno automático se falhar). Pode confirmar pelo botão ou digitando "sim".`
              : 'Confirmar abre a ferramenta já preenchida — a geração (e o débito) só acontece no botão dela.'}
          </p>
        </>
      ) : (
        action.prompt && <p className="spn-nodi-muted">{action.prompt.slice(0, 160)}</p>
      )}
      <div className="spn-nodi-actions">
        <ActionBtn tone="green" label={action.executable ? 'Confirmar e gerar' : 'Confirmar'} onClick={onConfirm} disabled={done} />
        <ActionBtn label="Agora não" onClick={onCancel} disabled={done} />
      </div>
    </div>
  )
}

function MemoryCard({ proposal, done, onConfirm }: {
  proposal: MemoryProposal; done: boolean; onConfirm: () => void
}) {
  const p = proposal.patch
  return (
    <div className="spn-nodi-card">
      <strong>Salvar na memória do projeto?</strong>
      <dl className="spn-nodi-dl">
        {p.style && <><dt>Estilo</dt><dd>{p.style}</dd></>}
        {p.materials && <><dt>Materiais</dt><dd>{p.materials}</dd></>}
        {p.lighting && <><dt>Iluminação</dt><dd>{p.lighting}</dd></>}
        {p.mainImage && <><dt>Imagem principal</dt><dd>{p.mainImage}</dd></>}
        {p.lockedElements && <><dt>Não pode mudar</dt><dd>{p.lockedElements}</dd></>}
        {p.decisions?.map((d, i) => <FragmentRow key={i} k="Decisão" v={d} />)}
      </dl>
      <p className="spn-nodi-muted">{proposal.reason} Nada é salvo sem a sua confirmação.</p>
      <div className="spn-nodi-actions">
        <ActionBtn tone="green" label="Salvar na memória" onClick={onConfirm} disabled={done} />
      </div>
    </div>
  )
}

function DiagnosisCard(props: MessageProps & { report: DiagnosisReport }) {
  const { report, msg } = props
  const g = report.generation
  const known = report.known
  const failed = g?.status === 'failed' || g?.status === 'refunded'
  const processing = g?.status === 'processing' || g?.status === 'pending'

  return (
    <div className="spn-nodi-msg spn-nodi-msg--nodi spn-nodi-msg--block">
      <div className="spn-nodi-card">
        <strong>Diagnóstico da geração</strong>
        <dl className="spn-nodi-dl">
          {g && <><dt>Ferramenta</dt><dd>{g.tool}</dd></>}
          {g?.engine && <><dt>Motor</dt><dd>{g.engine}</dd></>}
          {g && <><dt>Status</dt><dd>{statusDisplayLabel(g.status)}</dd></>}
          {formatWhen(g?.createdAt) && <><dt>Horário</dt><dd>{formatWhen(g?.createdAt)}</dd></>}
          {typeof g?.nodesCharged === 'number' && <><dt>Nodes</dt><dd>{g.nodesCharged}{typeof g?.nodesRefunded === 'number' ? ` (${g.nodesRefunded} estornados)` : ''}</dd></>}
        </dl>
        {known ? (
          <p><strong>Causa provável:</strong> {known.cause} {known.suggestion}</p>
        ) : processing ? (
          <p>Ainda em processamento — isso pode levar alguns minutos, conforme a ferramenta. Consulte de novo em instantes.</p>
        ) : failed ? (
          <p>{LOW_CONFIDENCE_TEXT}</p>
        ) : (
          <p>O registro está concluído, sem erro apontado. Se o resultado veio diferente do esperado, me descreva — preparo um chamado com este contexto.</p>
        )}
        <div className="spn-nodi-actions">
          <ActionBtn label="Consultar status de novo" onClick={() => props.onRetryDiagnosis(report)} />
          <ActionBtn label="Resolvido" onClick={() => props.onResolved(msg.id)} />
          <ActionBtn label="Preparar chamado" onClick={() => props.onOpenTicket(msg.id, report)} />
        </div>
      </div>
    </div>
  )
}

function DescribeForm({ msgId, done, onSubmit }: { msgId: string; done: boolean; onSubmit: (id: string, d: string, s: string) => void }) {
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState('')
  return (
    <div className="spn-nodi-msg spn-nodi-msg--nodi spn-nodi-msg--block">
      <div className="spn-nodi-card">
        <label className="spn-nodi-label" htmlFor={`${msgId}-desc`}>O que aconteceu?</label>
        <textarea
          id={`${msgId}-desc`}
          rows={3}
          disabled={done}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Descreva o problema com suas palavras"
        />
        <label className="spn-nodi-label" htmlFor={`${msgId}-steps`}>O que você já tentou? (opcional)</label>
        <textarea
          id={`${msgId}-steps`}
          rows={2}
          disabled={done}
          value={steps}
          onChange={e => setSteps(e.target.value)}
          placeholder="Ex.: gerei de novo, troquei o motor…"
        />
        <div className="spn-nodi-actions">
          <ActionBtn
            label="Revisar o chamado"
            disabled={done || !description.trim()}
            onClick={() => onSubmit(msgId, description.trim(), steps.trim())}
          />
        </div>
      </div>
    </div>
  )
}

function ReviewCard(props: MessageProps & { draft: TicketDraft }) {
  const { draft, msg } = props
  const c = draft.context
  return (
    <div className="spn-nodi-msg spn-nodi-msg--nodi spn-nodi-msg--block">
      <div className="spn-nodi-card">
        <strong>{draft.title}</strong>
        <p className="spn-nodi-review-desc">{draft.description}</p>
        {draft.stepsTried && <p className="spn-nodi-muted">Já tentou: {draft.stepsTried}</p>}
        {draft.probableCause && <p className="spn-nodi-muted">Causa provável: {draft.probableCause}</p>}
        <dl className="spn-nodi-dl">
          <dt>Categoria</dt><dd>{TICKET_CATEGORY_LABEL[draft.category]}</dd>
          <dt>Prioridade sugerida</dt><dd>{TICKET_PRIORITY_LABEL[draft.priority]}</dd>
          {c.module && <><dt>Módulo</dt><dd>{c.module}</dd></>}
          {c.generationId && <><dt>Geração</dt><dd>{c.generationKind} · {c.generationId.slice(0, 8)}…</dd></>}
          {c.engine && <><dt>Motor</dt><dd>{c.engine}</dd></>}
          {c.status && <><dt>Status</dt><dd>{statusDisplayLabel(c.status)}</dd></>}
          {typeof c.nodesCharged === 'number' && <><dt>Nodes debitados</dt><dd>{c.nodesCharged}</dd></>}
          {typeof c.nodesRefunded === 'number' && <><dt>Nodes estornados</dt><dd>{c.nodesRefunded}</dd></>}
          {c.planId && <><dt>Plano</dt><dd>{c.planId}</dd></>}
          {c.browser && <><dt>Navegador</dt><dd>{c.browser} · {c.os}</dd></>}
        </dl>
        <p className="spn-nodi-muted">
          Junto vão a transcrição resumida desta conversa e o navegador/sistema usados — nada além do que está aqui.
          Nada é enviado sem a sua confirmação.
        </p>
        <div className="spn-nodi-actions">
          <ActionBtn tone="green" label="Enviar chamado" onClick={() => props.onSendTicket(msg.id, draft)} />
          <ActionBtn label="Cancelar" onClick={() => props.onCancelReview(msg.id)} />
        </div>
      </div>
    </div>
  )
}
