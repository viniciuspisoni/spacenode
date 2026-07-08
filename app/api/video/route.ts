import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { requireVideoModel, getNodeCost } from '@/lib/video/models'
import { buildArchitectureVideoPrompt, buildPromptFromLegacyInput, type FidelityMode } from '@/lib/video/promptBuilder'
import { isSceneTypeId, type SceneTypeId } from '@/lib/video/scenes'
import { isCameraMotionId, type CameraMotionId, type CameraIntensity } from '@/lib/video/cameraPresets'
import { isVideoTypeId } from '@/lib/video/videoPresets'
import { getAdapterForModel } from '@/lib/video/adapters'
import { DIRECT_UPLOAD_AREAS, downloadDirectUpload } from '@/lib/storage/direct-upload'

fal.config({ credentials: process.env.FAL_KEY })

// Vercel Pro: até 5 minutos por geração de vídeo.
// ARQUITETURA ATUAL — SÍNCRONA:
//   POST /api/video → upload → adapter.generate (bloqueia 1-4 min) → DB → resposta
//   Risco: se a Vercel encerrar a função antes do generate retornar (ex: plano Hobby
//   tem limite de 60s), o cliente recebe timeout mas o provider pode ter gerado e cobrado.
// EVOLUÇÃO RECOMENDADA PARA PRODUÇÃO:
//   Migrar para fila + polling no cliente. Cada request dura < 5s.
export const maxDuration = 300

// Default quando o cliente não envia engine (fluxo legacy).
const DEFAULT_ENGINE_ID = 'fal-ai/veo3.1/image-to-video'

function pickFidelity(raw: string | null): FidelityMode {
  if (raw === 'balanced' || raw === 'creative') return raw
  return 'max'
}

