import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { createIdea, listIdeas } from '@/lib/marketing/service'
import { isIdeaStatus } from '@/lib/marketing/workflow'

// Biblioteca de ideias: listagem com filtros e criação.

export async function GET(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const sp = req.nextUrl.searchParams
    const status = sp.get('status')
    const ideas = await listIdeas(gate.ctx.admin, {
      status: isIdeaStatus(status) ? status : undefined,
      pillar: sp.get('pillar') ?? undefined,
      priority: sp.get('priority') ?? undefined,
    })
    return NextResponse.json({ ideas })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const idea = await createIdea(gate.ctx.admin, {
      title: String(body.title ?? ''),
      description: body.description ?? null,
      pillar: body.pillar ?? null,
      objective: body.objective ?? null,
      target_audience: body.target_audience ?? null,
      source: body.source ?? null,
      priority: typeof body.priority === 'string' ? body.priority : undefined,
    }, gate.ctx.user.id)
    return NextResponse.json({ idea }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
