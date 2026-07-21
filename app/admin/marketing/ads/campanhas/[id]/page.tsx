import { notFound } from 'next/navigation'
import { getMarketingStaffContext } from '@/lib/marketing/auth'
import {
  getAdsWithStats,
  getCampaign,
  listAdSets,
  listPendingActions,
} from '@/lib/marketing/ads/service'
import { classifyAds } from '@/lib/marketing/ads/metrics'
import type { AdCampaign, AdPendingAction, AdSet } from '@/lib/marketing/ads/types'
import { CampaignDetailClient, type AdWithVerdict } from '../../_components/CampaignDetailClient'

// Detalhe da campanha: dados via service direto (padrão do painel), incluindo
// stats + veredito por anúncio (classifyAds) e as ações de aprovação da
// entidade — mutações ficam no client via /api/admin/marketing/ads/*.

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

interface PageData {
  campaign: AdCampaign
  adSets: AdSet[]
  ads: AdWithVerdict[]
  pendingActions: AdPendingAction[]
  approvedActions: AdPendingAction[]
}

// Busca fora do JSX: erro de dado (campanha inexistente, schema não aplicado)
// vira notFound; o try/catch não envolve a renderização (react-hooks/error-boundaries).
async function loadPageData(id: string): Promise<PageData | null> {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null

  // Janela de 30 dias — mesma do dashboard; datas em YYYY-MM-DD (metric_date).
  const now = new Date()
  const periodEnd = now.toISOString().slice(0, 10)
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  try {
    const [campaign, adSets, adsWithStats, pendingAll, approvedAll] = await Promise.all([
      getCampaign(ctx.admin, id),
      listAdSets(ctx.admin, id),
      getAdsWithStats(ctx.admin, id, { periodStart, periodEnd }),
      listPendingActions(ctx.admin, { status: 'pending' }),
      listPendingActions(ctx.admin, { status: 'approved' }),
    ])

    // Veredito winner/loser/insufficient calculado no server (módulo puro).
    const verdicts = classifyAds(adsWithStats.map(a => ({
      ad_id: a.id,
      identifier: a.identifier,
      totals: a.totals,
      derived: a.derived,
    })))
    const verdictById = new Map(verdicts.map(v => [v.ad_id, v]))
    const ads: AdWithVerdict[] = adsWithStats.map(a => {
      const v = verdictById.get(a.id)
      return {
        ...a,
        verdict: v?.verdict ?? 'insufficient',
        rationale: v?.rationale ?? 'Amostra insuficiente para veredito',
      }
    })

    // O contrato de listPendingActions filtra só por status — o recorte por
    // entidade (esta campanha) acontece aqui.
    const ofCampaign = (list: AdPendingAction[]) =>
      list.filter(a => a.entity_level === 'campaign' && a.entity_id === id)

    return {
      campaign,
      adSets,
      ads,
      pendingActions: ofCampaign(pendingAll),
      approvedActions: ofCampaign(approvedAll),
    }
  } catch {
    return null
  }
}

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params
  const data = await loadPageData(id)
  if (!data) notFound()

  return (
    <CampaignDetailClient
      campaign={data.campaign}
      adSets={data.adSets}
      ads={data.ads}
      pendingActions={data.pendingActions}
      approvedActions={data.approvedActions}
    />
  )
}
