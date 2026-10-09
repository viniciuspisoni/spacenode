// Poll autenticado; a finalização também é executada pelo cron para jobs cujo
// usuário fechou a página. A leitura inicial respeita a RLS do dono.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROW_COLUMNS, reconcileBlocos3DJob, type JobRowWithMeta } from '@/lib/blocos3d/reconcile'
import { toJobView } from '@/lib/blocos3d/view'

export const maxDuration = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = { params: Promise<{ jobId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { jobId } = await params
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase.from('blocos3d_jobs')
    .select(ROW_COLUMNS).eq('id', jobId).maybeSingle()
  if (error) {
    console.error('[blocos3d/poll] read error:', error)
    return NextResponse.json({ error: 'Falha ao consultar o job' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })

  const admin = createAdminClient()
  try {
    const job = await reconcileBlocos3DJob(admin, data as unknown as JobRowWithMeta)
    return NextResponse.json({ job: await toJobView(admin, job) })
  } catch (err) {
    console.error('[blocos3d/poll] reconciliação:', err)
    return NextResponse.json({ error: 'Falha ao consultar o job' }, { status: 500 })
  }
}
