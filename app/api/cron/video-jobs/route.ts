import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncVideoJob, type VideoJobRow } from '@/lib/video/jobs/service'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const admin = createAdminClient()
  const { data, error } = await admin.from('video_jobs').select('*')
    .in('status', ['submitting', 'processing']).order('created_at', { ascending: true }).limit(6)
  if (error) return NextResponse.json({ error: 'Falha ao listar jobs' }, { status: 500 })

  const jobs = (data ?? []) as VideoJobRow[]
  // No máximo três downloads de vídeo por vez para conter memória/latência.
  const results = []
  for (let i = 0; i < jobs.length; i += 3) {
    results.push(...await Promise.allSettled(jobs.slice(i, i + 3).map(job => syncVideoJob(admin, job))))
  }
  const failures = results.filter(r => r.status === 'rejected')
  if (failures.length) console.error('[cron/video-jobs] reconciliação falhou:', failures)
  return NextResponse.json({ checked: jobs.length, errors: failures.length })
}
