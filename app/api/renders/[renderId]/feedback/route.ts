import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { parseRenderFeedback } from '@/lib/render-feedback'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRIVATE = { 'Cache-Control': 'private, no-store' }

async function ownedCompletedRender(admin: ReturnType<typeof createAdminClient>, renderId: string, userId: string) {
  const { data, error } = await admin
    .from('renders')
    .select('user_id, status, ambient, output_url, is_internal_test')
    .eq('id', renderId)
    .maybeSingle()
  if (error) throw error
  return !!data && data.user_id === userId && data.status === 'completed' &&
    !!data.output_url && !data.is_internal_test && data.ambient !== 'video' && data.ambient !== 'upscale'
}

async function context(req: NextRequest, params: Promise<{ renderId: string }>) {
  const { renderId } = await params
  if (!UUID_RE.test(renderId)) return null
  const { user } = await getRequestUser(req)
  if (!user) return { status: 401 as const }
  const admin = createAdminClient()
  if (!(await ownedCompletedRender(admin, renderId, user.id))) return { status: 404 as const }
  return { status: 200 as const, admin, renderId, userId: user.id }
}

type Params = { params: Promise<{ renderId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await context(req, params)
    if (!ctx || ctx.status !== 200) return NextResponse.json({ error: 'Não disponível' }, { status: ctx?.status ?? 404, headers: PRIVATE })
    const { data, error } = await ctx.admin.from('render_feedback')
      .select('useful, reason').eq('render_id', ctx.renderId).maybeSingle()
    if (error) throw error
    return NextResponse.json({ feedback: data ?? null }, { headers: PRIVATE })
  } catch (error) {
    console.error('[GET render feedback]', error)
    return NextResponse.json({ error: 'Falha ao consultar avaliação' }, { status: 500, headers: PRIVATE })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  if (req.headers.get('origin') !== new URL(req.url).origin) {
    return NextResponse.json({ error: 'Origem não permitida' }, { status: 403, headers: PRIVATE })
  }
  if (!req.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'Formato inválido' }, { status: 415, headers: PRIVATE })
  }
  const raw = await req.text()
  if (raw.length > 256) return NextResponse.json({ error: 'Avaliação inválida' }, { status: 413, headers: PRIVATE })
  const feedback = parseRenderFeedback((() => { try { return JSON.parse(raw) } catch { return null } })())
  if (!feedback) return NextResponse.json({ error: 'Avaliação inválida' }, { status: 400, headers: PRIVATE })
  try {
    const ctx = await context(req, params)
    if (!ctx || ctx.status !== 200) return NextResponse.json({ error: 'Não disponível' }, { status: ctx?.status ?? 404, headers: PRIVATE })
    const limit = await rateLimit(ctx.admin, `render-feedback:${ctx.userId}`, 30, 300)
    if (!limit.allowed) return NextResponse.json({ error: 'Aguarde um pouco antes de avaliar novamente.' }, { status: 429, headers: PRIVATE })
    const { error } = await ctx.admin.from('render_feedback').upsert({
      render_id: ctx.renderId,
      user_id: ctx.userId,
      useful: feedback.useful,
      reason: feedback.reason,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'render_id' })
    if (error) throw error
    return NextResponse.json({ feedback }, { headers: PRIVATE })
  } catch (error) {
    console.error('[POST render feedback]', error)
    return NextResponse.json({ error: 'Não foi possível salvar. Tente novamente.' }, { status: 500, headers: PRIVATE })
  }
}
