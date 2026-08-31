import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { createAdSet, listAdSets } from '@/lib/marketing/ads/service'

// Conjuntos de anúncios (campanha × público × orçamento).

export async function GET(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const campaignId = req.nextUrl.searchParams.get('campaign_id')
    if (!campaignId) throw new Error('campaign_id é obrigatório')
    const adSets = await listAdSets(gate.ctx.admin, campaignId)
    return NextResponse.json({ ad_sets: adSets })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const adSet = await createAdSet(gate.ctx.admin, {
      campaign_id: String(body.campaign_id ?? ''),
      name: String(body.name ?? ''),
      audience_id: body.audience_id ?? null,
      audience_segment: body.audience_segment ?? null,
      daily_budget_cents: body.daily_budget_cents ?? null,
      targeting_summary: body.targeting_summary ?? null,
    }, gate.ctx.user.id)
    return NextResponse.json({ ad_set: adSet }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
