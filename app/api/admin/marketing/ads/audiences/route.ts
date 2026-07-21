import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { createAudience, listAudiences } from '@/lib/marketing/ads/service'

// Públicos/personas da matriz de experimentação.

export async function GET() {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const audiences = await listAudiences(gate.ctx.admin)
    return NextResponse.json({ audiences })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const audience = await createAudience(gate.ctx.admin, {
      slug: String(body.slug ?? ''),
      name: String(body.name ?? ''),
      description: body.description ?? null,
      pains: Array.isArray(body.pains) ? body.pains : undefined,
      tools: Array.isArray(body.tools) ? body.tools : undefined,
      targeting: typeof body.targeting === 'object' && body.targeting !== null ? body.targeting : undefined,
    }, gate.ctx.user.id)
    return NextResponse.json({ audience }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
