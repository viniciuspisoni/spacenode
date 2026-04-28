import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildGenerationPrompt, type GenerateOptions, type ProjectMaterials } from '@/lib/prompts'

// ── Engine → Fal.ai endpoint ──────────────────────────────────────────────────
//
// Vega  (nano-banana-pro) = Gemini 3 Pro Image — text-to-image
//   endpoint : fal-ai/nano-banana-pro
//   image    : NOT sent to API (model generates from scratch based on prompt)
//   params   : prompt, resolution, num_images, output_format
//
// Quasar (gpt-image-2) = OpenAI GPT Image 2 edit — image editing
//   endpoint : openai/gpt-image-2/edit
//   image    : REQUIRED — sent as image_urls array
//   params   : prompt, image_urls, quality, image_size, num_images, output_format

const FAL_ENDPOINT: Record<string, string> = {
  'nano-banana-pro': 'fal-ai/nano-banana-pro',
  'gpt-image-2':     'openai/gpt-image-2/edit',
}

type OutputQuality = 'hd' | '2k' | '4k'

// Vega: resolution param
function vegaResolution(q: OutputQuality): string {
  if (q === '4k') return '4K'
  if (q === '2k') return '2K'
  return '1K'
}

// Quasar: quality param (HD → medium to save cost; 2K/4K → high)
function quasarQuality(q: OutputQuality): string {
  return q === 'hd' ? 'medium' : 'high'
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  fal.config({ credentials: process.env.FAL_KEY })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let inputUrl: string | undefined
  let outputUrl: string | undefined

  try {
    const body = await req.json()
    const {
      imageBase64,
      projectType,
      segment,
      environment,
      lighting,
      background,
      sceneElements,
      geometryLock   = 85,
      model: engineId = 'nano-banana-pro',
      outputQuality   = 'hd',
      materials,
    } = body

    if (!projectType) {
      return NextResponse.json({ error: 'Tipo de projeto é obrigatório' }, { status: 400 })
    }

    // Quasar REQUIRES an image; Vega is text-to-image (image optional)
    if (engineId === 'gpt-image-2' && !imageBase64) {
      return NextResponse.json(
        { error: 'O motor Quasar requer uma imagem de referência' },
        { status: 400 }
      )
    }

    const falEndpoint = FAL_ENDPOINT[engineId] ?? 'fal-ai/nano-banana-pro'

    // Build the generation prompt from the architectural options
    const options: GenerateOptions = {
      projectType,
      segment:       segment       ?? 'Residencial',
      environment:   environment   ?? '',
      lighting:      lighting      ?? '',
      background:    background    ?? 'Preservar Original',
      sceneElements: sceneElements ?? [],
      geometryLock:  Number(geometryLock),
      materials:     materials as ProjectMaterials | undefined,
    }
    const finalPrompt = buildGenerationPrompt(options)

    console.log('[generate] engine    :', engineId, '→', falEndpoint)
    console.log('[generate] quality   :', outputQuality)
    console.log('[generate] prompt    :', finalPrompt)

    // ── Build model-specific input ────────────────────────────────────────────

    let falInput: Record<string, unknown>

    if (engineId === 'gpt-image-2') {
      // Quasar — image editing: upload image, send as image_urls array
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
      const buffer     = Buffer.from(base64Data, 'base64')
      const imageFile  = new File([buffer], 'input.jpg', { type: 'image/jpeg' })

      inputUrl = await fal.storage.upload(imageFile)
      console.log('[generate] inputUrl  :', inputUrl)

      falInput = {
        prompt:        finalPrompt,
        image_urls:    [inputUrl],
        quality:       quasarQuality(outputQuality as OutputQuality),
        image_size:    'auto',          // infer from input image
        num_images:    1,
        output_format: 'jpeg',
      }
    } else {
      // Vega — text-to-image: no image sent to API
      // If an image was uploaded, store it anyway so the before/after UI works
      if (imageBase64) {
        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
        const buffer     = Buffer.from(base64Data, 'base64')
        const imageFile  = new File([buffer], 'input.jpg', { type: 'image/jpeg' })
        inputUrl = await fal.storage.upload(imageFile)
        console.log('[generate] inputUrl (ref only):', inputUrl)
      }

      falInput = {
        prompt:        finalPrompt,
        resolution:    vegaResolution(outputQuality as OutputQuality),
        num_images:    1,
        output_format: 'jpeg',
      }
    }

    console.log('[generate] FAL INPUT :', JSON.stringify(falInput))

    const result = await fal.subscribe(falEndpoint, { input: falInput })

    console.log('[generate] FAL OUTPUT:', JSON.stringify(result.data))
    const images = (result.data as { images: { url: string }[] }).images
    outputUrl = images[0].url
    console.log('[generate] outputUrl :', outputUrl)

    // ── Persist result ────────────────────────────────────────────────────────

    const admin = createAdminClient()
    await Promise.all([
      admin.from('renders').insert({
        user_id:      user.id,
        input_url:    inputUrl ?? null,
        output_url:   outputUrl,
        prompt:       finalPrompt,
        ambient:      environment ?? segment ?? projectType,
        style:        projectType,
        lighting:     lighting ?? 'default',
        status:       'completed',
        completed_at: new Date().toISOString(),
      }),
      admin.rpc('consume_credit', { user_id_input: user.id }),
    ])

    const { data: profile } = await admin
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      outputUrl,
      originalUrl: inputUrl ?? null,
      credits:     profile?.credits ?? 0,
    })

  } catch (err: unknown) {
    const e = err as { status?: number; body?: unknown; message?: string }
    console.error('[generate] ERROR status:', e?.status)
    console.error('[generate] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))
    return NextResponse.json({ error: 'Erro ao gerar render. Tente novamente.' }, { status: 500 })
  }
}
