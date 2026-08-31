import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { advanceAd, getAd } from '@/lib/marketing/ads/service'
import { isAdStatus } from '@/lib/marketing/ads/workflow'

type Params = { params: Promise<{ id: string }> }

// Transição de status do anúncio. published_paused→active e paused→active
// exigem approved_action_id de uma ad_pending_action aprovada.

export async function POST(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    if (!isAdStatus(body.to)) throw new Error('Status desconhecido')
    await advanceAd(gate.ctx.admin, id, body.to, {
      approvedActionId: typeof body.approved_action_id === 'string' ? body.approved_action_id : undefined,
    })
    const ad = await getAd(gate.ctx.admin, id)
    return NextResponse.json({ ad })
  } catch (err) {
    return errorResponse(err)
  }
}
