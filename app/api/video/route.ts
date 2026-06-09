import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireVideoModel, getNodeCost } from '@/lib/video/models'
import { buildArchitectureVideoPrompt, buildPromptFromLegacyInput, type FidelityMode } from '@/lib/video/promptBuilder'
import { isSceneTypeId, type SceneTypeId } from '@/lib/video/scenes'
import { isCameraMotionId, type CameraMotionId, type CameraIntensity } from '@/lib/video/cameraPresets'
import { getAdapterForModel } from '@/lib/video/adapters'

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
  if (raw === 'normal' || raw === 'pronounced') return raw
  return 'subtle'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let inputUrl: string | undefined
  let endImageUrl: string | undefined

  try {
    const formData = await req.formData()

    // ── Campos atuais (compatibilidade total) ────────────────────────────────
    const imageFile    = formData.get('image')        as File   | null
    const engineId     = (formData.get('engine')      as string | null) ?? DEFAULT_ENGINE_ID
    const duration     = (formData.get('duration')    as string | null) ?? '8'
    const sceneRaw     = (formData.get('scene')       as string | null) ?? 'living'
    const intensityRaw = (formData.get('intensity')   as string | null)
    const userPrompt   = (formData.get('prompt')      as string | null) ?? ''

    // ── Campos novos opcionais (UI v2) ───────────────────────────────────────
    const endImage     = formData.get('endImage')     as File   | null
    const cameraMotion = (formData.get('cameraMotion') as string | null) ?? ''
    const fidelityRaw  = (formData.get('fidelity')    as string | null)
    const atmosphere   = (formData.get('atmosphere')  as string | null) ?? ''
    const aspectRatio  = (formData.get('aspectRatio') as string | null) ?? undefined
    const resolution   = (formData.get('resolution')  as string | null) ?? undefined

    if (!imageFile) return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })

    // ── Resolve modelo + custo ───────────────────────────────────────────────
    const model = requireVideoModel(engineId)
    if (!model.isAvailable) {
      return NextResponse.json({ error: `Modelo ${model.label} indisponível` }, { status: 400 })
    }

    let nodeCost: number
    try {
      nodeCost = getNodeCost(engineId, duration)
    } catch {
      return NextResponse.json({ error: 'Duração inválida para este motor' }, { status: 400 })
    }

    // ── Checa saldo ──────────────────────────────────────────────────────────
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (!profile || profile.credits < nodeCost) {
      return NextResponse.json({ error: 'Créditos insuficientes' }, { status: 402 })
    }

    // ── Upload da(s) imagem(ns) ──────────────────────────────────────────────
    inputUrl = await fal.storage.upload(imageFile)
    if (endImage) {
      endImageUrl = await fal.storage.upload(endImage)
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
        })
      : buildPromptFromLegacyInput({
          scene:        sceneRaw,
          intensity:    intensityRaw ?? 'subtle',
          customPrompt: userPrompt,
        })

    // ── Chama o adapter ──────────────────────────────────────────────────────
    const adapter = getAdapterForModel(engineId)
    const { outputUrl } = await adapter.generate({
      modelId:        engineId,
      imageUrl:       inputUrl,
      endImageUrl,
      prompt:         built.prompt,
      negativePrompt: built.negativePrompt,
      duration,
      aspectRatio,
      resolution,
      generateAudio:  false,
    })

    // TODO: copy output video to permanent Supabase Storage before public production release.
    // Currently output_url is a CDN link with no documented retention SLA.
    await Promise.all([
      admin.from('renders').insert({
        user_id:      user.id,
        input_url:    inputUrl,
        output_url:   outputUrl,
        prompt:       built.prompt,
        ambient:      'video',
        style:        engineId,
        lighting:     `${duration}s`,
        cost_credits: nodeCost,
        status:       'completed',
        completed_at: new Date().toISOString(),
      }),
      // bolsa do escritório: cobra o dono do workspace ativo (individual = ele mesmo)
      admin.rpc('consume_workspace_nodes', { user_id_input: user.id, amount: nodeCost }),
    ])

    return NextResponse.json({ url: outputUrl, inputUrl })

  } catch (err: unknown) {
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
