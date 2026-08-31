import Link from 'next/link'
import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listBriefs } from '@/lib/marketing/service'
import { BriefStatusBadge } from '../_components/StatusBadge'

// Fila de aprovação: briefings aguardando revisão editorial ou revisão final.
// As ações (aprovar / solicitar alterações / rejeitar) ficam na página do
// briefing, onde o revisor vê conteúdo, versões, assets e observações juntos.

export const dynamic = 'force-dynamic'

export default async function ApprovalQueuePage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null

  const briefs = await listBriefs(ctx.admin, { statuses: ['awaiting_review', 'final_review'] })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Aprovação</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Revisão humana obrigatória — o verificador de marca prepara, mas nunca decide.
        </p>
      </div>

      {briefs.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
          Fila vazia. Briefings enviados para revisão aparecem aqui.
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
                  <span>{brief.pillar ?? 'sem pilar'}</span>
                  <span>{brief.format ?? 'sem formato'}</span>
                  <span>atualizado {new Date(brief.updated_at).toLocaleDateString('pt-BR')}</span>
                  {brief.brand_check && (
                    <span className={brief.brand_check.approved ? 'text-accent-green' : 'text-warning'}>
                      verificação: {brief.brand_check.score}/100
                    </span>
                  )}
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
