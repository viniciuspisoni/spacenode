import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { updateLandingPage } from '@/lib/marketing/ads/service'

type Params = { params: Promise<{ id: string }> }

// Edição de landing page — campos + publicar/arquivar via patch.status
// (draft/published/archived, validado no service). Slug é imutável: é a URL
// usada nos anúncios publicados.

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    const page = await updateLandingPage(gate.ctx.admin, id, body)
    return NextResponse.json({ page })
  } catch (err) {
    return errorResponse(err)
  }
}
