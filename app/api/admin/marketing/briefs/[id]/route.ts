import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { getBriefDetail, updateBrief } from '@/lib/marketing/service'

type Params = { params: Promise<{ id: string }> }

// Detalhe completo (briefing + versões + aprovações + assets + projetos) e
// edição dos campos editoriais (apenas em rascunho/alterações solicitadas).

export async function GET(_req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const detail = await getBriefDetail(gate.ctx.admin, id)
    return NextResponse.json(detail)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    const brief = await updateBrief(gate.ctx.admin, id, body)
    return NextResponse.json({ brief })
  } catch (err) {
    return errorResponse(err)
  }
}
