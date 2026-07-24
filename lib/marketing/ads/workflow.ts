// lib/marketing/ads/workflow.ts
//
// Máquinas de status do sistema de mídia paga (schema marketing.ad_*).
// Mesmo desenho de lib/marketing/workflow.ts: o CHECK do banco valida
// pertencimento; as TRANSIÇÕES válidas são garantidas aqui — todo update de
// status passa por assert*Transition no service.
//
// REGRA DURA (docs/marketing/prohibited-content.md §7): campanha/anúncio pago
// NUNCA nasce ativo. `active` só é alcançável a partir de published_paused ou
// paused, e o service exige uma ação humana aprovada (ad_pending_actions) para
// essas transições — ver ACTIVATION_REQUIRES_APPROVAL.

export const CAMPAIGN_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'published_paused',
  'active',
  'paused',
  'completed',
  'archived',
] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const AD_STATUSES = [
  'draft',
  'ready_for_review',
  'pending_approval',
  'approved',
  'published_paused',
  'active',
  'paused',
  'ended',
  'archived',
] as const
export type AdStatus = (typeof AD_STATUSES)[number]

export const EXPERIMENT_STATUSES = [
  'planned',
  'running',
  'validated',
  'invalidated',
  'inconclusive',
  'abandoned',
] as const
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number]

export const ACTION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'executed',
  'failed',
  'canceled',
] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]

export const ALERT_STATUSES = ['open', 'acknowledged', 'resolved', 'dismissed'] as const
export type AlertStatus = (typeof ALERT_STATUSES)[number]

// ── Transições ─────────────────────────────────────────────────────────────────

const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft:            ['pending_approval', 'archived'],
  pending_approval: ['approved', 'draft'],
  approved:         ['published_paused', 'draft', 'archived'],
  // publicada no gerenciador SEMPRE pausada; ativar exige ação aprovada
  published_paused: ['active', 'archived'],
  active:           ['paused', 'completed'],
  paused:           ['active', 'completed', 'archived'],
  completed:        ['archived'],
  archived:         [],                                    // terminal
}

const AD_TRANSITIONS: Record<AdStatus, readonly AdStatus[]> = {
  draft:            ['ready_for_review', 'archived'],
  ready_for_review: ['pending_approval', 'draft'],
  pending_approval: ['approved', 'draft'],
  approved:         ['published_paused', 'draft', 'archived'],
  published_paused: ['active', 'archived'],
  active:           ['paused', 'ended'],
  paused:           ['active', 'ended', 'archived'],
  ended:            ['archived'],
  archived:         [],                                    // terminal
}

const EXPERIMENT_TRANSITIONS: Record<ExperimentStatus, readonly ExperimentStatus[]> = {
  planned:      ['running', 'abandoned'],
  running:      ['validated', 'invalidated', 'inconclusive', 'abandoned'],
  // inconclusivo pode voltar a rodar (mais amostra) ou ser concluído depois
  inconclusive: ['running', 'validated', 'invalidated', 'abandoned'],
  validated:    [],                                        // terminal
  invalidated:  [],                                        // terminal
  abandoned:    [],                                        // terminal
}

const ACTION_TRANSITIONS: Record<ActionStatus, readonly ActionStatus[]> = {
  pending:  ['approved', 'rejected', 'canceled'],
  approved: ['executed', 'failed', 'canceled'],
  rejected: [],                                            // terminal
  executed: [],                                            // terminal
  failed:   ['pending'],                                   // re-solicitar após falha
  canceled: [],                                            // terminal
}

/** Transições de campanha/anúncio que mexem em gasto real — o service só as
 *  executa referenciando uma ad_pending_action com status approved. */
export const ACTIVATION_REQUIRES_APPROVAL: ReadonlySet<string> = new Set([
  'published_paused→active',
  'paused→active',
])

// ── Guards e asserts ───────────────────────────────────────────────────────────