function pickIntensity(raw: string | null): CameraIntensity {
  if (raw === 'normal' || raw === 'cinematic' || raw === 'pronounced') return raw
  return 'subtle'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // Estado pra refund: só refunda se o débito já passou (padrão do /api/generate).
  let debited       = false
  let nodesToCharge = 0
  let inputUrl:    string | undefined
  let endImageUrl: string | undefined

  try {
    // Body JSON — as imagens já subiram DIRETO pro Storage (uploadDirect, área
    // animar-source; o binário não passa pela Vercel, teto de 4,5 MB não se aplica).
    const body = await req.json().catch(() => null)
    const str = (k: string): string | null => (typeof body?.[k] === 'string' ? body[k] : null)

    const sourceKey    = str('sourceKey') ?? ''
    const engineId     = str('engine')      ?? DEFAULT_ENGINE_ID
    const duration     = str('duration')    ?? '8'
    const sceneRaw     = str('scene')       ?? 'living'
    const intensityRaw = str('intensity')
    const userPrompt   = str('prompt')      ?? ''

    // ── Campos novos opcionais (UI v2) ───────────────────────────────────────
    const endKey       = str('endKey')
    const cameraMotion = str('cameraMotion') ?? ''
    const fidelityRaw  = str('fidelity')
    const atmosphere   = str('atmosphere')  ?? ''
    const aspectRatioRaw = str('aspectRatio') ?? undefined
    const resolution   = str('resolution')  ?? undefined
    // ── Campos do fluxo por presets (2026-07) ────────────────────────────────
    const avoidPeople  = str('avoidPeople') === '1'
    const videoTypeRaw = str('videoType')   ?? ''
    const videoType    = isVideoTypeId(videoTypeRaw) ? videoTypeRaw : null

    if (!sourceKey) return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })

    // ── Baixa os uploads diretos (valida dono/área/limites) ──────────────────
    const src = await downloadDirectUpload(
      admin, DIRECT_UPLOAD_AREAS['animar-source'], user.id, {}, sourceKey,
    )
    if (!src.ok) return NextResponse.json({ error: src.message }, { status: src.status })

    let end: { buffer: Buffer; mime: string } | null = null
    if (endKey) {
      const d = await downloadDirectUpload(
        admin, DIRECT_UPLOAD_AREAS['animar-source'], user.id, {}, endKey,
      )
      if (!d.ok) return NextResponse.json({ error: d.message }, { status: d.status })
      end = d
    }

    // ── Resolve modelo + custo ───────────────────────────────────────────────
    const model = requireVideoModel(engineId)
    if (!model.isAvailable) {
      return NextResponse.json({ error: `Modelo ${model.label} indisponível` }, { status: 400 })
    }

    try {
      nodesToCharge = getNodeCost(engineId, duration)
    } catch {
      return NextResponse.json({ error: 'Duração inválida para este motor' }, { status: 400 })
    }

    // Formato: clamp ao que o motor suporta — nunca repassa valor que o
    // provider recusaria (evita 422 + refund por request malformado).
    const aspectRatio = aspectRatioRaw && model.supportedAspectRatios.includes(aspectRatioRaw)
      ? aspectRatioRaw
      : undefined

    // ── Débito atômico ANTES da geração (padrão do /api/generate) ─────────────
    // consume_workspace_nodes cobra a bolsa do PAGADOR (dono do workspace) e é a
    // autoridade de saldo — sem pré-check no `profiles.credits` do membro (que
    // ignorava Lumens e a bolsa do escritório). P0001 = saldo insuficiente → 402;
    // qualquer outro erro → 500. Nada é gerado sem débito confirmado: o vídeo
    // (item mais caro) nunca sai de graça por corrida nem por erro de RPC engolido.
    const { error: debitError } = await admin.rpc('consume_workspace_nodes', {
      user_id_input: user.id,
      amount:        nodesToCharge,
    })
    if (debitError) {
      console.error('[video] consume_workspace_nodes RPC error:', debitError)
      if (debitError.code === 'P0001') {
        return NextResponse.json(
          { error: `Nodes insuficientes. Necessários: ${nodesToCharge}.` },
          { status: 402 },
        )
      }
      return NextResponse.json({ error: 'Erro ao processar saldo.' }, { status: 500 })
    }
    debited = true

    // ── Upload da(s) imagem(ns) pra FAL (buffers já baixados do Storage) ─────
    inputUrl = await fal.storage.upload(
      new File([new Uint8Array(src.buffer)], sourceKey.split('/').pop() ?? 'source.jpg', { type: src.mime }),
    )
    if (end && endKey) {
      endImageUrl = await fal.storage.upload(
        new File([new Uint8Array(end.buffer)], endKey.split('/').pop() ?? 'end.jpg', { type: end.mime }),
      )
    }

    // ── Constrói prompt ──────────────────────────────────────────────────────
    // Se o cliente mandou cameraMotion (UI v2), usa o builder direto.
    // Senão, cai no caminho legacy (scene + intensity) que produz o mesmo
    // resultado dos prompts antigos.
    const sceneType: SceneTypeId | undefined = isSceneTypeId(sceneRaw) ? sceneRaw : undefined
    const motionId: CameraMotionId | undefined = isCameraMotionId(cameraMotion) ? cameraMotion : undefined
    const intensity = pickIntensity(intensityRaw)
    const fidelity  = pickFidelity(fidelityRaw)

    const built = motionId
      ? buildArchitectureVideoPrompt({
          userPrompt,
          sceneType,
          cameraMotion: motionId,
          intensity,
          fidelityMode: fidelity,
          atmosphere,
          duration,
          hasEndFrame: !!endImageUrl,
          avoidPeople,
        })
      : buildPromptFromLegacyInput({
          scene:        sceneRaw,
          intensity:    intensityRaw ?? 'subtle',
          customPrompt: userPrompt,
        })

    // ── Chama o adapter ──────────────────────────────────────────────────────
    // (Veo pode sair via fal OU via Vertex na conta GCP — ver adapters/index.)
    const generationStartedAt = Date.now()
    const adapter = getAdapterForModel(engineId)
    const { outputUrl, requestId: falRequestId, provider: usedProvider } = await adapter.generate({
      modelId:        engineId,
      imageUrl:       inputUrl,
      endImageUrl,
      prompt:         built.prompt,
      negativePrompt: built.negativePrompt,
      duration,
      aspectRatio,
      resolution,
      generateAudio:  false,
      userId:         user.id,
    })
    const generationDurationMs = Date.now() - generationStartedAt

    // TODO: copy output video to permanent Supabase Storage before public production release.
    // Currently output_url is a CDN link with no documented retention SLA.
    //
    // O débito já ocorreu ANTES da geração. Se o INSERT falhar, NÃO refundamos
    // (o usuário recebeu o vídeo e foi cobrado corretamente) — só logamos pra
    // reprocessar o histórico manualmente.
    //
    // config_snapshot = configuração em nível de produto (Histórico/Reutilizar).
    // generation_log  = arquivo técnico (admin) — migration 20260701, insert
    // resiliente no padrão do /api/generate: se a coluna ainda não existir,
    // regrava só com as colunas base para nunca perder o registro.
    const baseRow = {
      user_id:        user.id,
      input_url:      inputUrl,
      output_url:     outputUrl,
      prompt:         built.prompt,
      ambient:        'video',
      style:          engineId,
      lighting:       `${duration}s`,
      nodes_charged:  nodesToCharge,
      cost_credits:   nodesToCharge,
      fal_request_id: falRequestId ?? null,
      status:         'completed',
      completed_at:   new Date().toISOString(),
      config_snapshot: {
        module:        'animar',
        video_type:    videoType,
        camera_motion: motionId ?? null,
        scene_type:    sceneType ?? null,
        intensity,
        fidelity,
        aspect_ratio:  aspectRatio ?? 'auto',
        duration,
        engine:        engineId,
        atmosphere:    atmosphere || null,
        avoid_people:  avoidPeople,
        has_end_frame: !!endImageUrl,
      },
    }

    const extendedRow = {
      ...baseRow,
      user_prompt:  userPrompt.trim() || null,
      duration_ms:  generationDurationMs,
      retry_count:  0,
      generation_log: {
        provider:      usedProvider ?? 'fal',
        endpoint:      engineId,
        request_id:    falRequestId ?? null,
        parameters:    { duration, aspect_ratio: aspectRatio ?? 'auto', resolution: resolution ?? '1080p', generate_audio: false },
        duration_ms:   generationDurationMs,
        nodes_charged: nodesToCharge,
      },
    }

    let insertResult = await admin.from('renders').insert(extendedRow).select('id').single()
    if (insertResult.error && (insertResult.error.code === 'PGRST204' || insertResult.error.code === '42703')) {
      console.warn('[video] colunas de metadados ausentes — regravando com colunas base:', insertResult.error.message)
      insertResult = await admin.from('renders').insert(baseRow).select('id').single()
    }
    if (insertResult.error) {
      console.error('[video] DB INSERT FALHOU (vídeo gerado e debitado — investigar):', {
        error: insertResult.error, userId: user.id, outputUrl,
      })
    }

    // Saldo real pós-débito — a UI atualiza sem estimar (mesma view do /api/generate).
    const { data: balance } = await admin
      .from('user_node_balance')
      .select('plan_balance')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      url:          outputUrl,
      inputUrl,
      credits:      balance?.plan_balance ?? undefined,
      nodesCharged: nodesToCharge,
    })

  } catch (err: unknown) {
    // ── Refund VERIFICADO em qualquer falha pós-débito (helper checa {error}) ──
    if (debited && nodesToCharge > 0) {
      await refundNodes(admin, user.id, nodesToCharge, { module: 'video', jobTable: 'renders' })
    }

    const e = err as { status?: number; body?: unknown; message?: string }
    console.error('[video] ERROR status:', e?.status)
    console.error('[video] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))

    if (e?.status === 422) {
      const detail = (e.body as { detail?: { msg?: string }[] })?.detail
      const msg = detail?.[0]?.msg
      if (msg?.includes('aspect ratio')) {
        return NextResponse.json(
          { error: 'Proporção da imagem inválida. Use imagens com proporção entre 0.4 e 2.5 (ex: 16:9, 4:3, quadrado). Imagens muito altas ou muito largas não são aceitas.' },
          { status: 422 }
        )
      }
      return NextResponse.json({ error: msg ?? 'Parâmetros inválidos.' }, { status: 422 })
    }

    return NextResponse.json({ error: 'Erro ao gerar vídeo. Tente novamente.' }, { status: 500 })
  }
}
