import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { createCampaign, listCampaigns } from '@/lib/marketing/ads/service'
import { isCampaignStatus } from '@/lib/marketing/ads/workflow'
import type { CampaignFront, CampaignObjective, FunnelStage } from '@/lib/marketing/ads/types'

// Campanhas: listagem com filtros e criação (sempre nasce em rascunho —
// publicar/ativar passa pelo fluxo de aprovação).

export async function GET(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const sp = req.nextUrl.searchParams
    const status = sp.get('status')
    const campaigns = await listCampaigns(gate.ctx.admin, {
      status: isCampaignStatus(status) ? status : undefined,
      channel: sp.get('channel') ?? undefined,
      front: sp.get('front') ?? undefined,
    })
    return NextResponse.json({ campaigns })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const campaign = await createCampaign(gate.ctx.admin, {
      name: String(body.name ?? ''),
      channel_slug: String(body.channel_slug ?? ''),
      front: body.front as CampaignFront,
      objective: body.objective as CampaignObjective,
      funnel_stage: body.funnel_stage as FunnelStage,
      persona: String(body.persona ?? ''),
      hypothesis: body.hypothesis ?? null,
      daily_budget_cents: body.daily_budget_cents ?? null,
      lifetime_budget_cents: body.lifetime_budget_cents ?? null,
      notes: body.notes ?? null,
    }, gate.ctx.user.id)
    return NextResponse.json({ campaign }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
