import { BRIEF_STATUS_LABELS, IDEA_STATUS_LABELS } from '@/lib/marketing/workflow'

// Badge de status do fluxo editorial. Verde só em estados "aprovado/pronto"
// (funcional — design system); alerta em vermelho/âmbar dos tokens de erro/aviso.

const BRIEF_TONE: Record<string, string> = {
  brief_draft:          'border-border text-text-secondary',
  awaiting_review:      'border-warning-border bg-warning-bg text-warning',
  changes_requested:    'border-warning-border bg-warning-bg text-warning',
  approved:             'border-accent-green-border bg-accent-green-bg text-accent-green',
  rejected:             'border-error-border bg-error-bg text-error',
  ready_for_production: 'border-accent-green-border bg-accent-green-bg text-accent-green',
  asset_production:     'border-border text-text-secondary',
  final_review:         'border-warning-border bg-warning-bg text-warning',
  ready_to_schedule:    'border-accent-green-border bg-accent-green-bg text-accent-green',
  scheduled:            'border-border text-text-secondary',
  published:            'border-border text-text-secondary',
  analyzed:             'border-border text-text-tertiary',
}

const IDEA_TONE: Record<string, string> = {
  open:        'border-border text-text-secondary',
  in_briefing: 'border-warning-border bg-warning-bg text-warning',
  converted:   'border-accent-green-border bg-accent-green-bg text-accent-green',
  archived:    'border-border text-text-tertiary',
}

export function BriefStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${BRIEF_TONE[status] ?? 'border-border text-text-secondary'}`}>
      {BRIEF_STATUS_LABELS[status as keyof typeof BRIEF_STATUS_LABELS] ?? status}
    </span>
  )
}

export function IdeaStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${IDEA_TONE[status] ?? 'border-border text-text-secondary'}`}>
      {IDEA_STATUS_LABELS[status as keyof typeof IDEA_STATUS_LABELS] ?? status}
    </span>
  )
}
