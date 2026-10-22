import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFirstImageAccess } from '@/lib/nodi/first-image/access'
import { checkPilotBudget } from '@/lib/nodi/first-image/budget'
import { FIRST_IMAGE_PILOT_VERSION, parsePilotRequest } from '@/lib/nodi/first-image/contract'
import { PILOT_MODELS, runFirstImagePilot } from '@/lib/nodi/first-image/agent'
import { pilotFailure, PilotRunError } from '@/lib/nodi/first-image/failure'
import { sealPilotReceipt } from '@/lib/nodi/first-image/receipt'
import { NODI_UPLOAD_BUCKET, NODI_UPLOAD_MAX_BYTES, NODI_UPLOAD_MIMES, openUpload, validatePrint } from '@/lib/nodi/v2/uploads'
import { logNodiEvent } from '@/lib/nodi/telemetry'

export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401, headers })
  const admin = createAdminClient()
  const access = await getFirstImageAccess(admin, user)
  if (!access.enabled) return NextResponse.json({ error: 'Preparo com Nodi indisponível para esta conta.' }, { status: 404, headers })
  if (req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'Origem não permitida' }, { status: 403, headers })
  if (!req.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Formato inválido' }, { status: 415, headers })
  const raw = await req.text()
  if (raw.length > 24_000) return NextResponse.json({ error: 'Conversa muito longa. Recomece a conversa.' }, { status: 413, headers })
  const input = parsePilotRequest((() => { try { return JSON.parse(raw) } catch { return null } })())
  if (!input) return NextResponse.json({ error: 'Confira o objetivo, o tipo de referência e a mensagem.' }, { status: 400, headers })
  if (!access.internalTools && input.variant !== 'control') return NextResponse.json({ error: 'Modelo não disponível neste fluxo.' }, { status: 403, headers })
  // Customers cannot select the comparison model or hide activity as QA.
  if (!access.internalTools) input.context.qa = false
  // This routing choice needs no model, private upload or analysis quota.
  if (input.context.referenceKind === 'render') return NextResponse.json({ error: 'Sua imagem já é um render. Use Continuar em Editar com esta imagem; o pedido será levado para revisão.' }, { status: 409, headers })
  const key = openUpload(input.attachmentId, user.id)
  if (!key) return NextResponse.json({ error: 'A referência venceu ou não está disponível. Envie novamente.' }, { status: 400, headers })
  const budget = await checkPilotBudget(admin, user.id)
  if (budget !== 'allowed') return NextResponse.json({ error: budget === 'limited'
    ? 'Limite de análises atingido. Você pode continuar pelos controles da referência.'
    : 'Não foi possível conferir o limite agora. Os controles da referência continuam disponíveis.' }, { status: budget === 'limited' ? 429 : 503, headers })
  const requestId = randomUUID()
  const meta = { source: 'first-image-pilot', experiment: FIRST_IMAGE_PILOT_VERSION, case_id: input.caseId, request_id: requestId,
    provider: input.variant, model: PILOT_MODELS[input.variant].id, qa: input.context.qa }
  let phase = 'reference'
  try {
    const { data: bucket, error: bucketError } = await admin.storage.getBucket(NODI_UPLOAD_BUCKET)
    if (bucketError || !bucket || bucket.public) throw new Error('reference-unavailable')
    const storage = admin.storage.from(NODI_UPLOAD_BUCKET)
    const dir = key.slice(0, key.lastIndexOf('/')), filename = key.slice(key.lastIndexOf('/') + 1)
    const { data: objects, error: listError } = await storage.list(dir, { search: filename, limit: 10 })
    const metadata = objects?.find(item => item.name === filename)?.metadata
    if (listError || !metadata || !Number.isSafeInteger(metadata.size) || metadata.size <= 0 ||
      metadata.size > NODI_UPLOAD_MAX_BYTES || !NODI_UPLOAD_MIMES.includes(metadata.mimetype)) throw new Error('reference-unavailable')
    const { data, error } = await storage.download(key)
    if (error || !data) throw new Error('reference-unavailable')
    const buffer = Buffer.from(await data.arrayBuffer())
    await validatePrint(buffer, data.type)
    // Vision-only derivative strips metadata. Renderizar retains the original full file.
    const image = await sharp(buffer).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    phase = 'model'
    const answer = await runFirstImagePilot(input, image, AbortSignal.any([req.signal, AbortSignal.timeout(40_000)]), undefined,
      () => checkPilotBudget(admin, user.id))
    const receipt = sealPilotReceipt({ userId: user.id, caseId: input.caseId, requestId, variant: input.variant, qa: input.context.qa })
    await logNodiEvent(admin, { userId: user.id, event: 'v2_chat', route: '/app/generate', module: 'renderizar', meta: {
      ...meta, stage: 'answered', proposal: !!answer.recommendation, tokens_in: answer.usage.inputTokens, tokens_out: answer.usage.outputTokens,
      duration_ms: answer.usage.durationMs, cost_estimate_usd: answer.usage.nominalUsd,
      attempts: answer.usage.attempts, cost_estimate_complete: answer.usage.costComplete,
      ...(answer.usage.recoveredFrom ? { recovered_from: answer.usage.recoveredFrom } : {}),
    } })
    return NextResponse.json({ answer: { text: answer.text, recommendation: answer.recommendation, receipt, requestId,
      variant: input.variant, modelLabel: PILOT_MODELS[input.variant].label } }, { headers })
  } catch (error) {
    // Provider errors can contain prompts, image bytes or credentials. Never echo them.
    const diagnostic = error instanceof PilotRunError ? error : null
    const issue = `${phase}-${diagnostic?.issue ?? pilotFailure(error).issue}`
    console.warn('[nodi-first-image]', { requestId, variant: input.variant, issue })
    await logNodiEvent(admin, { userId: user.id, event: 'v2_fallback', route: '/app/generate', module: 'renderizar', meta: { ...meta, stage: 'failed', issue,
      ...(diagnostic ? { attempts: diagnostic.usage.attempts, tokens_in: diagnostic.usage.inputTokens, tokens_out: diagnostic.usage.outputTokens,
        duration_ms: diagnostic.usage.durationMs, cost_estimate_usd: diagnostic.usage.nominalUsd,
        cost_estimate_complete: diagnostic.usage.costComplete, ...(diagnostic.retryBudget ? { retry_budget: diagnostic.retryBudget } : {}) } : {}),
    } })
    return NextResponse.json({ error: 'O Nodi não conseguiu concluir a orientação agora. Sua referência e seu pedido foram mantidos. Tente novamente ou continue pelos controles da referência. Nenhuma imagem foi gerada.' }, { status: 503, headers })
  }
}
