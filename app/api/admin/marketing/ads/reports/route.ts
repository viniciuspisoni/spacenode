import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { listReports } from '@/lib/marketing/ads/service'

// Relatórios de tráfego pago: listagem (mais recentes primeiro). A geração fica
// em ./generate (POST) — separada para o painel poder listar sem custo.

export async function GET(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const raw = Number(req.nextUrl.searchParams.get('limit'))
    const limit = Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 100) : undefined
    const reports = await listReports(gate.ctx.admin, limit)
    return NextResponse.json({ reports })
  } catch (err) {
    return errorResponse(err)
  }
}
