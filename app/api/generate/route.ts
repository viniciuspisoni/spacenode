import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerId } from '@/lib/workspaces/context'
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
import { generateImage, type GenerateImageResult } from '@/lib/ai/image-provider'
import {
  getRenderFidelityConfig,
  getFidelityAttemptParams,
} from '@/lib/ai/fidelity/render-only'
import {
  computeGeometryScore,
  buildEdgeMapPng,
  type GeometryScoreBreakdown,
} from '@/lib/ai/fidelity/geometry-score'
import { fetchStorageBuffer } from '@/lib/storage/fetch'
import { nearestSupportedAspectRatio } from '@/lib/ai/aspect-ratio'
import { analyzeImage } from '@/lib/fidelity-engine'
import sharp from 'sharp'

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

function falParamsForEngine(
  engine:      EngineId,
  resolution:  Resolution,
  aspectRatio: string | null = null,
): Record<string, unknown> {
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
    // Pino de formato (lib/ai/aspect-ratio): presente só quando o aspecto do
    // original bate (≤2%) com um valor suportado — previne o drift de
    // enquadramento em vez de puni-lo depois via aspectDelta. Ausente, o
    // motor segue o formato do input (default 'auto').
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
  }
}

// Teto do briefing de visão inline (PROJECT FACTS). analyzeImage nunca lança
// (fallback interno) — o race cobre lentidão extrema sem travar a geração.
const BRIEFING_TIMEOUT_MS = 15_000

// Type-guard mínimo pro briefing cacheado em renders.config_snapshot (foi
// persistido por nós via parseBriefing, mas o JSONB não tem contrato de tipo).
function isBriefing(value: unknown): value is BriefingArquitetonico {
  const b = value as BriefingArquitetonico | null
  return !!b && typeof b === 'object' &&
    typeof b.tipo_projeto === 'string' &&
    Array.isArray(b.elementos_preservar)
}

