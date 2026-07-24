import {
  AD_STATUS_LABELS,
  ACTION_STATUS_LABELS,
  CAMPAIGN_STATUS_LABELS,
  EXPERIMENT_STATUS_LABELS,
} from '@/lib/marketing/ads/workflow'

// Badges de status do sistema de tráfego. Mesmo desenho de
// app/admin/marketing/_components/StatusBadge.tsx: verde só em estados
// aprovado/ativo (funcional); âmbar em pendências; vermelho em falha/rejeição.

const PILL = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium'

const CAMPAIGN_TONE: Record<string, string> = {
  draft:            'border-border text-text-secondary',
  pending_approval: 'border-warning-border bg-warning-bg text-warning',
  approved:         'border-accent-green-border bg-accent-green-bg text-accent-green',
  published_paused: 'border-border text-text-secondary',
  active:           'border-accent-green-border bg-accent-green-bg text-accent-green',
  paused:           'border-warning-border bg-warning-bg text-warning',
  completed:        'border-border text-text-tertiary',
  archived:         'border-border text-text-tertiary',
}

const AD_TONE: Record<string, string> = {
  draft:            'border-border text-text-secondary',
  ready_for_review: 'border-warning-border bg-warning-bg text-warning',
  pending_approval: 'border-warning-border bg-warning-bg text-warning',
  approved:         'border-accent-green-border bg-accent-green-bg text-accent-green',
  published_paused: 'border-border text-text-secondary',
  active:           'border-accent-green-border bg-accent-green-bg text-accent-green',
  paused:           'border-warning-border bg-warning-bg text-warning',
  ended:            'border-border text-text-tertiary',
  archived:         'border-border text-text-tertiary',
}

const EXPERIMENT_TONE: Record<string, string> = {
  planned:      'border-border text-text-secondary',
  running:      'border-warning-border bg-warning-bg text-warning',
  validated:    'border-accent-green-border bg-accent-green-bg text-accent-green',
  invalidated:  'border-error-border bg-error-bg text-error',
  inconclusive: 'border-border text-text-tertiary',
  abandoned:    'border-border text-text-tertiary',
}

const ACTION_TONE: Record<string, string> = {
  pending:  'border-warning-border bg-warning-bg text-warning',
  approved: 'border-accent-green-border bg-accent-green-bg text-accent-green',
  rejected: 'border-error-border bg-error-bg text-error',
  executed: 'border-accent-green-border bg-accent-green-bg text-accent-green',
  failed:   'border-error-border bg-error-bg text-error',
  canceled: 'border-border text-text-tertiary',
}

const SEVERITY_TONE: Record<string, string> = {
  info:     'border-border text-text-secondary',
  warning:  'border-warning-border bg-warning-bg text-warning',
  critical: 'border-error-border bg-error-bg text-error',
}

const SEVERITY_LABELS: Record<string, string> = {
  info:     'Info',
  warning:  'Atenção',
  critical: 'Crítico',
}

export function CampaignStatusBadge({ status }: { status: string }) {
  return (
    <span className={`${PILL} ${CAMPAIGN_TONE[status] ?? 'border-border text-text-secondary'}`}>
      {CAMPAIGN_STATUS_LABELS[status as keyof typeof CAMPAIGN_STATUS_LABELS] ?? status}
    </span>
  )
}

export function AdStatusBadge({ status }: { status: string }) {
  return (
    <span className={`${PILL} ${AD_TONE[status] ?? 'border-border text-text-secondary'}`}>
      {AD_STATUS_LABELS[status as keyof typeof AD_STATUS_LABELS] ?? status}
    </span>
  )
}

export function ExperimentStatusBadge({ status }: { status: string }) {
  return (
    <span className={`${PILL} ${EXPERIMENT_TONE[status] ?? 'border-border text-text-secondary'}`}>
      {EXPERIMENT_STATUS_LABELS[status as keyof typeof EXPERIMENT_STATUS_LABELS] ?? status}
    </span>
  )
}

export function ActionStatusBadge({ status }: { status: string }) {
  return (
    <span className={`${PILL} ${ACTION_TONE[status] ?? 'border-border text-text-secondary'}`}>
      {ACTION_STATUS_LABELS[status as keyof typeof ACTION_STATUS_LABELS] ?? status}
    </span>
  )
}

export function AlertSeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`${PILL} ${SEVERITY_TONE[severity] ?? 'border-border text-text-secondary'}`}>
      {SEVERITY_LABELS[severity] ?? severity}
    </span>
  )
}

/** Nota de amostra insuficiente ao lado de uma métrica. */
export function SampleNote({ note }: { note?: string }) {
  if (!note) return null
  return <span className="text-[11px] text-text-tertiary" title={note}>amostra insuficiente</span>
}
