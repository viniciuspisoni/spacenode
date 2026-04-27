import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildGenerationPrompt, type GenerateOptions, type ProjectMaterials } from '@/lib/prompts'

// Note: fal-ai/flux/dev/image-to-image does NOT support negative_prompt.
// Flux guidance_scale default and recommended value is 3.5 (not SDXL range).

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
      geometryLock = 85,
      model: modelId = 'fal-ai/flux/dev/image-to-image',
      materials,
    } = body

    if (!imageBase64 || !projectType) {
      return NextResponse.json(
        { error: 'Imagem e tipo de projeto são obrigatórios' },
        { status: 400 }
      )
    }

    const options: GenerateOptions = {
      projectType,
      segment:       segment      ?? 'Residencial',
      environment:   environment  ?? '',
      lighting:      lighting     ?? '',
      background:    background   ?? 'Preservar Original',
      sceneElements: sceneElements ?? [],
      geometryLock:  Number(geometryLock),
      materials:     materials as ProjectMaterials | undefined,
    }

    const finalPrompt = buildGenerationPrompt(options)

    // strength = 1 - (geometryLock / 100), clamped to [0.15, 0.95]
    // Higher strength = more AI transformation. Flux docs: "Higher values are better."
    const strength = Math.max(0.15, Math.min(0.95, 1 - Number(geometryLock) / 100))

    console.log('[generate] model    :', modelId)
    console.log('[generate] lock     :', geometryLock, '→ strength:', strength)
    console.log('[generate] prompt   :', finalPrompt)
    console.log('[generate] params   :', { num_inference_steps: 40, guidance_scale: 3.5 })

    // Convert base64 data URL to File for fal.storage.upload
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
    const buffer = Buffer.from(base64Data, 'base64')
    const imageFile = new File([buffer], 'input.jpg', { type: 'image/jpeg' })

    inputUrl = await fal.storage.upload(imageFile)
    console.log('[generate] inputUrl :', inputUrl)

    const falInput = {
      image_url:           inputUrl,
      prompt:              finalPrompt,
      strength,
      num_inference_steps: 40,
      guidance_scale:      3.5,   // Flux recommended value — do NOT increase
    }
    console.log('[generate] FAL INPUT:', JSON.stringify(falInput))

    const result = await fal.subscribe(modelId, { input: falInput })

    console.log('[generate] FAL OUTPUT:', JSON.stringify(result.data))
    const images = (result.data as { images: { url: string }[] }).images
    outputUrl = images[0].url
    console.log('[generate] same as input?', outputUrl === inputUrl)
    console.log('[generate] outputUrl:', outputUrl)

    const admin = createAdminClient()
    await Promise.all([
      admin.from('renders').insert({
        user_id: user.id, input_url: inputUrl, output_url: outputUrl,
        prompt: finalPrompt,
        ambient: environment ?? segment ?? projectType,
        style:   projectType,
        lighting: lighting ?? 'default',
        status: 'completed', completed_at: new Date().toISOString(),
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
      originalUrl: inputUrl,
      credits: profile?.credits ?? 0,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; body?: unknown; message?: string }
    console.error('[generate] ERROR status:', e?.status)
    console.error('[generate] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))
    return NextResponse.json({ error: 'Erro ao gerar render. Tente novamente.' }, { status: 500 })
  }
}
