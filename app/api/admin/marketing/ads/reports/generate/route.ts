import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { defaultReportPeriod, generateAdsReport } from '@/lib/marketing/ads/report'

// Gera (e persiste) o relatório determinístico do período. Sem body ou sem
// datas: últimos 7 dias. Datas explícitas em YYYY-MM-DD — inválidas viram 400
// (nunca defaultamos silenciosamente uma data que o staff digitou errado).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function optDate(v: unknown, label: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'string' || !DATE_RE.test(v)) {
    throw new Error(`${label} inválida — use o formato YYYY-MM-DD`)
  }
  return v
}

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const fallback = defaultReportPeriod(7)
    const periodStart = optDate(body.period_start, 'Data inicial') ?? fallback.periodStart
    const periodEnd = optDate(body.period_end, 'Data final') ?? fallback.periodEnd

    const report = await generateAdsReport(
      gate.ctx.admin,
      { periodStart, periodEnd },
      gate.ctx.user.id,
    )
    return NextResponse.json({ report }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
