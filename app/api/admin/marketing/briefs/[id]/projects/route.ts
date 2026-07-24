import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { linkProject, updateProjectLink } from '@/lib/marketing/service'

type Params = { params: Promise<{ id: string }> }

// Vincula o briefing a projeto/gerações do produto com estado de permissão de
// uso (pré-requisito de produção quando o material é de cliente).

export async function POST(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    const link = await linkProject(gate.ctx.admin, id, {
      projectId: body.project_id ?? null,
      generationIds: Array.isArray(body.generation_ids) ? body.generation_ids : [],
      permissionStatus: body.permission_status ?? 'pending',
      notes: body.notes ?? null,
    })
    return NextResponse.json({ link }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    await params // rota aninhada no briefing; o alvo é o vínculo (link_id)
    const body = await req.json()
    const linkId = String(body.link_id ?? '')
    if (!linkId) return NextResponse.json({ error: 'link_id é obrigatório' }, { status: 400 })
    await updateProjectLink(gate.ctx.admin, linkId, {
      permissionStatus: body.permission_status,
      notes: body.notes,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
