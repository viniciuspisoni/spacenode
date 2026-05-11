import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildFidelityPrompt,
  type GenerateOptions,
  type ProjectMaterials,
  type BriefingArquitetonico,
  type FidelityLevel,
} from '@/lib/prompts'
import {
  ENGINES,
  type EngineId,
  type Resolution,
  getFalEndpoint,
  getNodesCost,
  isEngineId,
  isResolution,
  isValidCombination,
} from '@/lib/engines'

fal.config({ credentials: process.env.FAL_KEY })

const FAL_TIMEOUT_MS = 90_000

// ── Mapping de resolução interna → param da Fal.ai por engine ────────────────
//
// Vega   (Gemini 3 Pro Image edit) → `resolution` ∈ '1K'|'2K'|'4K'
// Pulsar (Nano Banana 2 edit)      → `resolution` ∈ '1K'|'2K'|'4K'
//   HD interno mapeia para '1K' na Fal.ai (NB2 não tem rótulo "HD" nativo).
// Quasar (GPT Image 2 edit)        → `quality` ∈ 'medium'|'high'
//   2K interno → 'medium', 4K → 'high'.

function falParamsForEngine(engine: EngineId, resolution: Resolution): Record<string, unknown> {
  if (engine === 'quasar') {
    return {
      quality:       resolution === '4k' ? 'high' : 'medium',
      image_size:    'auto',
      num_images:    1,
      output_format: 'jpeg',
    }
  }
  // vega | pulsar
  const map: Record<Resolution, string> = { hd: '1K', '2k': '2K', '4k': '4K' }
  return {
    resolution:    map[resolution],
    num_images:    1,
    output_format: 'jpeg',
  }
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // Estado pra refund: só refunda se o débito já passou.
  let debited       = false
  let nodesToCharge = 0
  let inputUrl:  string | undefined
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
      engine:     rawEngine,
      resolution: rawResolution,
      materials,
      fidelityMode  = 'strict',
      briefing,
      inputUrl:     providedInputUrl,
      fidelityLevel = 'maximum',
      anchorUrl,
      refinementText,
    } = body as {
      imageBase64?:    string
      projectType?:    'exterior' | 'interior'
      segment?:        string
      environment?:    string
      lighting?:       string
      background?:     string
      sceneElements?:  string[]
      geometryLock?:   number
      engine?:         string
      resolution?:     string
      materials?:      ProjectMaterials
      fidelityMode?:   'strict' | 'balanced'
      briefing?:       BriefingArquitetonico
      inputUrl?:       string
      fidelityLevel?:  FidelityLevel
      anchorUrl?:      string
      refinementText?: string
    }

    // ── Validações que ficam ANTES do débito ──────────────────────────────────

    if ((!imageBase64 && !providedInputUrl) || !projectType) {
      return NextResponse.json(
        { error: 'Imagem e tipo de projeto são obrigatórios' },
        { status: 400 }
      )
    }

    if (!isEngineId(rawEngine)) {
      return NextResponse.json({ error: 'Engine inválida ou ausente.' }, { status: 400 })
    }
    if (!isResolution(rawResolution)) {
      return NextResponse.json({ error: 'Resolução inválida ou ausente.' }, { status: 400 })
    }
    const engine:     EngineId   = rawEngine
    const resolution: Resolution = rawResolution

    if (!isValidCombination(engine, resolution)) {
      return NextResponse.json(
        { error: `Combinação inválida: ${ENGINES[engine].name} não suporta ${resolution.toUpperCase()}.` },
        { status: 400 }
      )
    }

    nodesToCharge = getNodesCost(engine, resolution)
    const falEndpoint = getFalEndpoint(engine)

    // ── Débito atômico antes da chamada Fal.ai ────────────────────────────────
    //
    // consume_nodes_v2 debita do plano primeiro, depois de Lumens FIFO. Falha
    // por exception com SQLSTATE específico — P0001 = saldo insuficiente
    // (mapeado para 402); resto vira 500.

    const { data: debitData, error: debitError } = await admin.rpc('consume_nodes_v2', {
      user_id_input: user.id,
      amount:        nodesToCharge,
    })
    if (debitError) {
      console.error('[generate] consume_nodes_v2 RPC error:', debitError)
      if (debitError.code === 'P0001') {
        return NextResponse.json(
          { error: `Nodes insuficientes. Necessários: ${nodesToCharge}.` },
          { status: 402 }
        )
      }
      return NextResponse.json({ error: 'Erro ao processar saldo.' }, { status: 500 })
    }
    const debit = debitData as {
      success:            boolean
      total_debited:      number
      from_plan:          number
      from_lumens:        number
      plan_balance_after: number
    }
    debited = true
    if (debit.from_lumens > 0) {
      console.log('[generate] débito misto:', debit.from_plan, 'plano +', debit.from_lumens, 'lumens')
    }

    // ── Geração ──────────────────────────────────────────────────────────────

    const hasAnchor = Boolean(anchorUrl)
    const options: GenerateOptions = {
      projectType,
      segment:       segment       ?? 'Residencial',
      environment:   environment   ?? '',
      lighting:      lighting      ?? '',
      background:    background    ?? 'Preservar Original',
      sceneElements: sceneElements ?? [],
      geometryLock:  Number(geometryLock),
      materials:     materials as ProjectMaterials | undefined,
      fidelityMode:  fidelityMode === 'balanced' ? 'balanced' : 'strict',
      fidelityLevel,
      briefing,
      hasAnchor,
      refinementText,
    }

    const finalPrompt = buildFidelityPrompt(options, fidelityLevel, briefing)

    console.log('[generate] engine     :', engine, '→', falEndpoint)
    console.log('[generate] resolution :', resolution, '→', nodesToCharge, 'nodes')
    console.log('[generate] fidelity   :', `${fidelityLevel}${briefing ? ' (+briefing)' : ''}`)
    console.log('[generate] anchor     :', hasAnchor ? anchorUrl : 'none')
    console.log('[generate] refine     :', refinementText?.trim() || 'none')
    console.log('[generate] prompt     :', finalPrompt)

    if (providedInputUrl) {
      inputUrl = providedInputUrl
      console.log('[generate] inputUrl   : reused', inputUrl)
    } else {
      const base64Data = imageBase64!.includes(',') ? imageBase64!.split(',')[1] : imageBase64!
      const buffer     = Buffer.from(base64Data, 'base64')
      const imageFile  = new File([buffer], 'input.jpg', { type: 'image/jpeg' })
      inputUrl = await fal.storage.upload(imageFile)
      console.log('[generate] inputUrl   :', inputUrl)
    }

    // Anchor vai PRIMEIRO em image_urls — Gemini/NB2/GPT Image extraem
    // materiais e atmosfera dela antes de processar a geometria do input.
    const imageUrls = (anchorUrl && anchorUrl !== inputUrl)
      ? [anchorUrl, inputUrl]
      : [inputUrl]

    const falInput = {
      prompt:     finalPrompt,
      image_urls: imageUrls,
      ...falParamsForEngine(engine, resolution),
    }

    console.log('[generate] FAL INPUT  :', JSON.stringify(falInput))

    const result = await Promise.race([
      fal.subscribe(falEndpoint, { input: falInput }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('FAL_TIMEOUT'), { isFalTimeout: true })), FAL_TIMEOUT_MS)
      ),
    ])

    console.log('[generate] FAL OUTPUT :', JSON.stringify(result.data))
    const images = (result.data as { images: { url: string }[] }).images
    outputUrl = images[0].url
    console.log('[generate] outputUrl  :', outputUrl)

    // ── Persistência ─────────────────────────────────────────────────────────
    //
    // Se a imagem foi gerada mas o INSERT falhou: NÃO refundamos. O usuário
    // recebeu o output e foi cobrado corretamente. Logamos pra reprocessar
    // o histórico manualmente.

    const { error: insertError } = await admin.from('renders').insert({
      user_id:       user.id,
      input_url:     inputUrl ?? null,
      output_url:    outputUrl,
      prompt:        finalPrompt,
      ambient:       environment ?? segment ?? projectType,
      style:         projectType,
      lighting:      lighting ?? 'default',
      engine,
      resolution,
      nodes_charged: nodesToCharge,
      status:        'completed',
      completed_at:  new Date().toISOString(),
    })
    if (insertError) {
      console.error('[generate] DB INSERT FALHOU (imagem gerada e debitada — investigar):', {
        error:   insertError,
        userId:  user.id,
        outputUrl,
      })
    }

    const { data: balance } = await admin
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      outputUrl,
      originalUrl:  inputUrl ?? null,
      // `credits` continua refletindo o saldo do plano (backward compat com
      // a UI atual em GenerateClient); novos campos detalham plano + Lumens.
      credits:      balance?.plan_balance  ?? 0,
      planBalance:  balance?.plan_balance  ?? 0,
      lumenBalance: balance?.lumen_balance ?? 0,
      totalBalance: balance?.total_balance ?? 0,
      nodesCharged: nodesToCharge,
      prompt:       finalPrompt,
    })

  } catch (err: unknown) {
    // ── Refund best-effort em qualquer falha pós-débito ───────────────────────
    if (debited && nodesToCharge > 0) {
      try {
        await admin.rpc('refund_nodes', { user_id_input: user.id, amount: nodesToCharge })
        console.warn('[generate] Refund executado:', nodesToCharge, 'nodes para', user.id)
      } catch (refundErr) {
        console.error('[generate] FALHA NO REFUND (CRÍTICO):', {
          err:    refundErr,
          userId: user.id,
          amount: nodesToCharge,
        })
      }
    }

    const e = err as { status?: number; body?: unknown; message?: string; isFalTimeout?: boolean }
    console.error('[generate] ERROR status:', e?.status)
    console.error('[generate] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))

    let userMessage = 'Erro ao gerar render. Tente novamente.'
    if (e?.isFalTimeout)        userMessage = 'Tempo limite excedido. Tente uma resolução menor.'
    else if (e?.status === 422) userMessage = 'Parâmetros inválidos para o motor selecionado.'
    else if (e?.status === 429) userMessage = 'Limite de requisições atingido. Aguarde alguns segundos.'

    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}
