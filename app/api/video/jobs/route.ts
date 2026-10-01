import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { getRequestUser } from '@/lib/auth/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { DIRECT_UPLOAD_AREAS, downloadDirectUpload } from '@/lib/storage/direct-upload'
import { videoEconomics, VIDEO_MARGIN_FLOOR } from '@/lib/video/videoPricing'
import { VIDEO_TYPE_PRESETS } from '@/lib/video/videoPresets'
import { isSceneTypeId } from '@/lib/video/scenes'
import { buildArchitectureVideoPrompt } from '@/lib/video/promptBuilder'
import { isCameraMotionId, type CameraMotionId } from '@/lib/video/cameraPresets'
import { submitVideoTask } from '@/lib/video/jobs/provider'
import { readVideoJob, videoJobView } from '@/lib/video/jobs/service'

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_MOTIONS = new Set<CameraMotionId>(['dolly-in-soft', 'dolly-out-soft', 'lateral-tracking'])

export async function POST(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
  const sourceKey = typeof body?.sourceKey === 'string' ? body.sourceKey : ''
  const videoType = body?.videoType === 'reels' ? 'reels' : body?.videoType === 'cinematic' ? 'cinematic' : null
  const userPrompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (!UUID_RE.test(requestId) || !sourceKey || !videoType || userPrompt.length > 280) {
    return NextResponse.json({ error: 'Parâmetros de vídeo inválidos' }, { status: 400 })
  }
  const preset = VIDEO_TYPE_PRESETS[videoType]
  const modelId = preset.defaults.modelId
  const duration = preset.defaults.duration
  let quote: ReturnType<typeof videoEconomics>
  try { quote = videoEconomics(modelId, duration) }
  catch (error) {
    console.error('[video/jobs] cotação indisponível:', error)
    return NextResponse.json({ error: 'Modalidade temporariamente indisponível' }, { status: 503 })
  }
  if (!quote || quote.margin <= VIDEO_MARGIN_FLOOR) {
    return NextResponse.json({ error: 'Modalidade temporariamente indisponível' }, { status: 503 })
  }
  if (!process.env.FAL_KEY) return NextResponse.json({ error: 'Geração indisponível' }, { status: 503 })

  const requestedMotion = typeof body?.cameraMotion === 'string' && isCameraMotionId(body.cameraMotion)
    ? body.cameraMotion : null
  const motionId: CameraMotionId = requestedMotion && SAFE_MOTIONS.has(requestedMotion)
    ? requestedMotion : 'dolly-in-soft'
  const sceneType = typeof body?.scene === 'string' && isSceneTypeId(body.scene) ? body.scene : undefined
  const built = buildArchitectureVideoPrompt({
    userPrompt, sceneType, cameraMotion: motionId, intensity: 'subtle',
    fidelityMode: 'max', duration, hasEndFrame: false, avoidPeople: true,
  })
  const admin = createAdminClient()

  // A entrada é validada antes do débito. A RPC reserva o job e debita em uma
  // transação: após isso qualquer falha no upload da fal é estornada pela RPC
  // de falha. Duplicatas retornam o mesmo job sem reenviar a imagem ao provider.
  const src = await downloadDirectUpload(admin, DIRECT_UPLOAD_AREAS['animar-source'], user.id, {}, sourceKey)
  if (!src.ok) return NextResponse.json({ error: src.message }, { status: src.status })

  let jobId: string | null = null
  let created = false
  try {
    const { data: reservation, error: reserveError } = await admin.rpc('reserve_video_job', {
      p_user_id: user.id, p_request_id: requestId,
      p_model_id: modelId, p_endpoint: modelId === 'spacenode/veo3.1-lite-720/image-to-video'
        ? 'fal-ai/veo3.1/lite/image-to-video' : modelId,
      p_duration: duration, p_aspect_ratio: preset.defaults.aspectRatio,
      p_motion_id: motionId, p_video_type: videoType, p_input_url: src.url,
      p_prompt: built.prompt, p_negative_prompt: built.negativePrompt,
      p_user_prompt: userPrompt || null, p_nodes_cost: quote.nodes,
    })
    if (reserveError) {
      if (reserveError.code === 'P0001') {
        return NextResponse.json({ error: `Nodes insuficientes. Necessários: ${quote.nodes}.` }, { status: 402 })
      }
      throw reserveError
    }
    jobId = reservation?.job_id ?? null
    created = reservation?.created === true
    if (!jobId) throw new Error('Reserva sem job_id')
    if (!created) {
      const job = await readVideoJob(admin, jobId)
      return NextResponse.json({ jobId, job: await videoJobView(admin, job) })
    }

    fal.config({ credentials: process.env.FAL_KEY })
    const imageUrl = await fal.storage.upload(new File(
      [new Uint8Array(src.buffer)], sourceKey.split('/').pop() ?? 'source.jpg', { type: src.mime },
    ))
    const { requestId: providerRequestId } = await submitVideoTask({
      modelId, imageUrl, prompt: built.prompt, negativePrompt: built.negativePrompt,
      duration, aspectRatio: preset.defaults.aspectRatio, resolution: quote.resolution,
      generateAudio: false, userId: user.id,
    })
    const { error: updateError } = await admin.from('video_jobs')
      .update({ provider_request_id: providerRequestId, status: 'processing' })
      .eq('id', jobId).eq('status', 'submitting').select('id').single()
    if (updateError) throw updateError
    const job = await readVideoJob(admin, jobId)
    return NextResponse.json({ jobId, job: await videoJobView(admin, job), nodesCharged: quote.nodes })
  } catch (error) {
    console.error('[video/jobs] envio falhou:', { jobId, error })
    if (created && jobId) {
      const { error: refundError } = await admin.rpc('fail_video_job', {
        p_job_id: jobId, p_message: 'Falha ao iniciar a geração',
      })
      if (refundError) console.error('[video/jobs] estorno falhou:', { jobId, refundError })
    }
    return NextResponse.json({ error: 'Falha ao iniciar a geração. Tente novamente.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const requestId = req.nextUrl.searchParams.get('requestId')
  if (requestId && !UUID_RE.test(requestId)) {
    return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 })
  }
  const admin = createAdminClient()
  let query = admin.from('video_jobs').select('*').eq('user_id', user.id)
  query = requestId
    ? query.eq('client_request_id', requestId)
    : query.in('status', ['submitting', 'processing'])
  const { data, error } = await query
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return NextResponse.json({ error: 'Falha ao consultar vídeo' }, { status: 500 })
  return NextResponse.json({ job: data ? await videoJobView(admin, data) : null })
}
