import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Quality boosters appended server-side to every prompt
const QUALITY_SUFFIX =
  ', highly detailed architectural visualization, ray-traced reflections, ' +
  'professional 8k rendering, realistic textures, cinematic lighting, ' +
  'sharp details, high-end materials, photorealistic'

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
    const formData = await req.formData()
    const imageFile      = formData.get('image')       as File   | null
    const prompt         = formData.get('prompt')      as string | null
    const ambient        = formData.get('ambient')     as string | null
    const style          = formData.get('style')       as string | null
    const lighting       = formData.get('lighting')    as string | null
    const geometryLockRaw = formData.get('geometryLock') as string | null
    const modelId        = (formData.get('model') as string | null)
                           ?? 'fal-ai/flux/dev/image-to-image'

    if (!imageFile || !prompt || !ambient || !style || !lighting) {
      return NextResponse.json(
        { error: 'Imagem, prompt, ambient, style e lighting são obrigatórios' },
        { status: 400 }
      )
    }

    // strength = 1 - (geometryLock / 100), clamped to [0.15, 0.95]
    // Higher strength = more AI transformation. Flux docs: "Higher values are better."
    const geometryLock = Number(geometryLockRaw ?? 50)
    const strength = Math.max(0.15, Math.min(0.95, 1 - geometryLock / 100))

    const finalPrompt = prompt + QUALITY_SUFFIX

    // ── Debug: full input to Fal.ai ──
    const falInput = {
      image_url:           'WILL_BE_SET_AFTER_UPLOAD',
      prompt:              finalPrompt,
      strength,
      num_inference_steps: 40,
      guidance_scale:      3.5,   // Flux recommended value — do NOT increase
    }
    console.log('[generate] model    :', modelId)
    console.log('[generate] lock     :', geometryLock, '→ strength:', strength)
    console.log('[generate] prompt   :', finalPrompt)
    console.log('[generate] params   :', { num_inference_steps: 40, guidance_scale: 3.5 })

    inputUrl = await fal.storage.upload(imageFile)
    falInput.image_url = inputUrl
    console.log('[generate] inputUrl :', inputUrl)
    console.log('[generate] FAL INPUT:', JSON.stringify(falInput))

    const result = await fal.subscribe(modelId, { input: { ...falInput, image_url: inputUrl } })

    console.log('[generate] FAL OUTPUT:', JSON.stringify(result.data))
    const images = (result.data as { images: { url: string }[] }).images
    outputUrl = images[0].url
    console.log('[generate] same as input?', outputUrl === inputUrl)
    console.log('[generate] outputUrl:', outputUrl)

    const admin = createAdminClient()
    await Promise.all([
      admin.from('renders').insert({
        user_id: user.id, input_url: inputUrl, output_url: outputUrl,
        prompt, ambient, style, lighting,
        status: 'completed', completed_at: new Date().toISOString(),
      }),
      admin.rpc('consume_credit', { user_id_input: user.id }),
    ])

    return NextResponse.json({ url: outputUrl, originalUrl: inputUrl })
  } catch (err: unknown) {
    const e = err as { status?: number; body?: unknown; message?: string }
    console.error('[generate] ERROR status:', e?.status)
    console.error('[generate] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))
    return NextResponse.json({ error: 'Erro ao gerar render. Tente novamente.' }, { status: 500 })
  }
}
