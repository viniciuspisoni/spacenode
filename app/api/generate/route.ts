import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPrompt, GenerateOptions, Mode, SceneElements } from '@/lib/prompts'

const FAL_MODELS: Record<string, string> = {
  'nano-banana-pro': 'fal-ai/nano-banana-pro/edit',
  'nano-banana':     'fal-ai/nano-banana/edit',
  'gpt-image-2':     'openai/gpt-image-2/edit',
  'flux-krea':       'fal-ai/flux/krea/image-to-image',
  'flux-general':    'fal-ai/flux-general/image-to-image',
}

// Modelos que usam image_urls (array) em vez de image_url (singular)
const IMAGE_URLS_MODELS = new Set([
  'fal-ai/nano-banana-pro/edit',
  'fal-ai/nano-banana/edit',
  'openai/gpt-image-2/edit',
])

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      imageBase64,
      mode           = 'externo',
      condition,     background,
      ambient,       lighting,
      plantType,     perspective,
      vegetation,    lightCondition,
      model          = 'nano-banana-pro',
      outputQuality  = 'hd',
      materials,
      sceneElements,
    } = body

    // Mapeamento de qualidade → parâmetros reais de cada modelo
    const QUALITY_MAP: Record<string, { nanoResolution: string; gptQuality: 'low' | 'medium' | 'high' }> = {
      hd:  { nanoResolution: '1K', gptQuality: 'medium' },
      '2k': { nanoResolution: '2K', gptQuality: 'high'   },
      '4k': { nanoResolution: '4K', gptQuality: 'high'   },
    }
    const qualityParams = QUALITY_MAP[outputQuality] ?? QUALITY_MAP['hd']

    if (!imageBase64) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }

    const falModel = FAL_MODELS[model] ?? FAL_MODELS['nano-banana-pro']
    const usesImageUrls = IMAGE_URLS_MODELS.has(falModel)
    const modelType = falModel === 'openai/gpt-image-2/edit' ? 'edit' : 'reference'

    const prompt = buildPrompt({
      mode: mode as Mode,
      condition, background, ambient, lighting,
      plantType, perspective, vegetation, lightCondition,
      materials,
      sceneElements: sceneElements as SceneElements | undefined,
      modelType,
    } as GenerateOptions)

    const blob = base64ToBlob(imageBase64)
    const falImageUrl = await fal.storage.upload(blob)

    console.log('[generate] mode:', mode, '| model:', falModel, '| quality:', outputQuality)
    console.log('[generate] nanoResolution:', qualityParams.nanoResolution, '| gptQuality:', qualityParams.gptQuality)
    console.log('[generate] prompt:', prompt.substring(0, 120) + '...')

    let result: { data: { images?: Array<{ url: string }>; image?: { url: string } } }

    if (falModel === 'openai/gpt-image-2/edit') {
      result = await fal.subscribe(falModel, {
        input: {
          prompt,
          image_urls: [falImageUrl],
          quality:    qualityParams.gptQuality,
          num_images: 1,
        },
      }) as typeof result
    } else if (usesImageUrls) {
      // Nano Banana Pro / Nano Banana — modelos de referência estilística (image_urls array)
      result = await fal.subscribe(falModel, {
        input: {
          prompt,
          image_urls:          [falImageUrl],
          num_images:          1,
          aspect_ratio:        'auto',
          output_format:       'jpeg',
          resolution:          qualityParams.nanoResolution,
          strength:            0.45,
          guidance_scale:      16,
          num_inference_steps: 40,
        },
      }) as typeof result
    } else {
      // Flux models (fallback)
      result = await fal.subscribe(falModel, {
        input: {
          image_url:           falImageUrl,
          prompt,
          strength:            0.85,
          num_inference_steps: 40,
          guidance_scale:      3.5,
          seed:                Math.floor(Math.random() * 999_999),
        },
      }) as typeof result
    }

    let outputUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url
    if (!outputUrl) {
      console.error('[generate] Resposta completa da Fal.ai:', JSON.stringify(result))
      return NextResponse.json({ error: 'Fal.ai não retornou imagem' }, { status: 500 })
    }

    // ── Upscale pós-geração para GPT Image 2 em 2K/4K ────────────
    // GPT não tem resolução nativa acima de ~1024px — encadeamos o
    // Clarity Upscaler (IA) para atingir qualidade 2K ou 4K real.
    if (falModel === 'openai/gpt-image-2/edit' && outputQuality !== 'hd') {
      const scaleFactor = outputQuality === '4k' ? 4 : 2
      console.log('[generate] upscaling GPT output', scaleFactor + 'x via clarity-upscaler')
      try {
        const upscaleResult = await fal.subscribe('fal-ai/clarity-upscaler', {
          input: {
            image_url:           outputUrl,
            scale_factor:        scaleFactor,
            prompt:              'architectural photography, photorealistic, sharp details, no artifacts',
            creativity:          0,    // sem adições criativas — só upscale fiel
            resemblance:         1,    // máxima fidelidade ao original
            num_inference_steps: 18,
          },
        }) as { data: { image?: { url: string } } }
        const upscaledUrl = upscaleResult.data?.image?.url
        if (upscaledUrl) {
          console.log('[generate] upscale OK:', upscaledUrl.substring(0, 60))
          outputUrl = upscaledUrl
        }
      } catch (upErr) {
        // Upscale falhou — usa output original do GPT sem quebrar o render
        console.warn('[generate] upscale falhou, usando output original:', upErr)
      }
    }

    const admin = createAdminClient()

    const { error: creditError } = await admin.rpc('consume_credit', { user_id_input: user.id })
    if (creditError) {
      return NextResponse.json({ error: 'Créditos insuficientes' }, { status: 402 })
    }

    // Custo em nodes por qualidade
    const nodeCost: Record<string, number> = { hd: 4, '2k': 8, '4k': 20 }
    const costCredits = nodeCost[outputQuality] ?? 4

    // Campos de exibição no histórico
    const histAmbient = mode === 'interno'
      ? (ambient ?? 'Interior')
      : (condition ?? 'Diurno')
    const histStyle = mode === 'interno'
      ? (lighting ?? 'Clara e Natural')
      : (background ?? 'Preservar original')
    const histLighting = mode === 'interno'
      ? 'Ambientes Internos'
      : 'Fotorrealismo Externo'

    const { error: insertError } = await admin.from('renders').insert({
      user_id:      user.id,
      input_url:    falImageUrl,
      output_url:   outputUrl,
      prompt,
      ambient:      histAmbient,
      style:        histStyle,
      lighting:     histLighting,
      status:       'completed',
      cost_credits: costCredits,
      completed_at: new Date().toISOString(),
    })
    if (insertError) {
      console.error('[generate] ERRO ao salvar render no histórico:', JSON.stringify(insertError))
    } else {
      console.log('[generate] render salvo no histórico OK')
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      success:  true,
      outputUrl,
      renderId: null,
      credits:  profile?.credits ?? 0,
    })

  } catch (error: unknown) {
    const e = error as { status?: number; body?: unknown; message?: string }
    console.error('[generate] ERROR status:', e?.status)
    console.error('[generate] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? error))
    return NextResponse.json({ error: e?.message ?? 'Erro desconhecido' }, { status: 500 })
  }
}

function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