function truncateErr(err: unknown): string {
  const msg = (err as Error)?.message ?? String(err)
  return msg.length > 200 ? msg.slice(0, 200) + '…' : msg
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Base do orçamento de tempo do retry ladder (a Vercel mata no maxDuration).
  const routeStartedAt = Date.now()
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

    // ── Modo estrutural render_only (gate de fidelidade) ─────────────────────
    //
    // Na Máxima fidelidade o Renderizar opera em render_only: a imagem
    // original é a base obrigatória e o resultado é VALIDADO contra ela
    // (geometry score em lib/ai/fidelity/geometry-score). Score abaixo do
    // limite → retry com menos criatividade (temperatura ↓ no GCP), prompt de
    // escalada e condicionamento estrutural por edge map. Entrega a MELHOR
    // tentativa. RENDER_FIDELITY_GATE=0 restaura o comportamento single-shot.
    const fidelityCfg = getRenderFidelityConfig()
    const renderOnlyActive = fidelityLevel === 'maximum' && fidelityCfg.enabled

    // Refinamento explícito do usuário muda a cena de propósito — relaxa o
    // limite pra validação não brigar com o pedido.
    const minScore = refinementText?.trim()
      ? fidelityCfg.minScore * fidelityCfg.refinementRelaxFactor
      : fidelityCfg.minScore
    const maxAttempts = renderOnlyActive ? fidelityCfg.maxAttempts : 1

    console.log('[generate] engine     :', engine, '→', falEndpoint)
    console.log('[generate] resolution :', resolution, '→', nodesToCharge, 'nodes')
    console.log('[generate] fidelity   :', `${fidelityLevel}${briefing ? ' (+briefing)' : ''}${renderOnlyActive ? ` [render_only min=${minScore.toFixed(2)} max_attempts=${maxAttempts}]` : ''}`)
    devLog('[generate] anchor     :', hasAnchor ? anchorUrl : 'none')
    devLog('[generate] refine     :', refinementText?.trim() || 'none')

    // Buffer do original (autoridade de geometria) — presente no caminho
    // base64; no caminho inputUrl reusado, é baixado sob demanda pro score.
    let originalBuffer: Buffer | null = null
    if (providedInputUrl) {
      inputUrl = providedInputUrl
      devLog('[generate] inputUrl   : reused', inputUrl)
    } else {
      const base64Data = imageBase64!.includes(',') ? imageBase64!.split(',')[1] : imageBase64!
      originalBuffer = Buffer.from(base64Data, 'base64')
      // Uint8Array novo: BlobPart exige ArrayBuffer próprio (o let Buffer|null
      // alarga pra ArrayBufferLike e o File recusa).
      const imageFile  = new File([new Uint8Array(originalBuffer)], 'input.jpg', { type: 'image/jpeg' })
      inputUrl = await fal.storage.upload(imageFile)
      devLog('[generate] inputUrl   :', inputUrl)
    }

    // Anchor vai PRIMEIRO em image_urls — Gemini/NB2/GPT Image extraem
    // materiais e atmosfera dela antes de processar a geometria do input.
    const baseImageUrls = (anchorUrl && anchorUrl !== inputUrl)
      ? [anchorUrl, inputUrl]
      : [inputUrl]

    // Rótulos de papel por imagem, paralelos a baseImageUrls. No caminho GCP
    // cada rótulo vira uma parte de texto imediatamente antes da imagem —
    // binding explícito entre o "Image #N" do prompt e os pixels certos
    // (mesma correção do Spaces em lib/spaces/references.ts). Sem isso, com a
    // âncora primeiro, o modelo tende a ancorar a GEOMETRIA na imagem mais
    // acabada — exatamente o drift que o buildAnchorBlock tenta impedir.
    const baseImageLabels: string[] = baseImageUrls.length === 2
      ? [
          'Image #1 — MATERIAL & ATMOSPHERE ANCHOR (previous render of this same project: source of materials, textures and palette only):',
          'Image #2 — GEOMETRY SOURCE (architecture, layout, camera and perspective are law):',
        ]
      : ['Image #1 — REFERENCE IMAGE (mandatory base: geometry, camera, materials and framing are law):']

    // Buffer do original disponível cedo: alimenta o pino de aspect ratio e,
    // no render_only, o edge map/score (que antes o buscavam sob demanda).
    // Best-effort — sem buffer, os consumidores seguem sem ele.
    if (!originalBuffer) {
      try {
        originalBuffer = await fetchStorageBuffer(inputUrl)
      } catch (bufErr) {
        console.warn('[generate] original indisponível pra aspecto (segue sem):', truncateErr(bufErr))
      }
    }
    let aspectRatio: string | null = null
    if (originalBuffer) {
      try {
        const meta = await sharp(originalBuffer).metadata()
        aspectRatio = nearestSupportedAspectRatio(meta.width ?? null, meta.height ?? null)
      } catch { /* sem pino — motor segue o formato do input */ }
    }
    devLog('[generate] aspect     :', aspectRatio ?? 'auto (sem pino)')

    // Briefing de visão (PROJECT FACTS) — religado ao Renderizar. Ordem de
    // resolução: body (caller explícito, ex. Spaces) → cache do histórico
    // (mesmo input_url já analisado nesta conta) → análise Gemini inline com
    // teto de 15s. Em 'creative' não injetamos: os FACTS travam materiais e
    // entorno, contra o propósito do nível.
    let resolvedBriefing: BriefingArquitetonico | undefined = briefing
    let briefingSource: 'body' | 'cache' | 'vision' | 'none' = briefing ? 'body' : 'none'
    if (!resolvedBriefing && fidelityLevel !== 'creative') {
      if (providedInputUrl) {
        const { data: cachedRender } = await admin
          .from('renders')
          .select('config_snapshot')
          .eq('user_id', user.id)
          .eq('input_url', inputUrl)
          .not('config_snapshot->briefing', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const cachedBriefing = (cachedRender?.config_snapshot as { briefing?: unknown } | null)?.briefing
        if (isBriefing(cachedBriefing)) {
          resolvedBriefing = cachedBriefing
          briefingSource = 'cache'
        }
      }
      if (!resolvedBriefing) {
        const briefingStartedAt = Date.now()
        resolvedBriefing = await Promise.race([
          analyzeImage(inputUrl),
          new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), BRIEFING_TIMEOUT_MS)),
        ])
        if (resolvedBriefing) briefingSource = 'vision'
        devLog('[generate] briefing   :', briefingSource, `(${Date.now() - briefingStartedAt}ms)`)
      }
    }
    options.briefing = resolvedBriefing

    // Seed fixa por request (caminho GCP): retries do ladder viram variação
    // CONTROLADA da mesma amostra (só temperatura/edge map mudam) e o render
    // fica reproduzível. Os schemas FAL desses motores não expõem seed — lá
    // segue não-determinístico.
    const generationSeed = Math.floor(Math.random() * 2_147_483_647)

    // Orçamento de tempo: retries só rodam se sobrar tempo real de geração
    // (a Vercel mata a função no maxDuration — margem pra persistência).
    const ROUTE_BUDGET_MS = (maxDuration - 20) * 1000
    const remainingMs = () => ROUTE_BUDGET_MS - (Date.now() - routeStartedAt)

    interface FidelityAttemptLog {
      attempt:        number
      provider:       string
      provider_model: string
      request_id:     string | null
      temperature:    number
      edge_map_used:  boolean
      fallback_used:  boolean
      duration_ms:    number
      geometry:       GeometryScoreBreakdown | null
      score_error?:   string
    }

    let edgeMapUrl: string | null = null
    let finalPrompt = ''
    let best: { gen: GenerateImageResult; prompt: string; score: number | null } | null = null
    const attemptLogs: FidelityAttemptLog[] = []

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const params = getFidelityAttemptParams(attempt)

      // Condicionamento estrutural nos retries: lineart do original anexado
      // como imagem extra (upload único). Falha aqui NUNCA derruba a geração —
      // segue sem o edge map.
      let imageUrls = baseImageUrls
      let imageLabels = baseImageLabels
      let edgeMapImageIndex: number | null = null
      if (renderOnlyActive && params.useEdgeMap) {
        try {
          if (!originalBuffer) originalBuffer = await fetchStorageBuffer(inputUrl)
          if (!edgeMapUrl) {
            const edgePng = await buildEdgeMapPng(originalBuffer)
            edgeMapUrl = await fal.storage.upload(new File([new Uint8Array(edgePng)], 'edge-map.png', { type: 'image/png' }))
          }
          imageUrls = [...baseImageUrls, edgeMapUrl]
          edgeMapImageIndex = imageUrls.length
          imageLabels = [
            ...baseImageLabels,
            `Image #${edgeMapImageIndex} — STRUCTURAL CONSTRAINT MAP (edge/line map of the reference geometry; align every edge to it, never imitate its graphic style):`,
          ]
        } catch (edgeErr) {
          console.warn('[generate:fidelity] edge map indisponível (segue sem):', (edgeErr as Error).message)
        }
      }

      finalPrompt = buildFidelityPrompt(options, fidelityLevel, resolvedBriefing, {
        attempt,
        edgeMapImageIndex,
      })
      devLog('[generate] prompt     :', finalPrompt)

      const falInput = {
        prompt:     finalPrompt,
        image_urls: imageUrls,
        ...falParamsForEngine(engine, resolution, aspectRatio),
      }
      devLog('[generate] FAL INPUT  :', JSON.stringify(falInput))

      // Camada única de provider (lib/ai/image-provider): GCP/Vertex primário
      // quando IMAGE_PROVIDER_PRIMARY=gcp, fallback FAL transparente. Saída GCP
      // é re-hospedada no Storage; saída FAL continua sendo a URL da CDN.
      const attemptTimeoutMs = Math.min(FAL_TIMEOUT_MS[engine], Math.max(30_000, remainingMs() - 15_000))
      let gen: GenerateImageResult
      try {
        gen = await generateImage({
          falEndpoint,
          falInput,
          imageLabels,
          timeoutMs: attemptTimeoutMs,
          context:   attempt === 1 ? 'generate' : `generate#${attempt}`,
          deliver:   { kind: 'url', userId: user.id, area: 'renders' },
          gcpConfig: { temperature: params.temperature, seed: generationSeed },
        })
      } catch (genErr) {
        // Retry é best-effort: se JÁ existe imagem válida de tentativa
        // anterior, falha aqui não pode virar erro+refund pro usuário.
        if (attempt === 1 || !best) throw genErr
        console.warn(`[generate:fidelity] retry ${attempt} falhou (${truncateErr(genErr)}) — entregando a melhor tentativa anterior`)
        break
      }

      // Validação estrutural pós-geração — nunca derruba a request: falha no
      // score vira log e a imagem é entregue (comportamento legado).
      let geometry: GeometryScoreBreakdown | null = null
      let scoreError: string | undefined
      if (renderOnlyActive) {
        try {
          if (!originalBuffer) originalBuffer = await fetchStorageBuffer(inputUrl)
          const generatedBuffer = await fetchStorageBuffer(gen.images[0].url)
          geometry = await computeGeometryScore(originalBuffer, generatedBuffer)
        } catch (scoreErr) {
          scoreError = (scoreErr as Error).message
          console.warn('[generate:fidelity] geometry score indisponível:', scoreError)
        }
      }

      attemptLogs.push({
        attempt,
        provider:       gen.provider,
        provider_model: gen.providerModel,
        request_id:     gen.requestId,
        temperature:    params.temperature,
        edge_map_used:  edgeMapImageIndex !== null,
        fallback_used:  gen.fallbackUsed,
        duration_ms:    gen.latencyMs,
        geometry,
        ...(scoreError ? { score_error: scoreError } : {}),
      })

      // Log técnico do modo: provider, modelo, parâmetros de fidelidade,
      // tentativa e geometry score (requisito de observabilidade).
      console.log(
        `[generate:fidelity] attempt=${attempt}/${maxAttempts} provider=${gen.provider} model=${gen.providerModel} ` +
        `temp=${params.temperature} edgeMap=${edgeMapImageIndex !== null} ` +
        `score=${geometry ? geometry.score.toFixed(3) : 'n/a'}` +
        (geometry
          ? ` (recall=${geometry.edgeRecall.toFixed(3)} blockCorr=${geometry.blockCorrelation.toFixed(3)} worstBlock=${geometry.worstBlockDelta.toFixed(3)} aspectDelta=${geometry.aspectDelta.toFixed(3)})`
          : '') +
        ` min=${renderOnlyActive ? minScore.toFixed(2) : 'off'}`
      )

      if (!best || (geometry?.score ?? -1) > (best.score ?? -1)) {
        best = { gen, prompt: finalPrompt, score: geometry?.score ?? null }
      }

      const passed = !renderOnlyActive || geometry === null || geometry.score >= minScore
      if (passed) break
      if (attempt >= maxAttempts) {
        console.warn(`[generate:fidelity] score abaixo do limite após ${attempt} tentativas — entregando a melhor (score=${best.score?.toFixed(3) ?? 'n/a'})`)
        break
      }
      if (remainingMs() < 60_000) {
        console.warn('[generate:fidelity] sem orçamento de tempo pra retry — entregando a melhor tentativa')
        break
      }
    }

    // best sempre existe (≥ 1 tentativa). Entrega a de MAIOR score — não
    // necessariamente a última.
    if (!best) throw new Error('nenhuma tentativa de geração concluída')
    const gen = best.gen
    finalPrompt = best.prompt
    const fidelityScore = best.score
    const retryCount = attemptLogs.length - 1
    const generationDurationMs = attemptLogs.reduce((sum, a) => sum + a.duration_ms, 0)

    outputUrl = gen.images[0].url
    // Rastreabilidade: id do request no provider (requestId da fal ou
    // responseId do Vertex). Ver coluna renders.fal_request_id.
    const falRequestId = gen.requestId
    devLog('[generate] outputUrl  :', outputUrl, '| provider:', gen.provider, '| req:', falRequestId)

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
      // Briefing resolvido (body/cache/visão) — persistido aqui vira o cache
      // das próximas gerações com o mesmo input_url.
      briefing:      resolvedBriefing ?? null,
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
      retry_count:  retryCount,
      generation_log: {
        provider:       gen.provider,
        provider_model: gen.providerModel,
        fallback_used:  gen.fallbackUsed,
        provider_error: gen.errorMessage,
        endpoint:       falEndpoint,
        request_id:     falRequestId,
        engine,
        resolution,
        parameters:  falParamsForEngine(engine, resolution, aspectRatio),
        // Reprodutibilidade: seed aplicada no caminho GCP (a FAL não expõe).
        seed:            generationSeed,
        aspect_ratio:    aspectRatio,
        briefing_source: briefingSource,
        anchor_used: hasAnchor,
        image_count: baseImageUrls.length,
        duration_ms: generationDurationMs,
        nodes_charged: nodesToCharge,
        // Diagnóstico do modo estrutural render_only: limite, tentativas
        // (params + geometry score de cada) e score final da entregue.
        fidelity: renderOnlyActive
          ? {
              mode:        'render_only',
              min_score:   minScore,
              final_score: fidelityScore,
              attempts:    attemptLogs,
            }
          : null,
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

    // Saldo pós-débito da BOLSA (dono do workspace) — é dela que o débito saiu.
    const payerId = (await getPayerId(admin, user.id)) ?? user.id
    const { data: balance } = await admin
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance')
      .eq('user_id', payerId)
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
      // Diagnóstico do gate render_only. fidelityWarning: score final ficou
      // abaixo do limite mesmo após retries — a UI mostra o aviso (mesmo
      // papel do preservation_warning das vistas no Spaces).
      fidelityScore,
      fidelityAttempts: attemptLogs.length,
      fidelityWarning:  renderOnlyActive && fidelityScore !== null && fidelityScore < minScore,
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