export function isCampaignStatus(v: unknown): v is CampaignStatus {
  return typeof v === 'string' && (CAMPAIGN_STATUSES as readonly string[]).includes(v)
}
export function isAdStatus(v: unknown): v is AdStatus {
  return typeof v === 'string' && (AD_STATUSES as readonly string[]).includes(v)
}
export function isExperimentStatus(v: unknown): v is ExperimentStatus {
  return typeof v === 'string' && (EXPERIMENT_STATUSES as readonly string[]).includes(v)
}
export function isActionStatus(v: unknown): v is ActionStatus {
  return typeof v === 'string' && (ACTION_STATUSES as readonly string[]).includes(v)
}
export function isAlertStatus(v: unknown): v is AlertStatus {
  return typeof v === 'string' && (ALERT_STATUSES as readonly string[]).includes(v)
}

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[from]?.includes(to) ?? false
}
export function assertCampaignTransition(from: CampaignStatus, to: CampaignStatus): void {
  if (!canTransitionCampaign(from, to)) {
    throw new Error(`Transição de status inválida: ${from} → ${to}`)
  }
}
export function canTransitionAd(from: AdStatus, to: AdStatus): boolean {
  return AD_TRANSITIONS[from]?.includes(to) ?? false
}
export function assertAdTransition(from: AdStatus, to: AdStatus): void {
  if (!canTransitionAd(from, to)) {
    throw new Error(`Transição de status inválida: ${from} → ${to}`)
  }
}
export function canTransitionExperiment(from: ExperimentStatus, to: ExperimentStatus): boolean {
  return EXPERIMENT_TRANSITIONS[from]?.includes(to) ?? false
}
export function assertExperimentTransition(from: ExperimentStatus, to: ExperimentStatus): void {
  if (!canTransitionExperiment(from, to)) {
    throw new Error(`Transição de status inválida: ${from} → ${to}`)
  }
}
export function canTransitionAction(from: ActionStatus, to: ActionStatus): boolean {
  return ACTION_TRANSITIONS[from]?.includes(to) ?? false
}
export function assertActionTransition(from: ActionStatus, to: ActionStatus): void {
  if (!canTransitionAction(from, to)) {
    throw new Error(`Transição de status inválida: ${from} → ${to}`)
  }
}

/** true quando a transição mexe em gasto real e exige ação aprovada. */
export function transitionRequiresApproval(from: string, to: string): boolean {
  return ACTIVATION_REQUIRES_APPROVAL.has(`${from}→${to}`)
}

export function nextCampaignStatuses(from: CampaignStatus): readonly CampaignStatus[] {
  return CAMPAIGN_TRANSITIONS[from] ?? []
}
export function nextAdStatuses(from: AdStatus): readonly AdStatus[] {
  return AD_TRANSITIONS[from] ?? []
}
export function nextExperimentStatuses(from: ExperimentStatus): readonly ExperimentStatus[] {
  return EXPERIMENT_TRANSITIONS[from] ?? []
}

// ── Labels de exibição (painel, PT-BR) ─────────────────────────────────────────

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft:            'Rascunho',
  pending_approval: 'Aguardando aprovação',
  approved:         'Aprovada',
  published_paused: 'Publicada (pausada)',
  active:           'Ativa',
  paused:           'Pausada',
  completed:        'Concluída',
  archived:         'Arquivada',
}

export const AD_STATUS_LABELS: Record<AdStatus, string> = {
  draft:            'Rascunho',
  ready_for_review: 'Pronto para revisão',
  pending_approval: 'Aguardando aprovação',
  approved:         'Aprovado',
  published_paused: 'Publicado (pausado)',
  active:           'Ativo',
  paused:           'Pausado',
  ended:            'Encerrado',
  archived:         'Arquivado',
}

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  planned:      'Planejado',
  running:      'Em andamento',
  validated:    'Hipótese validada',
  invalidated:  'Hipótese refutada',
  inconclusive: 'Inconclusivo (amostra insuficiente)',
  abandoned:    'Abandonado',
}

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  pending:  'Pendente',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  executed: 'Executada',
  failed:   'Falhou',
  canceled: 'Cancelada',
}

export const ACTION_TYPE_LABELS: Record<string, string> = {
  publish_campaign: 'Publicar campanha (pausada)',
  activate:         'Ativar veiculação',
  pause:            'Pausar veiculação',
  resume:           'Retomar veiculação',
  increase_budget:  'Aumentar orçamento',
  decrease_budget:  'Reduzir orçamento',
  edit_targeting:   'Alterar segmentação',
  archive_campaign: 'Arquivar campanha',
  other:            'Outra ação',
}

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  open:         'Aberto',
  acknowledged: 'Visto',
  resolved:     'Resolvido',
  dismissed:    'Descartado',
}

export const FRONT_LABELS: Record<string, string> = {
  problema:     'Problema',
  demonstracao: 'Demonstração',
  produto:      'Produto',
  conversao:    'Conversão',
}

export const FUNNEL_STAGE_LABELS: Record<string, string> = {
  topo:        'Topo de funil',
  meio:        'Meio de funil',
  fundo:       'Fundo de funil',
  remarketing: 'Remarketing',
}

export const OBJECTIVE_LABELS: Record<string, string> = {
  prospeccao:      'Prospecção',
  demonstracao:    'Demonstração',
  conversao:       'Conversão',
  remarketing:     'Remarketing',
  reconhecimento:  'Reconhecimento',
}
