import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { updateIdea } from '@/lib/marketing/service'

type Params = { params: Promise<{ id: string }> }

// Edição de ideia (campos editoriais + mudança de status, incl. arquivar).

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    const idea = await updateIdea(gate.ctx.admin, id, body)
    return NextResponse.json({ idea })
  } catch (err) {
    return errorResponse(err)
  }
}
