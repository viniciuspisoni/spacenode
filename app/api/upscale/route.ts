import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

fal.config({ credentials: process.env.FAL_KEY })

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ── Node costs ────────────────────────────────────────────────────────────────
// fal-based modes: cost derived from scale
const SCALE_COST: Record<number, number> = { 2: 4, 4: 8, 8: 20 }
// Provider-based fixed costs
const MODEL_COST: Record<string, number> = { magnific: 20, topaz: 40 }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let inputUrl: string | undefined
  let outputUrl: string | undefined

  try {
    const formData          = await req.formData()
    const imageFile         = formData.get('image')               as File   | null
    const modelId           = (formData.get('model')              as string | null) ?? 'fal-ai/clarity-upscaler'
    const scaleRaw          = (formData.get('scale')              as string | null) ?? '4'
    const description       = (formData.get('description')        as string | null) ?? ''
    const preserveGeometry  = (formData.get('preserveGeometry')   as string | null) === 'true'
    const recreationStrength = (formData.get('recreationStrength') as string | null) ?? 'low'
    const imageWidthRaw     = (formData.get('imageWidth')         as string | null)
    const imageHeightRaw    = (formData.get('imageHeight')        as string | null)

    if (!imageFile) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }

    const scale       = Number(scaleRaw)
    const imageWidth  = imageWidthRaw  ? Number(imageWidthRaw)  : null
    const imageHeight = imageHeightRaw ? Number(imageHeightRaw) : null
    const nodeCost    = MODEL_COST[modelId] ?? SCALE_COST[scale] ?? 8

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (!profile || profile.credits < nodeCost) {
      return NextResponse.json({ error: 'Créditos insuficientes' }, { status: 402 })
    }

    // ── Route to provider ─────────────────────────────────────────────────────
    if (modelId === 'magnific') {
      inputUrl  = await fal.storage.upload(imageFile)
      outputUrl = await upscaleWithMagnific(inputUrl, scale, preserveGeometry, recreationStrength)

    } else if (modelId === 'topaz') {
      outputUrl = await upscaleWithTopaz(imageFile, scale, imageWidth, imageHeight, preserveGeometry)
      inputUrl  = 'topaz-direct'

    } else {
      // fal.ai models (clarity, aura-sr, esrgan, supir)
      inputUrl = await fal.storage.upload(imageFile)
      const falInput = buildFalInput(modelId, inputUrl, scale, description, preserveGeometry, recreationStrength)

      console.log('[upscale] model  :', modelId)
      console.log('[upscale] scale  :', scale)
      console.log('[upscale] input  :', JSON.stringify(falInput))

      const result = await fal.subscribe(modelId, { input: falInput })

      console.log('[upscale] output :', JSON.stringify(result.data))

      outputUrl = extractOutputUrl(modelId, result.data) ?? undefined
      if (!outputUrl) throw new Error('Modelo não retornou imagem')
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
      supabase.rpc('consume_credits', { user_id_input: user.id, amount: nodeCost }),
    ])

    return NextResponse.json({ url: outputUrl, originalUrl: inputUrl })

  } catch (err: unknown) {
    const e = err as { status?: number; body?: unknown; message?: string }
    console.error('[upscale] ERROR status:', e?.status)
    console.error('[upscale] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))
    return NextResponse.json({ error: 'Erro ao fazer upscale. Tente novamente.' }, { status: 500 })
  }
}

// ── Magnific (Freepik) ────────────────────────────────────────────────────────

const MAGNIFIC_BASE = 'https://api.magnific.com/v1/ai/image-upscaler-precision-v2'
const CREATIVITY_PARAMS: Record<string, { sharpen: number; ultra_detail: number; smart_grain: number }> = {
  low:    { sharpen: 10, ultra_detail: 25, smart_grain: 5  },
  medium: { sharpen: 18, ultra_detail: 40, smart_grain: 8  },
  high:   { sharpen: 28, ultra_detail: 60, smart_grain: 12 },
}

