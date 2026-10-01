import { randomUUID, createHash } from 'node:crypto'
import { NextRequest, NextResponse, after } from 'next/server'
import { trackSecondTool } from '@/lib/analytics/activation'
import { fal } from '@fal-ai/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/auth/request-user'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { DIRECT_UPLOAD_AREAS, downloadDirectUpload } from '@/lib/storage/direct-upload'
import { normalizeSource } from '@/lib/upscale/normalize-source'
import { classifySource } from '@/lib/upscale/classify-source'
import { saveUpscaleOutput } from '@/lib/upscale/output'
import { upscaleJobResponse } from '@/lib/upscale/job-response'
import { withSignal } from '@/lib/upscale/providers/subscribe'
import { UPSCALE_BUDGET_MS } from '@/lib/upscale/limits'
import { MAX_OUTPUT_MP, computeUpscaleCost, effectiveFactor, finalProvider,
  megapixelsFromDimensions, runUpscalePipeline, type ModeId, type Scale, type UpscaleTab } from '@/lib/upscale'

export const maxDuration = 300
fal.config({ credentials: process.env.FAL_KEY })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MODES: Record<UpscaleTab, ModeId[]> = {
  resolution: ['fidelity', 'recover'], enhance: ['denoise', 'deblur', 'restore', 'smart'],
}
const SCALES: Scale[] = ['none', '2x', '4x', '8x', 'ultra']

