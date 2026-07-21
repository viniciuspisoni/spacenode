// lib/marketing/workflow.ts
//
// Máquina de status do fluxo editorial (docs/marketing/content-workflow.md).
// O CHECK do banco valida pertencimento; as TRANSIÇÕES válidas são garantidas
// aqui — todo update de status passa por assertTransition (service.ts).
//
// Neste sprint os estágios operados pelo painel vão até ready_to_schedule;
// scheduled/published/analyzed existem para as integrações futuras (n8n,
// Instagram API, PostHog) e nada os aciona automaticamente.

export const IDEA_STATUSES = ['open', 'in_briefing', 'converted', 'archived'] as const
export type IdeaStatus = (typeof IDEA_STATUSES)[number]

export const BRIEF_STATUSES = [
  'brief_draft',
  'awaiting_review',
  'changes_requested',
  'approved',
  'rejected',
  'ready_for_production',
  'asset_production',
  'final_review',
  'ready_to_schedule',
  'scheduled',
  'published',
  'analyzed',
] as const
export type BriefStatus = (typeof BRIEF_STATUSES)[number]

export const APPROVAL_STATUSES = [
  'draft',
  'awaiting_review',
  'changes_requested',
  'approved',
  'rejected',
] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export const PUBLICATION_STATUSES = [
  'planned',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'canceled',
] as const
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number]

// ── Transições válidas de briefing ─────────────────────────────────────────────
const BRIEF_TRANSITIONS: Record<BriefStatus, readonly BriefStatus[]> = {
  brief_draft:          ['awaiting_review'],
  awaiting_review:      ['changes_requested', 'approved', 'rejected'],
  changes_requested:    ['awaiting_review', 'brief_draft'],
  approved:             ['ready_for_production'],
  rejected:             [],                                   // terminal
  ready_for_production: ['asset_production'],
  asset_production:     ['final_review'],
  final_review:         ['ready_to_schedule', 'changes_requested'],
  ready_to_schedule:    ['scheduled'],
  scheduled:            ['published'],
  published:            ['analyzed'],
  analyzed:             [],                                   // terminal
}

const IDEA_TRANSITIONS: Record<IdeaStatus, readonly IdeaStatus[]> = {
  open:        ['in_briefing', 'converted', 'archived'],
  in_briefing: ['converted', 'open', 'archived'],
  converted:   ['archived'],
  archived:    ['open'],                                      // desarquivar
}

export function isBriefStatus(v: unknown): v is BriefStatus {
  return typeof v === 'string' && (BRIEF_STATUSES as readonly string[]).includes(v)
}

export function isIdeaStatus(v: unknown): v is IdeaStatus {
  return typeof v === 'string' && (IDEA_STATUSES as readonly string[]).includes(v)
}

export function canTransitionBrief(from: BriefStatus, to: BriefStatus): boolean {
  return BRIEF_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertBriefTransition(from: BriefStatus, to: BriefStatus): void {
  if (!canTransitionBrief(from, to)) {
    throw new Error(`Transição de status inválida: ${from} → ${to}`)
  }
}

export function canTransitionIdea(from: IdeaStatus, to: IdeaStatus): boolean {
  return IDEA_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertIdeaTransition(from: IdeaStatus, to: IdeaStatus): void {
  if (!canTransitionIdea(from, to)) {
    throw new Error(`Transição de status inválida: ${from} → ${to}`)
  }
}

/** Próximos status possíveis a partir do atual (para a UI oferecer só o válido). */
export function nextBriefStatuses(from: BriefStatus): readonly BriefStatus[] {
  return BRIEF_TRANSITIONS[from] ?? []
}

// ── Labels de exibição (painel, PT-BR) ─────────────────────────────────────────
export const BRIEF_STATUS_LABELS: Record<BriefStatus, string> = {
  brief_draft:          'Rascunho',
  awaiting_review:      'Aguardando revisão',
  changes_requested:    'Alterações solicitadas',
  approved:             'Aprovado',
  rejected:             'Rejeitado',
  ready_for_production: 'Pronto para produção',
  asset_production:     'Produção de assets',
  final_review:         'Revisão final',
  ready_to_schedule:    'Pronto para agendar',
  scheduled:            'Agendado',
  published:            'Publicado',
  analyzed:             'Analisado',
}

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  open:        'Aberta',
  in_briefing: 'Em briefing',
  converted:   'Convertida',
  archived:    'Arquivada',
}

export const IDEA_PRIORITY_LABELS: Record<string, string> = {
  low:    'Baixa',
  normal: 'Normal',
  high:   'Alta',
  urgent: 'Urgente',
}
