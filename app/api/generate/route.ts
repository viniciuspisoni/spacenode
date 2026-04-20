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

  let imageUrl: string | undefined
  let outputUrl: string | undefined

  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File | null
    const prompt = formData.get('prompt') as string | null
    const geometryLockRaw = formData.get('geometryLock') as string | null

    if (!imageFile || !prompt) {
      return NextResponse.json(
        { error: 'Imagem e prompt são obrigatórios' },
        { status: 400 }
      )
    }

    const geometryLock = Number(geometryLockRaw ?? 50)
    // Higher lock → preserve geometry → lower AI strength
    const strength = (100 - geometryLock) / 100

    imageUrl = await fal.storage.upload(imageFile)

    const result = await fal.subscribe('fal-ai/flux/dev/image-to-image', {
      input: {
        image_url: imageUrl,
        prompt,
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
        user_id: user.id,
        original_image_url: imageUrl,
        result_image_url: outputUrl,
        prompt,
        geometry_lock: geometryLock,
      }),
      admin.rpc('deduct_credit', { p_user_id: user.id }),
    ])

    return NextResponse.json({ url: outputUrl, originalUrl: imageUrl })
  } catch (err) {
    console.error('[generate] error:', err)
    return NextResponse.json(
      { error: 'Erro ao gerar render. Tente novamente.' },
      { status: 500 }
    )
  }
}