/** Consulta somente o job do usuário. Refresh/reconexão não repetem débito. */
export async function GET(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('jobId') ?? ''
  if (!UUID.test(id)) return NextResponse.json({ error: 'Geração inválida' }, { status: 400 })
  const admin = createAdminClient()
  const { data, error } = await admin.from('renders').select('*').eq('id', id)
    .eq('user_id', user.id).eq('ambient', 'upscale').maybeSingle()
  if (error) return NextResponse.json({ error: 'Não foi possível consultar a geração.' }, { status: 503 })
  if (!data) return NextResponse.json({ error: 'Geração não encontrada' }, { status: 404 })
  return NextResponse.json(await upscaleJobResponse(admin, data), {
    status: ['pending', 'processing'].includes(data.status) ? 202 : 200,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function POST(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const sourceKey = typeof body?.sourceKey === 'string' ? body.sourceKey : ''
  const tab = (body?.tab ?? 'resolution') as UpscaleTab
  const modeId = (body?.modeId ?? 'fidelity') as ModeId
  const scale = (body?.scale ?? '4x') as Scale
  const kind = body?.sourceKind ?? 'auto'
  const jobId = body?.requestId ?? randomUUID() // compatibilidade com plugin antigo
  if (!sourceKey || typeof jobId !== 'string' || !UUID.test(jobId) ||
      !['resolution', 'enhance'].includes(tab) || !MODES[tab].includes(modeId) || !SCALES.includes(scale) ||
      !['auto', 'image', 'line-art'].includes(kind) ||
      (tab === 'enhance' && modeId !== 'smart' && scale !== 'none')) {
    return NextResponse.json({ error: 'Pedido de ampliação inválido.' }, { status: 400 })
  }
  const admin = createAdminClient()
  const fingerprint = createHash('sha256').update(JSON.stringify([sourceKey, tab, modeId, scale, kind])).digest('hex')
  const existing = await admin.from('renders').select('*').eq('id', jobId).eq('user_id', user.id).maybeSingle()
  if (existing.error) return NextResponse.json({ error: 'Não foi possível verificar a geração.' }, { status: 503 })
  if (existing.data) {
    if (existing.data.upscale_meta?.request_fingerprint !== fingerprint) {
      return NextResponse.json({ error: 'Este pedido já pertence a outra geração.' }, { status: 409 })
    }
    return NextResponse.json(await upscaleJobResponse(admin, existing.data), {
      status: ['pending', 'processing'].includes(existing.data.status) ? 202 : 200,
    })
  }

  // Um orçamento para upload, tentativas e armazenamento; sobra margem para
  // registrar falha/estorno antes do limite da plataforma. Não soma timeouts.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), UPSCALE_BUDGET_MS)
  const signal = controller.signal
  let debited = false
  let registered = false
  let cost = 0
  let meta: Record<string, unknown> = { request_fingerprint: fingerprint, source_key: sourceKey, tab, mode_id: modeId, scale }
  try {
    const src = await withSignal(signal, () => downloadDirectUpload(admin, DIRECT_UPLOAD_AREAS['upscale-source'], user.id, {}, sourceKey))
    if (!src.ok) return NextResponse.json({ error: src.message }, { status: src.status })
    const normalized = await normalizeSource(src.buffer, src.mime)
    const width = normalized.width, height = normalized.height
    if (!width || !height) return NextResponse.json({ error: 'Não foi possível ler esta imagem.' }, { status: 400 })
    const factor = effectiveFactor(scale)
    if (width * height * factor * factor > MAX_OUTPUT_MP * 1_000_000) {
      return NextResponse.json({ code: 'output_too_large', error: 'A resolução final é grande demais. Escolha uma escala menor.' }, { status: 400 })
    }
    let classification: Awaited<ReturnType<typeof classifySource>> | null = null
    try { classification = await classifySource(normalized.buffer) } catch { /* usa preservação padrão */ }
    const sourceKind = kind === 'auto' ? classification?.kind ?? 'image' : kind
    cost = computeUpscaleCost({ tab, modeId, scale, megapixels: megapixelsFromDimensions(width, height) }).total
    meta = { ...meta, input_dimensions: { width, height }, source_normalized: normalized.note,
      source_kind: sourceKind, source_kind_origin: kind === 'auto' ? 'automatic' : 'manual', source_stats: classification?.stats ?? null }
    const row = { id: jobId, user_id: user.id, input_url: src.url, prompt: `ampliar ${tab}/${modeId} ${scale}`,
      ambient: 'upscale', style: `upscale:${modeId === 'denoise' ? 'nafnet-denoise' : modeId === 'deblur' ? 'nafnet-deblur' : modeId === 'restore' ? 'photo-restoration' : 'topaz'}`, lighting: scale, status: 'pending',
      nodes_charged: 0, cost_credits: cost, upscale_meta: meta }
    const inserted = await admin.from('renders').insert(row)
    if (inserted.error) {
      if (inserted.error.code === '23505') {
        const concurrent = await admin.from('renders').select('*').eq('id', jobId).eq('user_id', user.id).maybeSingle()
        if (concurrent.data?.upscale_meta?.request_fingerprint === fingerprint) {
          return NextResponse.json(await upscaleJobResponse(admin, concurrent.data), { status: 202 })
        }
      }
      throw new Error('job_save_failed')
    }
    registered = true
    signal.throwIfAborted()
    const debit = await admin.rpc('consume_workspace_nodes', { user_id_input: user.id, amount: cost })
    if (debit.error) throw new Error(debit.error.code === 'P0001' ? 'insufficient_balance' : 'balance_error')
    debited = true
    const processing = await admin.from('renders').update({ status: 'processing', nodes_charged: cost }).eq('id', jobId).eq('user_id', user.id)
    if (processing.error) throw new Error('job_save_failed')
    const inputUrl = await withSignal(signal, () => fal.storage.upload(new File([new Uint8Array(normalized.buffer)], 'source.' + (normalized.mime.split('/')[1]), { type: normalized.mime })))
    const result = await runUpscalePipeline({ tab, modeId, scale, imageUrl: inputUrl, sourceKind,
      inputDimensions: { width, height }, signal, onRequestId: async (id, endpoint) => {
        meta = { ...meta, provider_endpoint: endpoint }
        const saved = await admin.from('renders').update({ fal_request_id: id, upscale_meta: meta }).eq('id', jobId).eq('user_id', user.id)
        if (saved.error) throw new Error('job_save_failed')
      } })
    const output = await withSignal(signal, () => saveUpscaleOutput(admin, user.id, jobId, normalized.buffer, result.outputUrl, { width, height }, factor, signal))
    meta = { ...meta, steps: result.steps, provider: finalProvider(result), achieved_factor: output.factor,
      effective_factor: output.factor, output_dimensions: { width: output.width, height: output.height },
      output_bytes: output.bytes, output_format: output.format, storage_key: output.key,
      preview_url: output.previewUrl, before_preview_url: output.beforePreviewUrl,
      total_duration_ms: result.totalDurationMs, fallback_used: false }
    const completed = { ...row, style: `upscale:${finalProvider(result) ?? modeId}`, status: 'completed', nodes_charged: cost, output_url: output.url,
      completed_at: new Date().toISOString(), preview_url: output.previewUrl,
      fal_request_id: result.steps.at(-1)?.requestId, duration_ms: result.totalDurationMs, upscale_meta: meta }
    const saved = await admin.from('renders').update(completed).eq('id', jobId).eq('user_id', user.id)
    if (saved.error) throw new Error('job_save_failed')
    after(() => trackSecondTool(admin, req, user.id, 'ampliar'))
    return NextResponse.json(await upscaleJobResponse(admin, { ...completed, error_message: null }))
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'unknown'
    console.error('[upscale]', raw)
    const refunded = debited ? await refundNodes(admin, user.id, cost, { module: 'upscale', jobTable: 'renders', jobId }) : false
    const code = raw.includes('insufficient_balance') ? 'insufficient_balance' :
      raw.includes('output_dimensions') ? 'output_dimensions_mismatch' :
      raw.includes('output_too_large') ? 'output_too_large' :
      raw.includes('job_save') ? 'history_error' : signal.aborted || raw.includes('timeout') ? 'provider_timeout' : 'provider_failed'
    const message = code === 'insufficient_balance' ? 'Saldo insuficiente.' :
      code === 'output_dimensions_mismatch' ? 'O motor não entregou a resolução e proporção solicitadas.' :
      code === 'output_too_large' ? 'O resultado ultrapassou 50 MB. Tente uma escala menor.' :
      code === 'history_error' ? 'Não foi possível salvar a geração no histórico.' :
      code === 'provider_timeout' ? 'A geração excedeu o tempo disponível. Tente novamente.' : 'Não foi possível processar esta imagem.'
    const note = refunded ? ` Seus ${cost} nodes foram devolvidos.` : debited ? ' Não conseguimos confirmar o estorno dos nodes. Entre em contato com o suporte informando esta geração.' : ''
    if (registered) {
      const saved = await admin.from('renders').update({ status: 'failed', error_message: message + note,
        nodes_charged: debited && !refunded ? cost : 0, upscale_meta: { ...meta, refunded, error_code: code }, completed_at: new Date().toISOString() }).eq('id', jobId).eq('user_id', user.id)
      if (saved.error) console.error('[upscale] falha ao registrar erro', saved.error.code)
    }
    return NextResponse.json({ jobId, status: 'failed', code, error: message + note, refunded }, { status: code === 'insufficient_balance' ? 402 : 502 })
  } finally { clearTimeout(timer) }
}
