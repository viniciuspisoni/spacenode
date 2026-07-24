import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { createBrief, listBriefs } from '@/lib/marketing/service'
import { isBriefStatus } from '@/lib/marketing/workflow'

// Briefings: listagem com filtros e criação avulsa (sem ideia de origem).

export async function GET(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const sp = req.nextUrl.searchParams
    const status = sp.get('status')
    const briefs = await listBriefs(gate.ctx.admin, {
      status: isBriefStatus(status) ? status : undefined,
      pillar: sp.get('pillar') ?? undefined,
    })
    return NextResponse.json({ briefs })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const brief = await createBrief(gate.ctx.admin, {
      title: String(body.title ?? ''),
      pillar: body.pillar ?? null,
      format: body.format ?? null,
      platform: body.platform ?? null,
      target_audience: body.target_audience ?? null,
    }, gate.ctx.user.id)
    return NextResponse.json({ brief }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
