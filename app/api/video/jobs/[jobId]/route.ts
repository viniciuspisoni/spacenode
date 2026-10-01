import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncVideoJob, videoJobView, type VideoJobRow } from '@/lib/video/jobs/service'

export const maxDuration = 180
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  if (!UUID_RE.test(jobId)) return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const admin = createAdminClient()
  const { data, error } = await admin.from('video_jobs').select('*')
    .eq('id', jobId).eq('user_id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Falha ao consultar vídeo' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })
  try {
    const job = await syncVideoJob(admin, data as VideoJobRow)
    return NextResponse.json({ job: await videoJobView(admin, job) })
  } catch (syncError) {
    console.error('[video/jobs/poll] falhou:', { jobId, syncError })
    return NextResponse.json({ error: 'Acompanhamento temporariamente indisponível' }, { status: 503 })
  }
}
