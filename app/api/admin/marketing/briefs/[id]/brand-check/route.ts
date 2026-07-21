import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { runBriefBrandCheck } from '@/lib/marketing/service'

type Params = { params: Promise<{ id: string }> }

// Verificador de marca: roda sobre o conteúdo atual do briefing, persiste o
// resultado em content_briefs.brand_check e registra a execução. Roda antes da
// revisão humana — nunca no lugar dela.

export async function POST(_req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const result = await runBriefBrandCheck(gate.ctx.admin, id, gate.ctx.user.id)
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
