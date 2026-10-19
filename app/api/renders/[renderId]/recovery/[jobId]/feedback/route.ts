import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { parseRenderFeedback } from '@/lib/render-feedback'
import { belongsToRecovery, isUuid, RECOVERY_VERSION, type RecoveryEditJob } from '@/lib/onboarding/render-recovery'
import { recordAcquisitionEvent } from '@/lib/marketing/ads/service'
import { isInternalTraffic } from '@/lib/analytics/internal'

const PRIVATE = { 'Cache-Control': 'private, no-store' }
type Params = { params: Promise<{ renderId: string; jobId: string }> }
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: PRIVATE })

async function context(req: NextRequest, params: Params['params']) {
  const { renderId, jobId } = await params
  if (!isUuid(renderId) || !isUuid(jobId)) return { status: 404 as const }
  const { user } = await getRequestUser(req)
  if (!user) return { status: 401 as const }
  const admin = createAdminClient()
  const { data: render, error } = await admin.from('renders')
    .select('output_url,status,ambient,is_internal_test,created_at').eq('id', renderId).eq('user_id', user.id).maybeSingle()
  if (error) throw error
  if (!render?.output_url || render.status !== 'completed' || render.is_internal_test || render.ambient === 'video' || render.ambient === 'upscale') return { status: 404 as const }
  // Bound the ancestry lookup; no image URLs or prompts leave the server.
  const { data, error: jobsError } = await admin.from('edit_v3_jobs')
    .select('id,source_image_url,result_image_url,nodes_cost,charged')
    .eq('user_id', user.id).eq('status', 'completed').gte('created_at', render.created_at)
    .order('created_at', { ascending: false }).limit(100)
  if (jobsError) throw jobsError
  const jobs = (data ?? []) as RecoveryEditJob[]
  const job = jobs.find(item => item.id === jobId && item.result_image_url)
  if (!job || !belongsToRecovery(render.output_url, jobs, jobId)) return { status: 404 as const }
  return { status: 200 as const, admin, userId: user.id, renderId, jobId, job }
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await context(req, params)
    if (ctx.status !== 200) return json({ error: 'Não disponível' }, ctx.status)
    const { data, error } = await ctx.admin.schema('marketing').from('acquisition_events')
      .select('metadata').eq('user_id', ctx.userId).in('event_type', ['result_approved', 'result_rejected'])
      .contains('metadata', { recovery_feedback: { render_id: ctx.renderId, job_id: ctx.jobId } })
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    const stored = data?.metadata?.recovery_feedback
    return json({ feedback: stored ? parseRenderFeedback({ useful: stored.useful, reason: stored.reason }) : null })
  } catch { return json({ error: 'Falha ao consultar avaliação' }, 500) }
}

export async function POST(req: NextRequest, { params }: Params) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Origem não permitida' }, 403)
  if (!req.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Formato inválido' }, 415)
  const raw = await req.text()
  if (raw.length > 256) return json({ error: 'Avaliação inválida' }, 413)
  const feedback = parseRenderFeedback((() => { try { return JSON.parse(raw) } catch { return null } })())
  if (!feedback) return json({ error: 'Avaliação inválida' }, 400)
  try {
    const ctx = await context(req, params)
    if (ctx.status !== 200) return json({ error: 'Não disponível' }, ctx.status)
    const limit = await rateLimit(ctx.admin, `recovery-feedback:${ctx.userId}`, 30, 300)
    if (!limit.allowed) return json({ error: 'Aguarde um pouco antes de avaliar novamente.' }, 429)
    // The nested server-owned record cannot be supplied through the scalar-only analytics collector.
    // Keep the original render_feedback unchanged; this answer describes this edit only.
    const persisted = await recordAcquisitionEvent(ctx.admin, {
      user_id: ctx.userId, event_type: feedback.useful ? 'result_approved' : 'result_rejected',
      page: '/app/editar', is_internal: isInternalTraffic(req),
      metadata: { feature: 'editar', flow_version: RECOVERY_VERSION,
        recovery_feedback: { render_id: ctx.renderId, job_id: ctx.jobId, ...feedback,
          nodes_cost: ctx.job.nodes_cost, charged: ctx.job.charged } },
    })
    if (!persisted) return json({ error: 'Não foi possível salvar. Tente novamente.' }, 500)
    return json({ feedback })
  } catch { return json({ error: 'Não foi possível salvar. Tente novamente.' }, 500) }
}
