import Link from 'next/link'
import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { getDashboardData } from '@/lib/marketing/service'
import { BriefStatusBadge } from './_components/StatusBadge'

// Dashboard editorial: visão do funil (ideias → briefings → aprovação →
// produção), calendário futuro (publicações planejadas) e atividade recente.

export const dynamic = 'force-dynamic'

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-bg-elevated p-4 transition-colors hover:border-border-strong"
    >
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-text-tertiary">{label}</div>
    </Link>
  )
}

export default async function MarketingDashboardPage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null // layout já bloqueou; aqui só satisfaz o type-narrowing

  const data = await getDashboardData(ctx.admin)
  const b = data.briefCounts
  const producing = (b['ready_for_production'] ?? 0) + (b['asset_production'] ?? 0) + (b['final_review'] ?? 0)

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard editorial</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Do registro da ideia à peça pronta para agendar. Publicação continua manual — nada sai sem revisão humana.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Ideias em aberto" value={data.ideaCounts['open'] ?? 0} href="/admin/marketing/ideias?status=open" />
        <StatCard label="Rascunhos de briefing" value={b['brief_draft'] ?? 0} href="/admin/marketing/briefings?status=brief_draft" />
        <StatCard label="Aguardando aprovação" value={b['awaiting_review'] ?? 0} href="/admin/marketing/aprovacao" />
        <StatCard label="Aprovados" value={b['approved'] ?? 0} href="/admin/marketing/briefings?status=approved" />
        <StatCard label="Em produção" value={producing} href="/admin/marketing/briefings" />
        <StatCard label="Prontos para agendar" value={b['ready_to_schedule'] ?? 0} href="/admin/marketing/briefings?status=ready_to_schedule" />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-sm font-medium text-text-secondary">Atividade recente</h2>
          <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-bg-elevated">
            {data.recentBriefs.length === 0 && (
              <p className="p-4 text-sm text-text-tertiary">
                Nenhum briefing ainda — comece registrando uma <Link href="/admin/marketing/ideias" className="underline">ideia</Link>.
              </p>
            )}
            {data.recentBriefs.map(brief => (
              <Link
                key={brief.id}
                href={`/admin/marketing/briefings/${brief.id}`}
                className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-surface"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">{brief.title}</div>
                  <div className="mt-0.5 text-xs text-text-tertiary">
                    {brief.pillar ?? 'sem pilar'} · {new Date(brief.updated_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <BriefStatusBadge status={brief.status} />
              </Link>
            ))}
          </div>
        </section>

        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-medium text-text-secondary">Calendário futuro</h2>
            <div className="mt-3 rounded-xl border border-border bg-bg-elevated">
              {data.upcomingPublications.length === 0 ? (
                <p className="p-4 text-sm text-text-tertiary">
                  Nenhuma publicação planejada. Agendamento e publicação entram com as integrações futuras
                  (n8n / Instagram API) — a estrutura já está pronta.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.upcomingPublications.map(pub => (
                    <li key={pub.id} className="flex items-center justify-between p-3 text-sm">
                      <span className="text-text-secondary">{pub.platform}</span>
                      <span className="text-xs text-text-tertiary">
                        {pub.scheduled_at ? new Date(pub.scheduled_at).toLocaleString('pt-BR') : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-text-secondary">Automações recentes</h2>
            <div className="mt-3 rounded-xl border border-border bg-bg-elevated">
              {data.recentRuns.length === 0 ? (
                <p className="p-4 text-sm text-text-tertiary">Nenhuma execução registrada.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentRuns.map(run => (
                    <li key={run.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <span className="text-text-secondary">
                        {run.run_type}
                        {run.model ? <span className="text-text-tertiary"> · {run.model}</span> : null}
                      </span>
                      <span className={`text-xs ${run.status === 'failed' ? 'text-error' : 'text-text-tertiary'}`}>
                        {run.status === 'succeeded' ? 'ok' : run.status} · {new Date(run.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
