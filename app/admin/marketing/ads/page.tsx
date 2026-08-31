import Link from 'next/link'
import type { ReactNode } from 'react'
import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { getAdsDashboardData } from '@/lib/marketing/ads/service'
import { ACTION_TYPE_LABELS } from '@/lib/marketing/ads/workflow'
import type { MetricValue } from '@/lib/marketing/ads/metrics'
import {
  formatBRLFromCents,
  formatDate,
  formatInt,
  formatMetricBRL,
  formatMetricPercent,
  formatRoas,
} from '@/lib/marketing/ads/format'
import {
  ActionStatusBadge,
  AlertSeverityBadge,
  CampaignStatusBadge,
  SampleNote,
} from './_components/AdBadges'

// Dashboard de tráfego pago: funil consolidado (30d), campanhas com stats,
// alertas abertos e ações aguardando aprovação humana. Leitura direta do
// service com ctx.admin (mesmo padrão de app/admin/marketing/page.tsx);
// mutações acontecem nas rotas /api/admin/marketing/ads/*.

export const dynamic = 'force-dynamic'

function StatCard({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-4">
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-tertiary">
        <span>{label}</span>
        {note}
      </div>
    </div>
  )
}

export default async function AdsDashboardPage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null // layout já bloqueou; aqui só satisfaz o type-narrowing

  const data = await getAdsDashboardData(ctx.admin)
  const t = data.funnel.totals
  const d = data.funnel.derived

  // Etapas do funil com a taxa que liga cada uma à anterior (assinatura é
  // medida sobre cadastros — mesma base do CAC).
  const stages: Array<{ label: string; value: string; rate: MetricValue | null; rateLabel?: string }> = [
    { label: 'Impressões', value: formatInt(t.impressions), rate: null },
    { label: 'Cliques', value: formatInt(t.clicks), rate: d.ctr, rateLabel: 'CTR' },
    { label: 'Cadastros', value: formatInt(t.signups), rate: d.click_to_signup, rateLabel: 'clique → cadastro' },
    { label: 'Ativados', value: formatInt(t.activations), rate: d.signup_to_activation, rateLabel: 'cadastro → ativação' },
    { label: 'Assinaturas', value: formatInt(t.subscriptions), rate: d.signup_to_subscription, rateLabel: 'cadastro → assinatura' },
  ]

  return (
    <div className="space-y-10">
      {data.degraded && (
        <div className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning">
          {data.degraded}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tráfego pago</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Funil de aquisição dos últimos 30 dias. Métricas com amostra insuficiente são exibidas, mas não decidem nada.
          </p>
        </div>
        <Link
          href="/admin/marketing/ads/campanhas"
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface"
        >
          Ver campanhas
        </Link>
      </div>

      {/* ── Indicadores principais ─────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Investimento (30d)" value={formatBRLFromCents(t.spend_cents)} />
        <StatCard label="Cadastros" value={formatInt(t.signups)} />
        <StatCard label="Ativados" value={formatInt(t.activations)} />
        <StatCard label="Assinaturas" value={formatInt(t.subscriptions)} />
        <StatCard
          label="CAC"
          value={formatMetricBRL(d.cac_cents)}
          note={!d.cac_cents.reliable ? <SampleNote note={d.cac_cents.sampleNote} /> : undefined}
        />
        <StatCard label="Receita atribuída" value={formatBRLFromCents(t.revenue_cents)} />
        <StatCard
          label="ROAS"
          value={formatRoas(d.roas.value)}
          note={!d.roas.reliable ? <SampleNote note={d.roas.sampleNote} /> : undefined}
        />
      </section>

      {/* ── Funil por etapa ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-medium text-text-secondary">Funil por etapa</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stages.map(stage => (
            <div key={stage.label} className="rounded-xl border border-border bg-bg-elevated p-4">
              <div className="text-lg font-semibold tracking-tight">{stage.value}</div>
              <div className="mt-0.5 text-xs text-text-tertiary">{stage.label}</div>
              {stage.rate && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
                  <span>{formatMetricPercent(stage.rate, 2)}</span>
                  <span className="text-text-tertiary">{stage.rateLabel}</span>
                  {!stage.rate.reliable && <SampleNote note={stage.rate.sampleNote} />}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Campanhas com desempenho ───────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-medium text-text-secondary">Campanhas</h2>
        {data.campaigns.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
            Nenhuma campanha ainda — crie a primeira em{' '}
            <Link href="/admin/marketing/ads/campanhas" className="underline">Campanhas</Link>.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-bg-elevated">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-tertiary">
                  <th className="px-4 py-2.5 font-medium">Campanha</th>
                  <th className="px-4 py-2.5 font-medium">Canal</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Investimento</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cadastros</th>
                  <th className="px-4 py-2.5 text-right font-medium">CAC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.campaigns.map(c => (
                  <tr key={c.id} className="transition-colors hover:bg-surface">
                    <td className="px-4 py-3">
                      <Link href={`/admin/marketing/ads/campanhas/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <div className="mt-0.5 font-mono text-xs text-text-tertiary">{c.identifier}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{c.channel_slug}</td>
                    <td className="px-4 py-3"><CampaignStatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-right">{formatBRLFromCents(c.totals.spend_cents)}</td>
                    <td className="px-4 py-3 text-right">{formatInt(c.totals.signups)}</td>
                    <td className="px-4 py-3 text-right">
                      <span>{formatMetricBRL(c.derived.cac_cents)}</span>
                      {!c.derived.cac_cents.reliable && (
                        <div><SampleNote note={c.derived.cac_cents.sampleNote} /></div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ── Alertas abertos ──────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-medium text-text-secondary">Alertas abertos</h2>
          <div className="mt-3 rounded-xl border border-border bg-bg-elevated">
            {data.openAlerts.length === 0 ? (
              <p className="p-4 text-sm text-text-tertiary">Nenhum alerta aberto.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.openAlerts.slice(0, 5).map(alert => (
                  <li key={alert.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="text-sm text-text-primary">{alert.message}</div>
                      <div className="mt-0.5 text-xs text-text-tertiary">
                        {alert.alert_type} · {formatDate(alert.created_at)}
                      </div>
                    </div>
                    <AlertSeverityBadge severity={alert.severity} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="space-y-8">
          {/* ── Ações pendentes de aprovação ───────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text-secondary">Ações aguardando aprovação</h2>
              <Link href="/admin/marketing/ads/aprovacao" className="text-xs text-text-tertiary underline hover:text-text-secondary">
                Ver aprovações
              </Link>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-bg-elevated">
              {data.pendingActions.length === 0 ? (
                <p className="p-4 text-sm text-text-tertiary">Nenhuma ação pendente.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.pendingActions.slice(0, 5).map(action => (
                    <li key={action.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0 text-sm text-text-secondary">
                        {ACTION_TYPE_LABELS[action.action_type] ?? action.action_type}
                        <span className="text-xs text-text-tertiary"> · {action.entity_level} · {formatDate(action.created_at)}</span>
                      </div>
                      <ActionStatusBadge status={action.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* ── Último relatório ───────────────────────────────────────────── */}
          <section>
            <h2 className="text-sm font-medium text-text-secondary">Último relatório</h2>
            <div className="mt-3 rounded-xl border border-border bg-bg-elevated p-4">
              {data.latestReport ? (
                <Link href="/admin/marketing/ads/relatorios" className="block hover:underline">
                  <div className="text-sm font-medium">{data.latestReport.title}</div>
                  <div className="mt-0.5 text-xs text-text-tertiary">
                    {formatDate(data.latestReport.period_start)} – {formatDate(data.latestReport.period_end)}
                  </div>
                </Link>
              ) : (
                <p className="text-sm text-text-tertiary">Nenhum relatório gerado ainda.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <p className="text-xs text-text-tertiary">
        Nada é publicado ou ativado sem aprovação humana registrada.
      </p>
    </div>
  )
}
