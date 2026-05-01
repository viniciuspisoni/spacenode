import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

fal.config({ credentials: process.env.FAL_KEY })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let inputUrl: string | undefined
  let outputUrl: string | undefined

  try {
    const formData = await req.formData()
    const imageFile   = formData.get('image')        as File   | null
    const modelId     = (formData.get('model')       as string | null) ?? 'fal-ai/clarity-upscaler'
    const scaleRaw    = (formData.get('scale')       as string | null) ?? '4'
    const description = (formData.get('description') as string | null) ?? ''

    if (!imageFile) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }

    const scale = Number(scaleRaw)
    const NODE_COST: Record<number, number> = { 2: 4, 4: 8, 8: 20 }
    const nodeCost = NODE_COST[scale] ?? 8

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

    const falInput = buildFalInput(modelId, inputUrl, scale, description)

    console.log('[upscale] model  :', modelId)
    console.log('[upscale] scale  :', scale)
    console.log('[upscale] input  :', JSON.stringify(falInput))

    const result = await fal.subscribe(modelId, { input: falInput })

    console.log('[upscale] output :', JSON.stringify(result.data))

    outputUrl = extractOutputUrl(modelId, result.data) ?? undefined

    if (!outputUrl) {
      throw new Error('Modelo não retornou imagem')
    }

    console.log('[upscale] outputUrl:', outputUrl)

    await Promise.all([
      admin.from('renders').insert({
        user_id:      user.id,
        input_url:    inputUrl,
        output_url:   outputUrl,
        prompt:       description || `upscale ${scale}x`,
        ambient:      'upscale',
        style:        modelId,
        lighting:     `${scale}x`,
        status:       'completed',
        completed_at: new Date().toISOString(),
      }),
      admin.rpc('consume_credits', { user_id_input: user.id, amount: nodeCost }),
    ])

    return NextResponse.json({ url: outputUrl, originalUrl: inputUrl })

  } catch (err: unknown) {
    const e = err as { status?: number; body?: unknown; message?: string }
    console.error('[upscale] ERROR status:', e?.status)
    console.error('[upscale] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))
    return NextResponse.json({ error: 'Erro ao fazer upscale. Tente novamente.' }, { status: 500 })
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildFalInput(
  modelId: string,
  imageUrl: string,
  scale: number,
  description: string,
): Record<string, unknown> {
  switch (modelId) {
    case 'fal-ai/clarity-upscaler':
      return {
        image_url:           imageUrl,
        scale_factor:        scale,
        prompt:              description || 'architectural render, building facade, photorealistic',
        creativity:          0.35,
        resemblance:         0.85,
        dynamic:             6,
        num_inference_steps: 20,
      }

    case 'fal-ai/supir':
      return {
        image_url:    imageUrl,
        scale:        scale,
        prompt:       description || 'architectural render, high resolution',
        face_restore: false,
      }

    case 'fal-ai/aura-sr':
      return {
        image_url:         imageUrl,
        upscaling_factor:  scale,
        overlapping_tiles: true,
      }

    case 'fal-ai/esrgan':
      return {
        image_url: imageUrl,
        scale:     scale,
      }

    default:
      return { image_url: imageUrl, scale }
  }
}

function extractOutputUrl(modelId: string, data: unknown): string | null {
  const d = data as Record<string, unknown>

  // Clarity, SUPIR, ESRGAN → { image: { url: string } }
  if (d?.image && typeof (d.image as Record<string, unknown>).url === 'string') {
    return (d.image as Record<string, unknown>).url as string
  }

  // AuraSR → { output_image_url: string }
  if (typeof d?.output_image_url === 'string') {
    return d.output_image_url as string
  }

  // Fallback genérico → { images: [{ url }] }
  if (Array.isArray(d?.images) && d.images[0]?.url) {
    return d.images[0].url as string
  }

  console.warn('[upscale] extractOutputUrl: estrutura desconhecida', JSON.stringify(data))
  return null
}
