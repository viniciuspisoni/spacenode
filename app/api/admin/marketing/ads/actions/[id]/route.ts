import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { decideAction } from '@/lib/marketing/ads/service'

type Params = { params: Promise<{ id: string }> }

// Decisão HUMANA sobre uma ação pendente — aprovar ou rejeitar. A execução
// (ex.: ativar veiculação) referencia a ação aprovada nas rotas de advance.

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    const decision = body.decision
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new Error('Decisão inválida — use approved ou rejected')
    }
    const action = await decideAction(
      gate.ctx.admin, id, gate.ctx.user.id, decision, body.notes ?? null,
    )
    return NextResponse.json({ action })
  } catch (err) {
    return errorResponse(err)
  }
}
