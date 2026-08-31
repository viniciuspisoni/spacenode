import { NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { runAlertScan } from '@/lib/marketing/ads/alerts'

// Dispara o motor de regras de alertas sob demanda (o painel tem o botão;
// agendamento futuro reusa esta mesma função). Alertas só RECOMENDAM — qualquer
// ação sobre campanha/gasto passa pela fila de aprovação humana.

export async function POST() {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const result = await runAlertScan(gate.ctx.admin)
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
