import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { listAlerts } from '@/lib/marketing/ads/service'
import { isAlertStatus } from '@/lib/marketing/ads/workflow'

// Alertas do motor de regras (gasto sem conversão, CPC fora da faixa, …).
// A geração fica em ads/alerts/run (outro fluxo); aqui só leitura.

export async function GET(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const status = req.nextUrl.searchParams.get('status')
    const alerts = await listAlerts(gate.ctx.admin, {
      status: isAlertStatus(status) ? status : undefined,
    })
    return NextResponse.json({ alerts })
  } catch (err) {
    return errorResponse(err)
  }
}
