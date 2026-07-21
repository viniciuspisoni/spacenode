import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { ideaToBrief } from '@/lib/marketing/service'

type Params = { params: Promise<{ id: string }> }

// Transforma uma ideia em briefing (rascunho) e marca a ideia como convertida.

export async function POST(_req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const brief = await ideaToBrief(gate.ctx.admin, id, gate.ctx.user.id)
    return NextResponse.json({ brief }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
