// ── Tipos compartilhados do Nodi ──────────────────────────────────────────────
//
// Contratos entre UI (components/nodi), rotas (/api/nodi/*) e serviços
// (lib/nodi/*). Sem dependência de servidor — importável do client.

/** Onde o usuário está agora (derivado da rota + enriquecido pela página). */
export interface NodiContext {
  /** pathname atual, ex.: /app/spaces/abc/vistas/def */
  route: string
  /** id do módulo em lib/nav/modules-config (renderizar, spaces, editar…) ou área fixa (historico, conta…). */
  moduleId: string | null
  /** Rótulo humano do módulo ("Renderizar", "Histórico"…). */
  moduleLabel: string | null
  /** Projeto (Space) aberto, quando a rota é /app/spaces/[spaceId]/… */
  projectId?: string | null
  /** Vista aberta, quando a rota é …/vistas/[vistaId] */
  vistaId?: string | null
  /** Enriquecimento opcional da página (engine selecionada etc.) — só strings curtas. */
  extra?: Record<string, string>
}

export type NodiRole = 'user' | 'nodi'

/** Um turno da conversa (histórico da sessão). */
export interface NodiTurn {
  role: NodiRole
  text: string
  /** epoch ms */
  at: number
}

export type NodiConfidence = 'high' | 'medium' | 'low'
export type NodiAnswerSource = 'kb' | 'ai' | 'none'

/** Ação segura oferecida junto de uma resposta. Nada destrutivo, nada que gere cobrança. */
export interface NodiAction {
  type: 'navigate' | 'link' | 'whatsapp' | 'copy' | 'start-problem'
  label: string
  /** navigate: rota interna · link: URL externa (docs/legal) · whatsapp: wa.me */
  href?: string
  /** copy: conteúdo a copiar */
  payload?: string
}

/** Resposta do assistente (KB determinística ou provedor de IA). */
export interface NodiAnswer {
  text: string
  confidence: NodiConfidence
  source: NodiAnswerSource
  /** ids das entradas da base de conhecimento usadas (telemetria/depuração). */
  kbRefs: string[]
  actions: NodiAction[]
  /** true quando a resposta deve vir acompanhada do caminho pro suporte. */
  offerSupport: boolean
}

// ── Diagnóstico ───────────────────────────────────────────────────────────────

export type GenerationKind = 'render' | 'edit' | 'video' | 'upscale' | 'vista'

/** Resumo de uma geração, já REDIGIDO no servidor (sem chave/token/stack). */
export interface GenerationSummary {
  kind: GenerationKind
  id: string
  tool: string
  /** normalizado: completed | failed | processing | queued | unknown */
  status: string
  engine?: string | null
  createdAt?: string | null
  errorCode?: string | null
  /** mensagem de erro curta e redigida — nunca stack trace/URL assinada. */
  errorMessage?: string | null
  nodesCharged?: number | null
  nodesRefunded?: number | null
}

/** Problema conhecido mapeado a partir do erro/status. */
export interface KnownIssue {
  id: string
  /** explicação curta da causa provável, na voz do Nodi. */
  cause: string
  /** o que o usuário pode tentar agora. */
  suggestion: string
  /** prioridade sugerida se virar chamado. */
  priority: TicketPriority
}

/** Contexto técnico coletado pro chamado (mostrado ao usuário antes do envio). */
export interface TicketContext {
  route?: string
  module?: string
  projectId?: string
  generationKind?: GenerationKind
  generationId?: string
  engine?: string
  status?: string
  errorCode?: string
  errorMessage?: string
  occurredAt?: string
  nodesCharged?: number
  nodesRefunded?: number
  planId?: string
  browser?: string
  os?: string
  /** enriquecimento da página (extra do NodiContext) */
  extra?: Record<string, string>
}

export interface DiagnosisReport {
  generation?: GenerationSummary | null
  known?: KnownIssue | null
  collected: TicketContext
}

// ── Chamados ──────────────────────────────────────────────────────────────────

export type TicketStatus = 'open' | 'in_review' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TicketCategory =
  | 'generation_failed'
  | 'unexpected_result'
  | 'billing'
  | 'access'
  | 'question'
  | 'other'

/** Rascunho montado pelo fluxo de diagnóstico; vira insert após confirmação. */
export interface TicketDraft {
  title: string
  description: string
  category: TicketCategory
  priority: TicketPriority
  stepsTried?: string
  probableCause?: string
  context: TicketContext
  /** transcrição resumida da conversa (últimos turnos, truncados). */
  transcript?: NodiTurn[]
  generationKind?: GenerationKind
  generationId?: string
}

export interface TicketRecord {
  id: string
  /** protocolo humano: ND-<seq> */
  protocol: string
  status: TicketStatus
  priority: TicketPriority
  category: TicketCategory
  title: string
  createdAt: string
}
