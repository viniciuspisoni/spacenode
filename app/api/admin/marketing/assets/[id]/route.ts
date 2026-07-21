import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { archiveAsset } from '@/lib/marketing/service'

type Params = { params: Promise<{ id: string }> }

// Arquiva um asset (soft delete — o objeto no Storage permanece; limpeza
// definitiva é decisão manual futura).

export async function DELETE(_req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    await archiveAsset(gate.ctx.admin, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
