import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canUseFirstImagePilot } from '@/lib/nodi/first-image/access'
import { openPilotReceipt } from '@/lib/nodi/first-image/receipt'
import { PILOT_UUID } from '@/lib/nodi/first-image/contract'
import { logNodiEvent } from '@/lib/nodi/telemetry'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const admin = createAdminClient()
  if (!await canUseFirstImagePilot(admin, user)) return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  if (req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'Origem não permitida' }, { status: 403 })
  if (!req.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Formato inválido' }, { status: 415 })
  const raw = await req.text()
  if (raw.length > 3000) return NextResponse.json({ error: 'Registro inválido' }, { status: 413 })
  const body = (() => { try { return JSON.parse(raw) } catch { return null } })()
  const receipt = openPilotReceipt(body?.receipt, user.id)
  if (!receipt || !['feedback', 'applied', 'generated'].includes(body?.stage)) return NextResponse.json({ error: 'Registro inválido' }, { status: 400 })
  const limit = await rateLimit(admin, `nodi-first-image-observe:${user.id}`, 60, 60)
  if (!limit.allowed) return new Response(null, { status: 429 })
  const meta: Record<string, string | number | boolean> = { source: 'first-image-pilot', experiment: receipt.version, case_id: receipt.caseId,
    request_id: receipt.requestId, provider: receipt.variant, stage: body.stage, qa: receipt.qa }
  if (body.stage === 'feedback') {
    if (typeof body.helpful !== 'boolean') return NextResponse.json({ error: 'Avaliação inválida' }, { status: 400 })
    meta.helpful = body.helpful
  }
  if (body.stage === 'generated') {
    if (typeof body.renderId !== 'string' || !PILOT_UUID.test(body.renderId)) return NextResponse.json({ error: 'Imagem inválida' }, { status: 400 })
    const { data, error } = await supabase.from('renders').select('id, status, created_at').eq('id', body.renderId).eq('user_id', user.id).maybeSingle()
    const createdAt = data ? Date.parse(data.created_at) : NaN
    if (error || !data || data.status !== 'completed' || !Number.isFinite(createdAt) || createdAt < receipt.issuedAt - 1000 || createdAt > Date.now() + 1000) return NextResponse.json({ error: 'Imagem indisponível' }, { status: 404 })
    meta.render_id = data.id
  }
  if (body.stage !== 'feedback') meta.config_changed = body.modified === true
  await logNodiEvent(admin, { userId: user.id, event: body.stage === 'feedback' ? 'answer_feedback' : 'v2_action_confirmed', route: '/app/generate', module: 'renderizar', meta })
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
