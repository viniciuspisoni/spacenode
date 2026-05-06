import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildGenerationPrompt,
  buildFidelityPrompt,
  type GenerateOptions,
  type ProjectMaterials,
  type BriefingArquitetonico,
  type FidelityLevel,
} from '@/lib/prompts'

fal.config({ credentials: process.env.FAL_KEY })

const FAL_TIMEOUT_MS = 90_000

// ── Engine → Fal.ai endpoint ──────────────────────────────────────────────────
//
// Vega  (nano-banana-pro) = Gemini 3 Pro Image edit
//   endpoint : fal-ai/nano-banana-pro/edit
//   image    : REQUIRED via image_urls[] — referência geométrica e angular
//   params   : prompt, image_urls, resolution (1K/2K/4K), aspect_ratio
//
// Quasar (gpt-image-2) = OpenAI GPT Image 2 edit
//   endpoint : openai/gpt-image-2/edit
//   image    : REQUIRED via image_urls[] — edição de imagem
//   params   : prompt, image_urls, quality (medium/high)

const FAL_ENDPOINT: Record<string, string> = {
  'nano-banana-pro': 'fal-ai/nano-banana-pro/edit',
  'gpt-image-2':     'openai/gpt-image-2/edit',
}

type OutputQuality = 'hd' | '2k' | '4k'

const NODE_COST: Record<OutputQuality, number> = { hd: 4, '2k': 8, '4k': 20 }

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
      geometryLock    = 85,
      model: engineId = 'nano-banana-pro',
      outputQuality   = 'hd',
      materials,
      fidelityMode    = 'strict',
      // novos: vindos do /api/analyze quando o usuário usa Fidelity Engine
      briefing,                              // BriefingArquitetonico | undefined
      inputUrl: providedInputUrl,            // string | undefined — evita re-upload
      fidelityLevel = 'maximum',             // 'maximum' | 'balanced' | 'creative'
    } = body as {
      imageBase64?:    string
      projectType?:    'exterior' | 'interior'
      segment?:        string
      environment?:    string
      lighting?:       string
      background?:     string
      sceneElements?:  string[]
      geometryLock?:   number
      model?:          string
      outputQuality?:  string
      materials?:      ProjectMaterials
      fidelityMode?:   'strict' | 'balanced'
      briefing?:       BriefingArquitetonico
      inputUrl?:       string
      fidelityLevel?:  FidelityLevel
    }

    if ((!imageBase64 && !providedInputUrl) || !projectType) {
      return NextResponse.json(
        { error: 'Imagem e tipo de projeto são obrigatórios' },
        { status: 400 }
      )
    }

    const quality = outputQuality as OutputQuality
    if (!(quality in NODE_COST)) {
      return NextResponse.json({ error: 'Qualidade inválida.' }, { status: 400 })
    }
    const nodeCost = NODE_COST[quality]

    const falEndpoint = FAL_ENDPOINT[engineId] ?? 'fal-ai/nano-banana-pro/edit'

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
      fidelityMode:  fidelityMode  === 'balanced' ? 'balanced' : 'strict',
      fidelityLevel,
      briefing,
    }

    // Fidelity Engine: se o cliente mandou briefing, usa o prompt amarrado.
    // Caso contrário, fallback pro caminho legado (mantém compat 100%).
    const finalPrompt = briefing
      ? buildFidelityPrompt(briefing, options, fidelityLevel)
      : buildGenerationPrompt(options)

    console.log('[generate] engine    :', engineId, '→', falEndpoint)
    console.log('[generate] quality   :', outputQuality)
    console.log('[generate] fidelity  :', briefing ? `engine(${fidelityLevel})` : 'legacy')
    console.log('[generate] prompt    :', finalPrompt)

    // Upload da imagem (pula se /api/analyze já fez upload e mandou inputUrl)
    if (providedInputUrl) {
      inputUrl = providedInputUrl
      console.log('[generate] inputUrl  : reused', inputUrl)
    } else {
      const base64Data = imageBase64!.includes(',') ? imageBase64!.split(',')[1] : imageBase64!
      const buffer     = Buffer.from(base64Data, 'base64')
      const imageFile  = new File([buffer], 'input.jpg', { type: 'image/jpeg' })
      inputUrl = await fal.storage.upload(imageFile)
      console.log('[generate] inputUrl  :', inputUrl)
    }

    // ── Build model-specific input ────────────────────────────────────────────

    let falInput: Record<string, unknown>

    if (engineId === 'gpt-image-2') {
      // Quasar — GPT Image 2 edit
      falInput = {
        prompt:        finalPrompt,
        image_urls:    [inputUrl],
        quality:       quasarQuality(outputQuality as OutputQuality),
        image_size:    'auto',   // infere a partir da imagem de entrada
        num_images:    1,
        output_format: 'jpeg',
      }
    } else {
      // Vega — Gemini 3 Pro Image edit
      falInput = {
        prompt:        finalPrompt,
        image_urls:    [inputUrl],
        resolution:    vegaResolution(outputQuality as OutputQuality),
        num_images:    1,
        output_format: 'jpeg',
      }
    }

    console.log('[generate] FAL INPUT :', JSON.stringify(falInput))

    const result = await Promise.race([
      fal.subscribe(falEndpoint, { input: falInput }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('FAL_TIMEOUT'), { isFalTimeout: true })), FAL_TIMEOUT_MS)
      ),
    ])

    console.log('[generate] FAL OUTPUT:', JSON.stringify(result.data))
    const images = (result.data as { images: { url: string }[] }).images
    outputUrl = images[0].url
    console.log('[generate] outputUrl :', outputUrl)

    // ── Persist result ────────────────────────────────────────────────────────

    const admin = createAdminClient()
    const { error: insertError } = await admin.from('renders').insert({
      user_id:      user.id,
      input_url:    inputUrl ?? null,
      output_url:   outputUrl,
      prompt:       finalPrompt,
      ambient:      environment ?? segment ?? projectType,
      style:        projectType,
      lighting:     lighting ?? 'default',
      status:       'completed',
      completed_at: new Date().toISOString(),
    })
    if (insertError) throw Object.assign(new Error('DB_INSERT_FAILED'), { isDbError: true })
    await admin.rpc('consume_credits', { user_id_input: user.id, amount: nodeCost })

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
    const e = err as { status?: number; body?: unknown; message?: string; isFalTimeout?: boolean; isDbError?: boolean }
    console.error('[generate] ERROR status:', e?.status)
    console.error('[generate] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))

    let userMessage = 'Erro ao gerar render. Tente novamente.'
    if (e?.isFalTimeout)        userMessage = 'Tempo limite excedido. Tente uma qualidade menor.'
    else if (e?.isDbError)      userMessage = 'Render gerado, mas houve um erro ao salvar. Tente novamente.'
    else if (e?.status === 422) userMessage = 'Parâmetros inválidos para o motor selecionado.'
    else if (e?.status === 429) userMessage = 'Limite de requisições atingido. Aguarde alguns segundos.'

    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}
