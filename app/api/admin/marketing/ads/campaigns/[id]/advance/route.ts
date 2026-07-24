import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { advanceCampaign, getCampaign } from '@/lib/marketing/ads/service'
import { isCampaignStatus } from '@/lib/marketing/ads/workflow'

type Params = { params: Promise<{ id: string }> }

// Transição de status da campanha. published_paused→active e paused→active
// exigem approved_action_id de uma ad_pending_action aprovada — o sistema
// nunca ativa gasto sozinho.

export async function POST(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    if (!isCampaignStatus(body.to)) throw new Error('Status desconhecido')
    await advanceCampaign(gate.ctx.admin, id, body.to, {
      approvedActionId: typeof body.approved_action_id === 'string' ? body.approved_action_id : undefined,
    })
    const campaign = await getCampaign(gate.ctx.admin, id)
    return NextResponse.json({ campaign })
  } catch (err) {
    return errorResponse(err)
  }
}
