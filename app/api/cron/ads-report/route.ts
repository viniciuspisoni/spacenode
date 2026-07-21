import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { defaultReportPeriod, generateAdsReport } from '@/lib/marketing/ads/report'

// Cron semanal (vercel.json): gera o relatório dos últimos 7 dias e persiste
// em marketing.ad_reports. created_by null = geração automática (distingue de
// relatório disparado manualmente por um staff no painel).

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  try {
    const admin = createAdminClient()
    const period = defaultReportPeriod(7)
    const report = await generateAdsReport(admin, period, null)
    return NextResponse.json({ ok: true, report_id: report.id, period })
  } catch (err) {
    console.error('[cron/ads-report]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    )
  }
}
