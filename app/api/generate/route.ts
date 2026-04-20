import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

fal.config({ credentials: process.env.FAL_KEY })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let inputUrl: string | undefined
  let outputUrl: string | undefined

  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File | null
    const prompt   = formData.get('prompt') as string | null
    const ambient  = formData.get('ambient') as string | null
    const style    = formData.get('style') as string | null
    const lighting = formData.get('lighting') as string | null
    const geometryLockRaw = formData.get('geometryLock') as string | null

    if (!imageFile || !prompt || !ambient || !style || !lighting) {
      return NextResponse.json(
        { error: 'Imagem, prompt, ambient, style e lighting são obrigatórios' },
        { status: 400 }
      )
    }

    // Higher lock → preserve geometry → lower fal strength
    const strength = (100 - Number(geometryLockRaw ?? 50)) / 100

    // Compose a rich prompt from all descriptors
    const falPrompt = `${prompt}, ${ambient}, ${style} style, ${lighting} lighting, photorealistic architectural render`

    inputUrl = await fal.storage.upload(imageFile)

    const result = await fal.subscribe('fal-ai/flux/dev/image-to-image', {
      input: {
        image_url: inputUrl,
        prompt: falPrompt,
        strength,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      },
    })

    const images = (result.data as { images: { url: string }[] }).images
    outputUrl = images[0].url

    const admin = createAdminClient()

    await Promise.all([
      admin.from('renders').insert({
        user_id:    user.id,
        input_url:  inputUrl,
        output_url: outputUrl,
        prompt,
        ambient,
        style,
        lighting,
        status:     'completed',
        completed_at: new Date().toISOString(),
      }),
      admin.rpc('consume_credit', { user_id_input: user.id }),
    ])

    return NextResponse.json({ url: outputUrl, originalUrl: inputUrl })
  } catch (err) {
    console.error('[generate] error:', err)
    return NextResponse.json(
      { error: 'Erro ao gerar render. Tente novamente.' },
      { status: 500 }
    )
  }
}
