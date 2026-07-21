import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { runAlertScan } from '@/lib/marketing/ads/alerts'

// Cron diário (vercel.json): varre campanhas/anúncios/landing pages em busca
// de anomalias e persiste alertas (dedupe contra open/acknowledged já embutido
// no service). Alertas só RECOMENDAM — nenhuma ação de campanha/orçamento
// acontece aqui.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  try {
    const result = await runAlertScan(createAdminClient())
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/ads-alerts]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    )
  }
}
