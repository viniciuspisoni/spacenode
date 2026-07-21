import Link from 'next/link'
import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listBriefs } from '@/lib/marketing/service'
import { BRIEF_STATUSES, BRIEF_STATUS_LABELS, isBriefStatus } from '@/lib/marketing/workflow'
import { formatLabel, pillarLabel } from '@/lib/marketing/catalog'
import { BriefStatusBadge } from '../_components/StatusBadge'
import { NewBriefButton } from '../_components/NewBriefButton'

// Lista de briefings com filtro por status (?status=). A edição acontece na
// página do briefing.

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ status?: string }> }

export default async function BriefingsPage({ searchParams }: Props) {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null

  const { status } = await searchParams
  const filter = isBriefStatus(status ?? '') ? (status as (typeof BRIEF_STATUSES)[number]) : undefined
  const briefs = await listBriefs(ctx.admin, { status: filter })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Briefings</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {filter ? `Filtrando por: ${BRIEF_STATUS_LABELS[filter]}` : 'Todos os briefings.'}
          </p>
        </div>
        <NewBriefButton />
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <Link
          href="/admin/marketing/briefings"
          className={`rounded-full border px-3 py-1 transition-colors ${!filter ? 'border-border-strong bg-surface text-text-primary' : 'border-border text-text-tertiary hover:text-text-secondary'}`}
        >
          Todos
        </Link>
        {BRIEF_STATUSES.map(s => (
          <Link
            key={s}
            href={`/admin/marketing/briefings?status=${s}`}
            className={`rounded-full border px-3 py-1 transition-colors ${filter === s ? 'border-border-strong bg-surface text-text-primary' : 'border-border text-text-tertiary hover:text-text-secondary'}`}
          >
            {BRIEF_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {briefs.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
          Nenhum briefing {filter ? `em "${BRIEF_STATUS_LABELS[filter]}"` : ''} — crie um novo ou converta uma ideia.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
          {briefs.map(brief => (
            <Link
              key={brief.id}
              href={`/admin/marketing/briefings/${brief.id}`}
              className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-surface"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{brief.title}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-tertiary">
                  <span>{pillarLabel(brief.pillar)}</span>
                  <span>{formatLabel(brief.format)}</span>
                  <span>{new Date(brief.updated_at).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
              <BriefStatusBadge status={brief.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
