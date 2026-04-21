import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  // Diagnóstico temporário — remover após confirmar funcionamento
  console.log('[generate] FAL_KEY exists:', !!process.env.FAL_KEY)
  console.log('[generate] SUPABASE_SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Config dentro do handler garante que as env vars já foram carregadas
  fal.config({ credentials: process.env.FAL_KEY })

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
    const modelId = (formData.get('model') as string | null) ?? 'fal-ai/flux/dev/image-to-image'

    if (!imageFile || !prompt || !ambient || !style || !lighting) {
      return NextResponse.json(
        { error: 'Imagem, prompt, ambient, style e lighting são obrigatórios' },
        { status: 400 }
      )
    }

    // Higher lock → preserve geometry → lower strength (floor 0.15, ceiling 0.95)
    const geometryLock = Number(geometryLockRaw ?? 50)
    const strength = Math.max(0.15, Math.min(0.95, (100 - geometryLock) / 100))

    console.log('[generate] geometryLock:', geometryLock, '→ strength:', strength)
    console.log('[generate] prompt:', prompt)
    console.log('[generate] uploading to fal storage...')

    inputUrl = await fal.storage.upload(imageFile)
    console.log('[generate] inputUrl:', inputUrl)

    console.log('[generate] model:', modelId)
    const result = await fal.subscribe(modelId, {
      input: {
        image_url: inputUrl,
        prompt,
        strength,
        num_inference_steps: 40,
        guidance_scale: 7.5,
      },
    })

    console.log('[generate] fal result raw:', JSON.stringify(result.data))
    const images = (result.data as { images: { url: string }[] }).images
    outputUrl = images[0].url
    console.log('[generate] outputUrl:', outputUrl)

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
  } catch (err: unknown) {
    const e = err as { status?: number; body?: unknown; message?: string }
    console.error('[generate] error status:', e?.status)
    console.error('[generate] error body:', JSON.stringify(e?.body ?? e?.message ?? err))
    return NextResponse.json(
      { error: 'Erro ao gerar render. Tente novamente.' },
      { status: 500 }
    )
  }
}