async function upscaleWithMagnific(
  imageUrl: string,
  scale: number,
  preserveGeometry: boolean,
  recreationStrength: string,
): Promise<string> {
  const apiKey = process.env.MAGNIFIC_API_KEY
  if (!apiKey) throw new Error('MAGNIFIC_API_KEY não configurado')

  const params = CREATIVITY_PARAMS[recreationStrength] ?? CREATIVITY_PARAMS.low

  const submitRes = await fetch(MAGNIFIC_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-magnific-api-key': apiKey },
    body: JSON.stringify({
      image:        imageUrl,
      scale_factor: Math.min(scale, 16),
      flavor:       preserveGeometry ? 'photo' : 'sublime',
      sharpen:      params.sharpen,
      smart_grain:  params.smart_grain,
      ultra_detail: params.ultra_detail,
    }),
  })

  if (!submitRes.ok) {
    const body = await submitRes.text()
    throw new Error(`Magnific submit failed ${submitRes.status}: ${body}`)
  }

  const { data: submitData } = await submitRes.json() as { data: { task_id: string; status: string } }
  const taskId = submitData.task_id
  console.log('[magnific] task_id:', taskId)

  // Poll up to 25 times × 5s = ~125s
  for (let i = 0; i < 25; i++) {
    await sleep(5000)
    const pollRes = await fetch(`${MAGNIFIC_BASE}/${taskId}`, {
      headers: { 'x-magnific-api-key': apiKey },
    })
    const { data } = await pollRes.json() as { data: { status: string; generated: string[] } }
    console.log(`[magnific] poll ${i + 1}: ${data.status}`)

    if (data.status === 'COMPLETED' && data.generated?.[0]) return data.generated[0]
    if (data.status === 'FAILED') throw new Error('Magnific: task falhou')
  }

  throw new Error('Magnific: timeout após 125s')
}

// ── Topaz Gigapixel ───────────────────────────────────────────────────────────

const TOPAZ_BASE = 'https://api.topazlabs.com/image/v1'
const TOPAZ_MAX_PX = 32000

async function upscaleWithTopaz(
  imageFile: File,
  scale: number,
  srcWidth:  number | null,
  srcHeight: number | null,
  preserveGeometry: boolean,
): Promise<string> {
  const apiKey = process.env.TOPAZ_API_KEY
  if (!apiKey) throw new Error('TOPAZ_API_KEY não configurado')

  const form = new FormData()
  form.append('image',         imageFile)
  form.append('model',         preserveGeometry ? 'High Fidelity V2' : 'Art & CGI')
  form.append('output_format', 'jpeg')

  if (srcWidth && srcHeight) {
    const w = Math.min(srcWidth  * scale, TOPAZ_MAX_PX)
    const h = Math.min(srcHeight * scale, TOPAZ_MAX_PX)
    form.append('output_width',  String(w))
    form.append('output_height', String(h))
  }

  const submitRes = await fetch(`${TOPAZ_BASE}/enhance/async`, {
    method:  'POST',
    headers: { 'X-API-KEY': apiKey },
    body:    form,
  })

  if (!submitRes.ok) {
    const body = await submitRes.text()
    throw new Error(`Topaz submit failed ${submitRes.status}: ${body}`)
  }

  const { process_id } = await submitRes.json() as { process_id: string }
  console.log('[topaz] process_id:', process_id)

  // Poll up to 30 times × 4s = ~120s
  for (let i = 0; i < 30; i++) {
    await sleep(4000)
    const statusRes = await fetch(`${TOPAZ_BASE}/status/${process_id}`, {
      headers: { 'X-API-KEY': apiKey },
    })
    const { status } = await statusRes.json() as { status: string }
    console.log(`[topaz] poll ${i + 1}: ${status}`)

    if (status === 'Completed') break
    if (status === 'Failed' || status === 'Cancelled') throw new Error(`Topaz: ${status}`)
  }

  const dlRes = await fetch(`${TOPAZ_BASE}/download/${process_id}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!dlRes.ok) throw new Error(`Topaz download failed ${dlRes.status}`)
  const { url } = await dlRes.json() as { url: string }
  return url
}

// ── fal.ai helpers ────────────────────────────────────────────────────────────

const CREATIVITY: Record<string, number> = { low: 0.15, medium: 0.35, high: 0.6 }

function buildFalInput(
  modelId: string,
  imageUrl: string,
  scale: number,
  description: string,
  preserveGeometry = true,
  recreationStrength = 'low',
): Record<string, unknown> {
  switch (modelId) {
    case 'fal-ai/clarity-upscaler':
      return {
        image_url:           imageUrl,
        scale_factor:        scale,
        prompt:              description || 'architectural render, building facade, photorealistic',
        creativity:          CREATIVITY[recreationStrength] ?? 0.15,
        resemblance:         preserveGeometry ? 0.92 : 0.80,
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

  // Fallback → { images: [{ url }] }
  if (Array.isArray(d?.images) && d.images[0]?.url) {
    return d.images[0].url as string
  }

  console.warn('[upscale] extractOutputUrl: estrutura desconhecida', JSON.stringify(data))
  return null
}
