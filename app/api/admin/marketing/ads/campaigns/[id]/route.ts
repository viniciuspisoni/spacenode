import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import {
  getAdsWithStats,
  getCampaign,
  last30DaysPeriod,
  listAdSets,
  updateCampaign,
} from '@/lib/marketing/ads/service'
import { classifyAds } from '@/lib/marketing/ads/metrics'

type Params = { params: Promise<{ id: string }> }

// Detalhe da campanha: conjuntos + anúncios com métricas do período (30 dias)
// e veredito vencedor/perdedor/amostra insuficiente por anúncio.

export async function GET(_req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const period = last30DaysPeriod()
    const [campaign, adSets, ads] = await Promise.all([
      getCampaign(gate.ctx.admin, id),
      listAdSets(gate.ctx.admin, id),
      getAdsWithStats(gate.ctx.admin, id, period),
    ])
    const verdicts = classifyAds(ads.map(a => ({
      ad_id: a.id,
      identifier: a.identifier,
      totals: a.totals,
      derived: a.derived,
    })))
    return NextResponse.json({ campaign, ad_sets: adSets, ads, verdicts, period })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    const campaign = await updateCampaign(gate.ctx.admin, id, body)
    return NextResponse.json({ campaign })
  } catch (err) {
    return errorResponse(err)
  }
}
