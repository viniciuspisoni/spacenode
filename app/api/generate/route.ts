import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundNodes } from '@/lib/billing/refund-nodes'
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

// AL-9: logs verbosos (prompt proprietário, URLs de imagem do cliente, payload
// FAL) só em dev — em produção não vazam pros logs da Vercel.
const devLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args)
}

// A Vercel mata a função no maxDuration. Precisa cobrir o maior FAL_TIMEOUT_MS
// abaixo com folga, senão a geração lenta morre antes da nossa race e o usuário
// recebe um 504 opaco em vez da mensagem tratada (+ refund).
export const maxDuration = 300

// Timeout da chamada FAL por motor. Vega (Nano Banana Pro) e Quasar (GPT Image 2)
// são modelos de alta fidelidade e passam de 90s com frequência — independente do
// tamanho da imagem, sobretudo em 4K. Pulsar (Nano Banana 2) é rápido. O cap de 90s
// era curto demais pro Vega e fazia a geração falhar com "tente uma resolução menor"
// mesmo com imagem pequena. (O resto do código usa 150s pra esse mesmo endpoint.)
const FAL_TIMEOUT_MS: Record<EngineId, number> = {
  vega:   180_000,
  pulsar:  90_000,
  quasar: 180_000,
}

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

    const { data: debitData, error: debitError } = await admin.rpc('consume_workspace_nodes', {
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
    devLog('[generate] anchor     :', hasAnchor ? anchorUrl : 'none')
    devLog('[generate] refine     :', refinementText?.trim() || 'none')
    devLog('[generate] prompt     :', finalPrompt)

    if (providedInputUrl) {
      inputUrl = providedInputUrl
      devLog('[generate] inputUrl   : reused', inputUrl)
    } else {
      const base64Data = imageBase64!.includes(',') ? imageBase64!.split(',')[1] : imageBase64!
      const buffer     = Buffer.from(base64Data, 'base64')
      const imageFile  = new File([buffer], 'input.jpg', { type: 'image/jpeg' })
      inputUrl = await fal.storage.upload(imageFile)
      devLog('[generate] inputUrl   :', inputUrl)
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

    devLog('[generate] FAL INPUT  :', JSON.stringify(falInput))

    const generationStartedAt = Date.now()
    const result = await Promise.race([
      fal.subscribe(falEndpoint, { input: falInput }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('FAL_TIMEOUT'), { isFalTimeout: true })), FAL_TIMEOUT_MS[engine])
      ),
    ])

    const generationDurationMs = Date.now() - generationStartedAt

    devLog('[generate] FAL OUTPUT :', JSON.stringify(result.data))
    const images = (result.data as { images: { url: string }[] }).images
    outputUrl = images[0].url
    // Rastreabilidade: o id do request da fal liga esta linha à entrada no
    // painel da fal.ai (cruzar quem gerou o quê). Ver coluna renders.fal_request_id.
    const falRequestId = (result as { requestId?: string }).requestId ?? null
    devLog('[generate] outputUrl  :', outputUrl, '| fal req:', falRequestId)

    // ── Persistência ─────────────────────────────────────────────────────────
    //
    // Se a imagem foi gerada mas o INSERT falhou: NÃO refundamos. O usuário
    // recebeu o output e foi cobrado corretamente. Logamos pra reprocessar
    // o histórico manualmente.

    // Snapshot completo pra integração Spaces ← Renderizar.
    // Usado quando o usuário cria um Space a partir desta render
    // (alimenta DNA enriquecido + economiza re-extração de briefing).
    // Comportamento do Renderizar não muda — campo é só persistido.
    const configSnapshot = {
      projectType,
      segment:       segment       ?? null,
      environment:   environment   ?? null,
      lighting:      lighting      ?? null,
      background:    background    ?? null,
      sceneElements: sceneElements ?? [],
      geometryLock:  Number(geometryLock),
      fidelityMode:  fidelityMode  === 'balanced' ? 'balanced' : 'strict',
      fidelityLevel,
      materials:     materials     ?? null,
      briefing:      briefing      ?? null,
    }

    const baseRow = {
      user_id:         user.id,
      input_url:       inputUrl ?? null,
      output_url:      outputUrl,
      prompt:          finalPrompt,
      ambient:         environment ?? segment ?? projectType,
      style:           projectType,
      lighting:        lighting ?? 'default',
      engine,
      resolution,
      nodes_charged:   nodesToCharge,
      fal_request_id:  falRequestId,
      status:          'completed',
      completed_at:    new Date().toISOString(),
      config_snapshot: configSnapshot,
    }

    // Arquivo técnico do Histórico (migration 20260701000000): duração, prompt
    // original do usuário e log da chamada ao provider. Insert resiliente —
    // se a migration ainda não tiver sido aplicada (coluna inexistente),
    // regrava só com as colunas base para nunca perder o registro.
    const extendedRow = {
      ...baseRow,
      user_prompt:  refinementText?.trim() || null,
      duration_ms:  generationDurationMs,
      retry_count:  0,
      generation_log: {
        provider:    'fal',
        endpoint:    falEndpoint,
        request_id:  falRequestId,
        engine,
        resolution,
        parameters:  falParamsForEngine(engine, resolution),
        anchor_used: hasAnchor,
        image_count: imageUrls.length,
        duration_ms: generationDurationMs,
        nodes_charged: nodesToCharge,
      },
    }

    let insertResult = await admin
      .from('renders')
      .insert(extendedRow)
      .select('id')
      .single()

    if (insertResult.error && (insertResult.error.code === 'PGRST204' || insertResult.error.code === '42703')) {
      console.warn('[generate] colunas de metadados ausentes — regravando com colunas base:', insertResult.error.message)
      insertResult = await admin.from('renders').insert(baseRow).select('id').single()
    }

    const renderId = insertResult.data?.id ?? null
    if (insertResult.error) {
      console.error('[generate] DB INSERT FALHOU (imagem gerada e debitada — investigar):', {
        error:   insertResult.error,
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
      renderId,
      originalUrl:  inputUrl ?? null,
      // `credits` continua refletindo o saldo do plano (backward compat com
      // a UI atual em GenerateClient); novos campos detalham plano + Lumens.
      credits:      balance?.plan_balance  ?? 0,
      planBalance:  balance?.plan_balance  ?? 0,
      lumenBalance: balance?.lumen_balance ?? 0,
      totalBalance: balance?.total_balance ?? 0,
      nodesCharged: nodesToCharge,
      // O prompt final (buildFidelityPrompt) é proprietário e o GenerateClient
      // nunca o consumia — não viaja mais na resposta.
    })

  } catch (err: unknown) {
    // ── Refund best-effort em qualquer falha pós-débito ───────────────────────
    if (debited && nodesToCharge > 0) {
      await refundNodes(admin, user.id, nodesToCharge, { module: 'generate', jobTable: 'renders' })
    }

    const e = err as { status?: number; body?: unknown; message?: string; isFalTimeout?: boolean }
    console.error('[generate] ERROR status:', e?.status)
    console.error('[generate] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))

    let userMessage = 'Erro ao gerar render. Tente novamente.'
    if (e?.isFalTimeout)        userMessage = 'A geração demorou mais que o esperado. Tente novamente.'
    else if (e?.status === 422) userMessage = 'Parâmetros inválidos para o motor selecionado.'
    else if (e?.status === 429) userMessage = 'Limite de requisições atingido. Aguarde alguns segundos.'

    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}
