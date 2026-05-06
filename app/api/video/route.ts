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

// Cenas archviz com prompts cinematográficos específicos por tipo de espaço.
// Cada preset escolhe o movimento de câmera adequado ao ambiente — não é
// apenas um movimento genérico aplicado a qualquer cena.
const SCENE_PROMPTS: Record<string, string> = {
  living:
    'very slow dolly forward through living room, gentle parallax between foreground furniture and background wall, ' +
    'soft natural light wash from windows, shallow depth of field on foreground objects, anamorphic cinematic feel, ' +
    'controlled and restrained motion',

  kitchen:
    'very slow dolly forward from dining area into kitchen, gentle parallax revealing kitchen island and pendant lights, ' +
    'soft natural light from windows, shallow depth of field on foreground chairs and table, anamorphic cinematic feel, ' +
    'controlled and restrained motion',

  bedroom:
    'slow lateral tracking shot across the bedroom, gentle parallax between foreground elements and bed, ' +
    'soft warm ambient light, intimate and contemplative atmosphere, shallow depth of field, ' +
    'anamorphic cinematic feel, controlled and restrained motion',

  facade:
    'slow gentle crane up from human eye-level, revealing the full architectural elevation against the sky, ' +
    'golden hour atmospheric light, parallax between foreground landscape and architecture, ' +
    'cinematic real estate hero shot, controlled and restrained motion',

  terrace:
    'slow horizontal pan revealing the landscape view from the terrace, ' +
    'parallax between architectural foreground and distant horizon, golden atmospheric light, ' +
    'cinematic outdoor reveal, controlled and restrained motion',

  detail:
    'very slow push-in on architectural detail, gentle focus pull effect, intimate close framing, ' +
    'shallow depth of field highlighting materials and texture, contemplative pace, ' +
    'controlled and restrained motion',

  static:
    'static locked-off camera with no translation or rotation. Subtle environmental life only — ' +
    'soft natural light shifts, gentle ambient atmosphere, no camera movement whatsoever. ' +
    'Contemplative architectural composition.',
}

// Intensidade modula a magnitude do movimento via prompt (modelos respondem
// a vocabulário de pacing). Default "subtle" porque archviz profissional quer
// movimento contido — não walkthrough de jogo.
const INTENSITY_PREFIXES: Record<string, string> = {
  subtle:     'Barely perceptible motion, ultra slow contemplative pace. ',
  normal:     '',
  pronounced: 'Pronounced cinematic motion, more dynamic camera movement, dramatic pacing. ',
}

// Negative prompt expandido: além dos genéricos archviz, cobre os problemas
// clássicos de cenas de interior (telas pretas, padrões de palhinha, reflexos
// em inox/vidro, luminárias finas, padrões de piso/madeira).
// IMPORTANTE: Seedance 2.0 não aceita negative_prompt — só Kling e Veo se beneficiam.
const NEGATIVE_PROMPT =
  'camera shake, handheld movement, distortion, morphing, warping, geometric artifacts, ' +
  'blurry frames, jitter, melting concrete, liquid glass, deforming windows, rubbery materials, ' +
  'walls breathing, surfaces shifting, edges bending, materials changing, geometry collapse, ' +
  'low quality, amateur, cartoon, illustration, oversaturated colors, ' +
  'screen artifacts, black screen flickering, TV display glitch, monitor flicker, ' +
  'wicker pattern morphing, woven texture warping, basket weave shifting, rattan deformation, ' +
  'reflection ghosting, shimmer artifacts, mirror surface distortion, stainless steel rippling, ' +
  'pendant lamp deformation, light fixture morphing, lampshade warping, ' +
  'floor pattern shifting, wood grain crawling, tile pattern morphing, ' +
  'text distortion, logo warping, signage glitch'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let inputUrl: string | undefined

  try {
    const formData     = await req.formData()
    const imageFile    = formData.get('image')     as File   | null
    const engineId     = (formData.get('engine')   as string | null) ?? 'fal-ai/veo3.1/image-to-video'
    const duration     = (formData.get('duration') as string | null) ?? '8'
    const scenePreset  = (formData.get('scene')    as string | null) ?? 'living'
    const intensity    = (formData.get('intensity')as string | null) ?? 'subtle'
    const customPrompt = (formData.get('prompt')   as string | null) ?? ''

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

    const sceneText      = SCENE_PROMPTS[scenePreset] ?? SCENE_PROMPTS.living
    const intensityPrefix = INTENSITY_PREFIXES[intensity] ?? INTENSITY_PREFIXES.subtle
    const fullPrompt     = [intensityPrefix + sceneText, customPrompt, ARCH_SUFFIX].filter(Boolean).join('. ')

    const falInput = buildFalInput(engineId, inputUrl, duration, fullPrompt)

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
  engineId: string,
  imageUrl: string,
  duration: string,
  prompt:   string,
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
