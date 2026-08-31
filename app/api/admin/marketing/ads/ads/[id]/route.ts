import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { getAd, updateAd } from '@/lib/marketing/ads/service'

type Params = { params: Promise<{ id: string }> }

// Detalhe e edição do anúncio (copy editável só em rascunho/pronto p/ revisão).

export async function GET(_req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const ad = await getAd(gate.ctx.admin, id)
    return NextResponse.json({ ad })
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
    const ad = await updateAd(gate.ctx.admin, id, body)
    return NextResponse.json({ ad })
  } catch (err) {
    return errorResponse(err)
  }
}
