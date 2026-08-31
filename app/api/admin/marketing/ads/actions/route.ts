import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { listPendingActions, requestAction } from '@/lib/marketing/ads/service'
import { isActionStatus } from '@/lib/marketing/ads/workflow'
import type { ActionEntityLevel, ActionType } from '@/lib/marketing/ads/types'

// Fila de aprovação humana: nada muda campanha/gasto sem passar por aqui.
// POST registra a solicitação (pending) — a decisão é via PATCH em [id].

export async function GET(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const status = req.nextUrl.searchParams.get('status')
    const actions = await listPendingActions(gate.ctx.admin, {
      status: isActionStatus(status) ? status : undefined,
    })
    return NextResponse.json({ actions })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const action = await requestAction(gate.ctx.admin, {
      action_type: body.action_type as ActionType,
      entity_level: body.entity_level as ActionEntityLevel,
      entity_id: String(body.entity_id ?? ''),
      payload: typeof body.payload === 'object' && body.payload !== null ? body.payload : undefined,
      reason: body.reason ?? null,
    }, gate.ctx.user.id)
    return NextResponse.json({ action }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
