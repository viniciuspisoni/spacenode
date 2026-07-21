import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { createVersion } from '@/lib/marketing/service'

type Params = { params: Promise<{ id: string }> }

// Snapshot manual de versão (fora do envio para revisão, que já cria a sua).

export async function POST(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const version = await createVersion(
      gate.ctx.admin, id, body.change_summary ?? null, gate.ctx.user.id,
    )
    return NextResponse.json({ version }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
