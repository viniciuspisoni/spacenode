import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { updateExperiment } from '@/lib/marketing/ads/service'

type Params = { params: Promise<{ id: string }> }

// Edição de experimento — campos + status via máquina de transições
// (validated/invalidated exigem conclusão preenchida, validado no service).

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    const experiment = await updateExperiment(gate.ctx.admin, id, body)
    return NextResponse.json({ experiment })
  } catch (err) {
    return errorResponse(err)
  }
}
