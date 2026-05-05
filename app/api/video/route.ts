import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

fal.config({ credentials: process.env.FAL_KEY })

// Vercel Pro: até 5 minutos por geração de vídeo.
// ARQUITETURA ATUAL — SÍNCRONA:
//   POST /api/video → upload → fal.subscribe (bloqueia 1-4 min) → DB → resposta
//   Risco: se a Vercel encerrar a função antes do fal.subscribe retornar (ex: plano Hobby
//   tem limite de 60s), o cliente recebe timeout mas o fal.ai pode ter gerado e cobrado.
// EVOLUÇÃO RECOMENDADA PARA PRODUÇÃO:
//   Migrar para fal.queue + polling no cliente:
//     1. POST /api/video → fal.queue.submit() → retorna { jobId } imediatamente
//     2. GET  /api/video/status?jobId → fal.queue.status() → retorna progresso
//     3. Quando COMPLETED: fal.queue.result() → salva no DB → desconta nodes
//   Cada request dura < 5s. Elimina dependência de plano Vercel e risco de duplo débito.
export const maxDuration = 300

// Node costs calibrados para margem ≥70% @ R$5,00/USD (mantém piso >55% até R$7,00/USD).
// 1 node = R$0,25 ao usuário. Custos Fal:
//   Kling 2.5 Turbo Pro i2v   : $0,35 (5s) / $0,70 (10s)
//   Veo 3.1 standard 1080p s/áudio : $0,20/s
//   Seedance 2.0 standard 1080p   : $0,3024/s
const ENGINES = {
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': {
    nodesByDuration: { '5': 30, '10': 55 } as Record<string, number>,
  },
  'fal-ai/veo3.1/image-to-video': {
    nodesByDuration: { '4': 70, '6': 100, '8': 135 } as Record<string, number>,
  },
  'bytedance/seedance-2.0/image-to-video': {
    nodesByDuration: { '5': 101, '10': 202 } as Record<string, number>,
  },
} as const

const ARCH_SUFFIX =
  'Cinematic architectural visualization. Photorealistic rendering. ' +
  'Preserve all geometric details, materials, textures, and proportions. ' +
  'Maintain strict architectural fidelity throughout. ' +
  'Professional camera movement, smooth and controlled. ' +
  'High-end real estate presentation quality. ' +
  'Sharp focus, no distortion, no warping, no morphing of surfaces or edges.'

const MOTION_PROMPTS: Record<string, string> = {
  push_in:   'slow camera dolly-in, smooth push toward the facade, steady movement',
  pull_out:  'slow camera pull-back, reveal full building and surroundings, smooth steady dolly out',
  pan_right: 'smooth horizontal camera pan from left to right, steady speed',
  crane_up:  'slow gentle upward crane shot, tilt up revealing roofline and sky',
  orbit:     'slow orbital camera arc around the building, smooth circular movement',
  walk_in:   'smooth forward dolly through interior space, steady walking pace',
  static:    'static locked-off camera, subtle ambient life, no camera movement',
}

const NEGATIVE_PROMPT =
  'camera shake, handheld movement, distortion, morphing, warping, geometric artifacts, ' +
  'blurry frames, jitter, melting concrete, liquid glass, deforming windows, rubbery materials, ' +
  'walls breathing, surfaces shifting, edges bending, materials changing, geometry collapse, ' +
  'low quality, amateur, cartoon, illustration, oversaturated colors'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let inputUrl: string | undefined

  try {
    const formData     = await req.formData()
    const imageFile    = formData.get('image')    as File   | null
    const engineId     = (formData.get('engine')  as string | null) ?? 'fal-ai/veo3.1/image-to-video'
    const duration     = (formData.get('duration')as string | null) ?? '8'
    const motionPreset = (formData.get('motion')  as string | null) ?? 'push_in'
    const customPrompt = (formData.get('prompt')  as string | null) ?? ''

    if (!imageFile) return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })

    const engine = ENGINES[engineId as keyof typeof ENGINES]
    if (!engine) return NextResponse.json({ error: 'Motor inválido' }, { status: 400 })

    const nodeCost = engine.nodesByDuration[duration]
    if (!nodeCost) return NextResponse.json({ error: 'Duração inválida para este motor' }, { status: 400 })

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (!profile || profile.credits < nodeCost) {
      return NextResponse.json({ error: 'Créditos insuficientes' }, { status: 402 })
    }

    inputUrl = await fal.storage.upload(imageFile)

    const motionText = MOTION_PROMPTS[motionPreset] ?? MOTION_PROMPTS.push_in
    const fullPrompt = [motionText, customPrompt, ARCH_SUFFIX].filter(Boolean).join('. ')

    const falInput = buildFalInput(engineId, inputUrl, duration, fullPrompt, motionPreset)

    console.log('[video] engine:', engineId)
    console.log('[video] input :', JSON.stringify(falInput))

    const result = await fal.subscribe(engineId, { input: falInput })

    console.log('[video] output:', JSON.stringify(result.data))

    const outputUrl = extractVideoUrl(result.data)
    if (!outputUrl) throw new Error('Modelo não retornou vídeo')

    // TODO: copy Fal output video to permanent Supabase Storage before public production release.
    // Currently output_url is a fal.media CDN link with no documented retention SLA.
    // Pattern: fetch(outputUrl) → upload to supabase.storage 'videos' bucket → save public URL.
    await Promise.all([
      admin.from('renders').insert({
        user_id:      user.id,
        input_url:    inputUrl,
        output_url:   outputUrl,
        prompt:       fullPrompt,
        ambient:      'video',
        style:        engineId,
        lighting:     `${duration}s`,
        cost_credits: nodeCost,
        status:       'completed',
        completed_at: new Date().toISOString(),
      }),
      admin.rpc('consume_credits', { user_id_input: user.id, amount: nodeCost }),
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildFalInput(
  engineId:     string,
  imageUrl:     string,
  duration:     string,
  prompt:       string,
  motionPreset: string,
): Record<string, unknown> {
  if (engineId === 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video') {
    return {
      image_url:       imageUrl,
      prompt,
      duration,
      negative_prompt: NEGATIVE_PROMPT,
      cfg_scale:       0.75,
    }
  }
  if (engineId === 'fal-ai/veo3.1/image-to-video') {
    return {
      image_url:       imageUrl,
      prompt,
      duration:        `${duration}s`,
      resolution:      '1080p',
      aspect_ratio:    'auto',
      generate_audio:  false,
      negative_prompt: NEGATIVE_PROMPT,
    }
  }
  if (engineId === 'bytedance/seedance-2.0/image-to-video') {
    // Seedance 2.0 não expõe camera_fixed nem negative_prompt — tudo via prompt.
    // generate_audio default é true; força false para evitar surpresa de billing.
    void motionPreset
    return {
      image_url:      imageUrl,
      prompt,
      duration,
      resolution:     '1080p',
      aspect_ratio:   'auto',
      generate_audio: false,
    }
  }
  throw new Error(`Engine não suportado: ${engineId}`)
}

function extractVideoUrl(data: unknown): string | null {
  const d = data as Record<string, unknown>
  // Kling, Veo, Seedance → { video: { url: string } }
  if (d?.video && typeof (d.video as Record<string, unknown>).url === 'string') {
    return (d.video as Record<string, unknown>).url as string
  }
  console.warn('[video] extractVideoUrl: estrutura desconhecida', JSON.stringify(data))
  return null
}
