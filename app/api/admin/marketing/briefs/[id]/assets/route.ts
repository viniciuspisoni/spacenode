import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { linkGenerationAsset } from '@/lib/marketing/service'

type Params = { params: Promise<{ id: string }> }

// Vincula uma geração real do produto (render/vista) ao briefing. Uploads de
// arquivo próprio passam por /api/admin/marketing/assets/sign + confirm.

export async function POST(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    const kind = String(body.kind ?? '')
    if (kind !== 'render' && kind !== 'vista') {
      return NextResponse.json({ error: 'kind deve ser render ou vista' }, { status: 400 })
    }
    const generationId = String(body.generation_id ?? '')
    if (!generationId) {
      return NextResponse.json({ error: 'generation_id é obrigatório' }, { status: 400 })
    }
    const asset = await linkGenerationAsset(gate.ctx.admin, id, kind, generationId)
    return NextResponse.json({ asset }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
