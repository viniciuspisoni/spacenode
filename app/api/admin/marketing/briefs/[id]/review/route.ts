import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { advanceBrief, decideReview, requestReview } from '@/lib/marketing/service'

type Params = { params: Promise<{ id: string }> }

// Ações do fluxo editorial sobre um briefing:
//   { action: 'request' }                          → envia para revisão (versão + registro)
//   { action: 'approve' | 'changes' | 'reject',
//     notes?: string }                             → decisão HUMANA de revisão
//   { action: 'advance', to: string }              → estágios de produção
// Agendar/publicar não existem aqui — bloqueados no serviço (fora do sprint).

export async function POST(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    const action = String(body.action ?? '')
    const userId = gate.ctx.user.id

    switch (action) {
      case 'request': {
        const { version } = await requestReview(gate.ctx.admin, id, userId, body.change_summary ?? null)
        return NextResponse.json({ ok: true, version })
      }
      case 'approve':
        await decideReview(gate.ctx.admin, id, userId, 'approved', body.notes ?? null)
        return NextResponse.json({ ok: true })
      case 'changes':
        await decideReview(gate.ctx.admin, id, userId, 'changes_requested', body.notes ?? null)
        return NextResponse.json({ ok: true })
      case 'reject':
        await decideReview(gate.ctx.admin, id, userId, 'rejected', body.notes ?? null)
        return NextResponse.json({ ok: true })
      case 'advance':
        await advanceBrief(gate.ctx.admin, id, String(body.to ?? ''))
        return NextResponse.json({ ok: true })
      default:
        return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
    }
  } catch (err) {
    return errorResponse(err)
  }
}
