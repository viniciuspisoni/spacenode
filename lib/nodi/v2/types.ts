// ── Tipos do Nodi V2 ─────────────────────────────────────────────────────────
//
// O orquestrador NUNCA devolve texto solto do modelo como estrutura: artefatos
// (análise, plano, prompt, proposta de ação, memória, chamado) nascem das
// TOOLS server-side, validados, e viajam neste envelope. O painel renderiza
// cards a partir do envelope — nada de parsear texto do modelo no client.

import type { GenerationKind, NodiAction, TicketDraft } from '../types'

// ── Análise multimodal ────────────────────────────────────────────────────────

export type AnalysisSeverity = 'ok' | 'atencao' | 'problema'

export interface AnalysisFinding {
  /** dimensão avaliada (geometria, perspectiva, iluminação, materiais…) */
  dimension: string
  severity: AnalysisSeverity
  note: string
}

export interface AnalysisReport {
  /** o que foi analisado (rótulo curto: "Render · Vega · 2K") */
  subject: string
  /** origem provável do problema dominante */
  blame?: 'entrada' | 'prompt' | 'configuracao' | 'engine' | 'tecnica' | 'nenhum'
  findings: AnalysisFinding[]
  summary: string
  /** comparação original × resultado (quando aplicável) */
  comparison?: { preserved: string[]; changed: string[]; verdict: string }
}

// ── Plano de geração ──────────────────────────────────────────────────────────

export interface PlanStep {
  order: number
  moduleId: string
  moduleLabel: string
  goal: string
  engine?: string
  settings?: Record<string, string>
  estimatedNodes?: number
}

export interface GenerationPlan {
  objective: string
  steps: PlanStep[]
  totalEstimatedNodes?: number
  notes?: string
}

// ── Prompt sugerido ───────────────────────────────────────────────────────────

export interface PromptSuggestion {
  prompt: string
  rationale: string
  /** módulo alvo (renderizar, editar…) — habilita "usar no módulo" */
  moduleId?: string
}

// ── Recomendação de configuração ─────────────────────────────────────────────

export interface ConfigRecommendation {
  moduleId: string
  moduleLabel: string
  engine?: string
  settings: Record<string, string>
  estimatedNodes?: number
  rationale: string
}

// ── Ações supervisionadas (executam SÓ após confirmação no painel) ───────────

export type SupervisedActionType = 'navigate' | 'fill_prompt' | 'apply_settings' | 'start_generation'

export interface GenerationPreflight {
  moduleId: string
  moduleLabel: string
  engine?: string
  settings: Record<string, string>
  prompt?: string
  /** rótulo da imagem de partida (nunca URL) */
  imageLabel?: string
  estimatedNodes: number | null
  balance: number | null
  /** riscos honestos (custo, política de conteúdo, limitações da engine) */
  risks: string[]
}

export interface SupervisedAction {
  id: string
  type: SupervisedActionType
  label: string
  /** navigate: rota interna whitelisted */
  href?: string
  /** fill_prompt / apply_settings / start_generation */
  moduleId?: string
  prompt?: string
  settings?: Record<string, string>
  /** start_generation: pré-voo completo exibido antes da confirmação */
  preflight?: GenerationPreflight
  /** V3: confirmar EXECUTA a geração pelo chat (token de intent assinada). */
  executable?: boolean
  intentToken?: string
}

// ── Memória de projeto (só grava após confirmação) ───────────────────────────

export interface ProjectPlanStep {
  order: number
  moduleId: string
  moduleLabel: string
  goal: string
  status: 'pendente' | 'feita'
  estimatedNodes?: number
}

/** Plano do Projeto (V4) — persistido na memória, gravado só após confirmação. */
export interface ProjectPlan {
  objective: string
  steps: ProjectPlanStep[]
  updatedAt?: string
}

export interface ProjectMemory {
  style?: string
  materials?: string
  lighting?: string
  mainImage?: string
  lockedElements?: string
  decisions?: string[]
  plan?: ProjectPlan
}

export interface MemoryProposal {
  spaceId: string
  patch: ProjectMemory
  reason: string
}

// ── Envelope da resposta V2 ───────────────────────────────────────────────────

export interface NodiV2Usage {
  steps: number
  toolCalls: string[]
  inputTokens: number
  outputTokens: number
  visionCalls: number
  durationMs: number
  model: string
}

export interface NodiV2Answer {
  text: string
  source: 'v2' | 'v2-fallback-v1'
  analysis?: AnalysisReport
  plan?: GenerationPlan
  promptSuggestion?: PromptSuggestion
  recommendation?: ConfigRecommendation
  proposals?: SupervisedAction[]
  memoryProposal?: MemoryProposal
  ticketDraft?: TicketDraft
  /** ações simples da V1 (navigate/link/copy) continuam valendo */
  actions?: NodiAction[]
  /** V4: execução feita pelo próprio fluxo (autopiloto) */
  executed?: { outputUrl: string; renderId: string | null; cost: number; auto: boolean }
  /** V4: avaliação visual pós-execução + decisão determinística */
  review?: { summary: string; decision: string; reason: string; findings: { dimension: string; severity: string; note: string }[] }
  usage?: NodiV2Usage
}

// ── Anexo de imagem da conversa (sempre resolvido server-side por id) ────────

export interface NodiAttachment {
  kind: GenerationKind
  id: string
}
