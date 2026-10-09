import { NextResponse } from 'next/server'
import { staffOr404 } from '@/lib/marketing/api'
import { validMonth } from '@/lib/costs/aggregate'
import { loadCostsDashboard } from '@/lib/costs/service'

export const maxDuration = 60
export async function GET(req: Request) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  const month = new URL(req.url).searchParams.get('month') ?? ''
  if (!validMonth(month)) return NextResponse.json({ error: 'Informe um mês válido.' }, { status: 400 })
  try { return NextResponse.json(await loadCostsDashboard(gate.ctx.admin, month), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch { return NextResponse.json({ error: 'Não foi possível consultar o painel de custos.' }, { status: 503 }) }
}
