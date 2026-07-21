import Link from 'next/link'
import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listCampaigns } from '@/lib/marketing/ads/service'
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  FRONT_LABELS,
  isCampaignStatus,
  type CampaignStatus,
} from '@/lib/marketing/ads/workflow'
import { formatBRLFromCents, formatDate } from '@/lib/marketing/ads/format'
import { CampaignStatusBadge } from '../_components/AdBadges'
import { NewCampaignButton } from '../_components/NewCampaignButton'

// Lista de campanhas com filtro por status (?status=), mesmo desenho de
// app/admin/marketing/briefings/page.tsx. Criação inline; edição e fluxo de
// status acontecem na página da campanha.

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ status?: string }> }

export default async function CampanhasPage({ searchParams }: Props) {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null

  const { status } = await searchParams
  const filter: CampaignStatus | undefined = isCampaignStatus(status ?? '') ? (status as CampaignStatus) : undefined
  const campaigns = await listCampaigns(ctx.admin, { status: filter })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Campanhas</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {filter ? `Filtrando por: ${CAMPAIGN_STATUS_LABELS[filter]}` : 'Todas as campanhas de tráfego pago.'}
          </p>
        </div>
        <NewCampaignButton />
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <Link
          href="/admin/marketing/ads/campanhas"
          className={`rounded-full border px-3 py-1 transition-colors ${!filter ? 'border-border-strong bg-surface text-text-primary' : 'border-border text-text-tertiary hover:text-text-secondary'}`}
        >
          Todas
        </Link>
        {CAMPAIGN_STATUSES.map(s => (
          <Link
            key={s}
            href={`/admin/marketing/ads/campanhas?status=${s}`}
            className={`rounded-full border px-3 py-1 transition-colors ${filter === s ? 'border-border-strong bg-surface text-text-primary' : 'border-border text-text-tertiary hover:text-text-secondary'}`}
          >
            {CAMPAIGN_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
          Nenhuma campanha {filter ? `em "${CAMPAIGN_STATUS_LABELS[filter]}"` : ''} — crie uma nova para começar.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-tertiary">
                <th className="px-4 py-2.5 font-medium">Campanha</th>
                <th className="px-4 py-2.5 font-medium">Canal</th>
                <th className="px-4 py-2.5 font-medium">Frente</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Orçamento diário</th>
                <th className="px-4 py-2.5 text-right font-medium">Criada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map(c => (
                <tr key={c.id} className="transition-colors hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/admin/marketing/ads/campanhas/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <div className="mt-0.5 font-mono text-xs text-text-tertiary">{c.identifier}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{c.channel_slug}</td>
                  <td className="px-4 py-3 text-text-secondary">{FRONT_LABELS[c.front] ?? c.front}</td>
                  <td className="px-4 py-3"><CampaignStatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-right">{formatBRLFromCents(c.daily_budget_cents)}</td>
                  <td className="px-4 py-3 text-right text-text-tertiary">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
