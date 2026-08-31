import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { createExperiment, listExperiments } from '@/lib/marketing/ads/service'
import { isExperimentStatus } from '@/lib/marketing/ads/workflow'

// Matriz de experimentação: hipótese → critério de sucesso → conclusão.

export async function GET(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const status = req.nextUrl.searchParams.get('status')
    const experiments = await listExperiments(gate.ctx.admin, {
      status: isExperimentStatus(status) ? status : undefined,
    })
    return NextResponse.json({ experiments })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const experiment = await createExperiment(gate.ctx.admin, {
      name: String(body.name ?? ''),
      hypothesis: String(body.hypothesis ?? ''),
      matrix: typeof body.matrix === 'object' && body.matrix !== null ? body.matrix : undefined,
      campaign_id: body.campaign_id ?? null,
      ad_ids: Array.isArray(body.ad_ids) ? body.ad_ids : undefined,
      primary_metric: body.primary_metric ?? undefined,
      success_criteria: body.success_criteria ?? null,
    }, gate.ctx.user.id)
    return NextResponse.json({ experiment }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
