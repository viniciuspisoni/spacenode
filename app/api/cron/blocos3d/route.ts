import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { ROW_COLUMNS, reconcileBlocos3DJob, type JobRowWithMeta } from '@/lib/blocos3d/reconcile'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// O poll da interface é imediato; o cron recupera jobs abandonados sem
// competir com os primeiros polls. Lote pequeno limita a duração da função.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString()
  const { data, error } = await admin.from('blocos3d_jobs')
    .select(ROW_COLUMNS)
    .eq('status', 'processing')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(5)
  if (error) {
    console.error('[cron/blocos3d] leitura:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  let completed = 0
  let failed = 0
  let errors = 0
  for (const row of (data ?? []) as unknown as JobRowWithMeta[]) {
    try {
      const current = await reconcileBlocos3DJob(admin, row)
      if (current.status === 'completed') completed++
      if (current.status === 'failed') failed++
    } catch (err) {
      errors++
      console.error('[cron/blocos3d] job:', row.id, err)
    }
  }
  return NextResponse.json({ ok: errors === 0, examined: data?.length ?? 0, completed, failed, errors },
    { status: errors ? 500 : 200 })
}
