import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import sharp from 'sharp'
import { getRequestUser } from '@/lib/auth/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { DIRECT_UPLOAD_AREAS, downloadDirectUpload } from '@/lib/storage/direct-upload'
import { getPayerId } from '@/lib/workspaces/context'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { APRESENTAR_TOOLS, getHumanizedPlanLook } from '@/lib/apresentar/config'
import { buildHumanizedPlanPrompt } from '@/lib/apresentar/humanized-plan-prompt'
import { degradedBrief, readPlan } from '@/lib/apresentar/plan-reader'
import { getFalEndpoint, getNodesCost, type EngineId, type Resolution } from '@/lib/engines'
import { falParamsForEngine } from '@/lib/ai/engine-params'
import { nearestSupportedAspectRatio } from '@/lib/ai/aspect-ratio'
import { generateImage, type GenerateImageResult } from '@/lib/ai/image-provider'
import { buildEdgeMapPng } from '@/lib/ai/fidelity/geometry-score'
import { computeInkScore, type InkScoreBreakdown } from '@/lib/ai/fidelity/ink-score'
import { fetchStorageBuffer } from '@/lib/storage/fetch'
import type {
  HumanizedPlanProjectType,
  HumanizedPlanStyle,
  HumanizedPlanLevel,
  HumanizedPlanOptions,
  PlanBrief,
} from '@/lib/apresentar/config'

export const maxDuration = 300

fal.config({ credentials: process.env.FAL_KEY })

// 180 s: o Seedream Pro tem cauda medida de 134–145 s em produção (ver o
// comentário do orçamento da ark em lib/ai/image-provider). Os 90 s antigos
// eram do nano-banana-pro e matariam metade das gerações deste motor.
const FAL_TIMEOUT_MS = 180_000

// ── Apresentar · Planta Humanizada ───────────────────────────────────────────
//
// Pipeline em quatro estágios (reescrito em 2026-09-22):
//
//   1. LEITURA (gemini-2.5-flash, ~US$0,002) — lê a planta técnica e devolve
//      tipo de projeto, ambientes com nome PT-BR e caixa, e se já há texto
//      impresso. Nunca derruba a geração: falha vira brief degradado.
//   2. HUMANIZAÇÃO (Quasar / Seedream 5.0 Pro Edit, US$0,045 na faixa barata)
//      com prompt POR AMBIENTE derivado do brief, e sem pedir tipografia.
//   3. PORTÃO DE TINTA (local, custo zero) — computeInkScore no lugar do
//      computeGeometryScore, que foi medido e reprovado para traço fino
//      (bench do Ampliar, 19/09: em planta o edge recall a 384 px oscila ±7%
//      entre fixtures e inverte o vencedor).
//   4. RÓTULOS — desenhados pela aplicação em vetor, no cliente, a partir das
//      posições do estágio 1. O modelo de imagem não escreve nada.
//
// Por que a troca de motor: o nano-banana-pro custava US$0,134–0,150 por
// imagem contra receita de US$0,27 no piso (20 nodes × R$0,0729/node ÷ 5,40) —
// 50% de margem numa tentativa e 0,7% quando o gate pedia a segunda. Na faixa
// barata do Seedream a mesma imagem sai por US$0,045: 83% no piso. O que o
// nano-banana-pro fazia melhor era TEXTO, e o texto saiu do modelo.
//
// ⚠️ A faixa barata depende de SEEDREAM_CHEAP_TIER=1 no ambiente. Sem a env o
// pedido vai em 'auto_2K' e o custo DOBRA (US$0,09 na ark): a margem no piso
// cai de 83% pra 67%. Ver lib/ai/seedream-size.ts.

const TOOL = APRESENTAR_TOOLS.humanized_plan

// Tipos válidos vindos do client/plugin (validação defensiva)
const VALID_PROJECT_TYPES: HumanizedPlanProjectType[] = ['apartamento','casa','comercial','corporativo','paisagismo']
const VALID_STYLES:        HumanizedPlanStyle[]       = ['clean_tecnico','imobiliario_premium','editorial_minimalista','aquarelado','contemporaneo']
const VALID_LEVELS:        HumanizedPlanLevel[]       = ['leve','equilibrado','completo']

const LEGACY_OPTIONS: HumanizedPlanOptions = {
  addFurniture: true, addVegetation: true, applyFloorTextures: true,
  addSoftShadows: true, preserveLines: true, addRoomLabels: true,
}

// ── Portão de fidelidade (envs com defaults) ─────────────────────────────────
//
//   HUMANIZED_PLAN_FIDELITY_GATE  '0' desliga validação+retry (rollback rápido)
//   HUMANIZED_PLAN_MIN_INK_SCORE  limite do ink score (default 0.55)
//   HUMANIZED_PLAN_MAX_ATTEMPTS   total de tentativas (default 2, cap 3)
//
// O limite de 0,55 é conservador DE PROPÓSITO. Nas fixtures sintéticas a planta
// fiel pontua 1,00 e as violações 0,36–0,56; saída de modelo real não alinha
// pixel a pixel e vai pontuar abaixo de 1,00, e o retry custa uma geração
// inteira: a 10% de disparo a margem no piso fica em 81%, a 50% cai pra 72%.
// Subir o limite só depois de ver a distribuição real em `fidelity.attempts`.
function getPlanFidelityConfig(): { enabled: boolean; minScore: number; maxAttempts: number } {
  const rawScore    = Number(process.env.HUMANIZED_PLAN_MIN_INK_SCORE)
  const rawAttempts = Number(process.env.HUMANIZED_PLAN_MAX_ATTEMPTS)
  return {
    enabled:     process.env.HUMANIZED_PLAN_FIDELITY_GATE !== '0',
    minScore:    Number.isFinite(rawScore) && rawScore > 0 && rawScore < 1 ? rawScore : 0.55,
    maxAttempts: Number.isFinite(rawAttempts) && rawAttempts >= 1 ? Math.min(Math.floor(rawAttempts), 3) : 2,
  }
}

/** Leitura ligada? Desligar volta ao prompt genérico e tira os rótulos. */
function planReaderEnabled(): boolean {
  return process.env.HUMANIZED_PLAN_READER !== '0'
}

interface ResolvedSettings {
  projectType: HumanizedPlanProjectType
  style:       HumanizedPlanStyle
  level:       HumanizedPlanLevel
  options:     HumanizedPlanOptions
  look:        string | null
}

interface RawSettings {
  look?:        string | null
  projectType?: string | null
  style?:       string | null
  level?:       string | null
  options?:     HumanizedPlanOptions | null
}

/**
 * Resolve as configurações a partir do `look` (web — uma escolha só) ou dos
 * campos soltos (plugin do SketchUp 1.8.0, que está em produção e não pode
 * quebrar). O `look` vence quando presente.
 */
function resolveSettings(raw: RawSettings): ResolvedSettings | { error: string } {
  const lookSpec = getHumanizedPlanLook(raw.look)
  if (raw.look && !lookSpec) return { error: 'Acabamento inválido' }

  // projectType continua aceito (o plugin manda), mas virou apenas o palpite
  // inicial: quem decide é o leitor de visão, que lê a planta de verdade.
  const projectType = VALID_PROJECT_TYPES.includes(raw.projectType as HumanizedPlanProjectType)
    ? raw.projectType as HumanizedPlanProjectType
    : 'apartamento'

  if (lookSpec) {
    return { projectType, style: lookSpec.style, level: lookSpec.level, options: lookSpec.options, look: lookSpec.id }
  }

  // Caminho legado — exige os campos como sempre exigiu.
  if (!VALID_STYLES.includes(raw.style as HumanizedPlanStyle)) return { error: 'Estilo inválido' }
  if (!VALID_LEVELS.includes(raw.level as HumanizedPlanLevel)) return { error: 'Nível inválido' }

  return {
    projectType,
    style:   raw.style as HumanizedPlanStyle,
    level:   raw.level as HumanizedPlanLevel,
    options: raw.options ?? LEGACY_OPTIONS,
    look:    null,
  }
}

export async function POST(req: NextRequest) {
  // getRequestUser em vez do cookie puro: é o mesmo portão do /api/generate e
  // do catálogo, e é o que deixa o painel do SketchUp entrar com o token de
  // dispositivo. O site continua entrando pelo cookie, pelo mesmo caminho.
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  let debited = false
  let nodesToCharge = 0
  let inputUrl: string | undefined
  let outputUrl: string | undefined

  try {
    // Duas entradas, um pipeline: o site manda multipart com o arquivo; o
    // painel do SketchUp manda JSON com `sourceKey` (a planta já subiu direto
    // pro Storage, como o /api/generate faz com a captura).
    const isJson = (req.headers.get('content-type') || '').includes('application/json')

    let imageFile:  File   | null = null
    let optionsRaw: string | null = null
    let additionalInstructionsRaw: string | null = null
    const rawSettings: RawSettings = {}

    if (isJson) {
      const body = await req.json().catch(() => null) as Record<string, unknown> | null
      if (!body) return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })

      const sourceKey = typeof body.sourceKey === 'string' ? body.sourceKey : ''
      if (!sourceKey) return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })

      // A mesma área do Renderizar: valida dono, tamanho e mime antes de virar
      // arquivo. Chave de outro usuário não passa.
      const src = await downloadDirectUpload(
        admin, DIRECT_UPLOAD_AREAS['render-source'], user.id, {}, sourceKey,
      )
      if (!src.ok) return NextResponse.json({ error: src.message }, { status: src.status })

      imageFile = new File([new Uint8Array(src.buffer)], 'planta.png', { type: src.mime })
      rawSettings.look        = typeof body.look        === 'string' ? body.look        : null
      rawSettings.projectType = typeof body.projectType === 'string' ? body.projectType : null
      rawSettings.style       = typeof body.style       === 'string' ? body.style       : null
      rawSettings.level       = typeof body.level       === 'string' ? body.level       : null
      optionsRaw  = body.options && typeof body.options === 'object' ? JSON.stringify(body.options) : null
      additionalInstructionsRaw = typeof body.additionalInstructions === 'string' ? body.additionalInstructions : null
    } else {
      const formData = await req.formData()
      imageFile = formData.get('image') as File | null
      rawSettings.look        = formData.get('look')        as string | null
      rawSettings.projectType = formData.get('projectType') as string | null
      rawSettings.style       = formData.get('style')       as string | null
      rawSettings.level       = formData.get('level')       as string | null
      optionsRaw  = formData.get('options') as string | null
      additionalInstructionsRaw = formData.get('additionalInstructions') as string | null
    }
    const additionalInstructions = additionalInstructionsRaw?.trim().slice(0, 400) || null

    // ── Validações ────────────────────────────────────────────────────────────
    if (!imageFile) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }
    if (optionsRaw) {
      try {
        rawSettings.options = JSON.parse(optionsRaw) as HumanizedPlanOptions
      } catch {
        return NextResponse.json({ error: 'Opções inválidas' }, { status: 400 })
      }
    }

    const resolved = resolveSettings(rawSettings)
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 })
    const { style, level, options, look } = resolved

    if (!TOOL.engine || !TOOL.resolution) {
      return NextResponse.json({ error: 'Ferramenta não configurada' }, { status: 500 })
    }
    const engine      = TOOL.engine     as EngineId
    const resolution  = TOOL.resolution as Resolution
    nodesToCharge     = getNodesCost(engine, resolution)
    const falEndpoint = getFalEndpoint(engine)

    // ── Débito atômico ────────────────────────────────────────────────────────
    const { error: debitError } = await admin.rpc('consume_workspace_nodes', {
      user_id_input: user.id,
      amount:        nodesToCharge,
    })
    if (debitError) {
      console.error('[apresentar/humanized-plan] consume_nodes_v2 error:', debitError)
      if (debitError.code === 'P0001') {
        return NextResponse.json(
          { error: `Nodes insuficientes. Necessários: ${nodesToCharge}.` },
          { status: 402 }
        )
      }
      return NextResponse.json({ error: 'Erro ao processar saldo.' }, { status: 500 })
    }
    debited = true

    inputUrl = await fal.storage.upload(imageFile)
    // Buffer do original direto do upload — sem re-fetch.
    const originalBuffer = Buffer.from(await imageFile.arrayBuffer())
    const srcMeta = await sharp(originalBuffer).metadata().catch(() => null)
    const sourceSize = srcMeta?.width && srcMeta?.height
      ? { width: srcMeta.width, height: srcMeta.height }
      : null

    // ── Estágio 1 · leitura da planta ────────────────────────────────────────
    const readerStartedAt = Date.now()
    const brief: PlanBrief = planReaderEnabled()
      ? await readPlan(inputUrl, resolved.projectType)
      : degradedBrief(resolved.projectType, 'reader desligado (HUMANIZED_PLAN_READER=0)')
    const readerMs = Date.now() - readerStartedAt

    // Só desenhamos rótulo quando temos POSIÇÃO e a planta ainda não traz texto
    // impresso — dois textos no mesmo lugar é pior que nenhum.
    const labelsDrawnLocally =
      !!options.addRoomLabels && !brief.degraded && brief.rooms.length > 0 && !brief.hasPrintedLabels

    console.log(
      `[apresentar/humanized-plan] engine=${engine} → ${falEndpoint} | ${resolution} → ${nodesToCharge} nodes`
    )
    console.log(
      `[apresentar/humanized-plan:reader] ${readerMs}ms tipo=${brief.projectType} ambientes=${brief.rooms.length} ` +
      `textoImpresso=${brief.hasPrintedLabels} rotulosLocais=${labelsDrawnLocally}` +
      (brief.degraded ? ` DEGRADADO(${brief.degradedReason})` : '')
    )

    // ── Estágios 2 e 3 · geração com portão de tinta ─────────────────────────
    const gate = getPlanFidelityConfig()
    const maxAttempts = gate.enabled ? gate.maxAttempts : 1

    const aspectRatio = nearestSupportedAspectRatio(sourceSize?.width, sourceSize?.height)
    // `forceCheapTier`: a faixa barata do Seedream é pedida AQUI, não pela env
    // global. `SEEDREAM_CHEAP_TIER` vale para todo o Quasar, que é o motor
    // padrão do Renderizar — ligá-la para fechar a margem desta ferramenta
    // encolheria toda imagem do Renderizar de ~4,2 MP para ~2,36 MP. Numa
    // planta de apresentação 2,36 MP sobra; num render que o cliente amplia,
    // não. Assim os 83% de margem no piso não dependem de env nenhuma.
    const baseParams  = falParamsForEngine(engine, resolution, aspectRatio, sourceSize, { forceCheapTier: true })

    let edgeMapUrl: string | null = null
    let prompt = ''
    let best: { gen: GenerateImageResult; prompt: string; score: number | null } | null = null
    const attemptLogs: {
      attempt: number; provider: string; provider_model: string | null
      edge_map_used: boolean; duration_ms: number
      ink: InkScoreBreakdown | null; score_error?: string
    }[] = []

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Condicionamento estrutural no retry: lineart da planta original anexado
      // como imagem extra. Falha aqui NUNCA derruba a geração — segue sem ele.
      // Custa +US$0,003 (ark) por imagem de entrada além da primeira, por isso
      // só entra da segunda tentativa em diante.
      let imageUrls = [inputUrl]
      let edgeMapImageIndex: number | null = null
      if (gate.enabled && attempt >= 2) {
        try {
          if (!edgeMapUrl) {
            const edgePng = await buildEdgeMapPng(originalBuffer)
            edgeMapUrl = await fal.storage.upload(new File([new Uint8Array(edgePng)], 'edge-map.png', { type: 'image/png' }))
          }
          imageUrls = [inputUrl, edgeMapUrl]
          edgeMapImageIndex = imageUrls.length
        } catch (edgeErr) {
          console.warn('[apresentar/humanized-plan] edge map indisponível (segue sem):', (edgeErr as Error).message)
        }
      }

      prompt = buildHumanizedPlanPrompt(
        { brief, style, level, options, additionalInstructions, labelsDrawnLocally },
        { attempt, edgeMapImageIndex },
      )

      // Parâmetros POR MOTOR (lib/ai/engine-params): o Quasar usa `image_size`
      // e não aceita o `resolution` do Vega. A rota montava o payload do Vega
      // na mão — era um bug latente esperando a troca de motor.
      const falInput = { prompt, image_urls: imageUrls, ...baseParams }

      let gen: GenerateImageResult
      try {
        gen = await generateImage({
          falEndpoint,
          falInput,
          timeoutMs: FAL_TIMEOUT_MS,
          context:   attempt === 1 ? 'apresentar/humanized-plan' : `apresentar/humanized-plan#${attempt}`,
          deliver:   { kind: 'url', userId: user.id, area: 'apresentar' },
          gcpConfig: { temperature: 0.2 },
        })
      } catch (genErr) {
        // Retry é best-effort: com imagem válida de tentativa anterior, falha
        // aqui não pode virar erro+estorno pro usuário.
        if (attempt === 1 || !best) throw genErr
        console.warn(`[apresentar/humanized-plan] retry ${attempt} falhou — entregando a melhor tentativa anterior`)
        break
      }
      if (!gen.images[0]?.url) {
        if (attempt === 1 || !best) throw new Error('Provider não retornou imagem')
        break
      }

      // Validação estrutural pós-geração — nunca derruba a request: falha no
      // score vira log e a imagem é entregue.
      let ink: InkScoreBreakdown | null = null
      let scoreError: string | undefined
      if (gate.enabled) {
        try {
          const generatedBuffer = await fetchStorageBuffer(gen.images[0].url)
          ink = await computeInkScore(originalBuffer, generatedBuffer)
        } catch (scoreErr) {
          scoreError = (scoreErr as Error).message
          console.warn('[apresentar/humanized-plan] ink score indisponível:', scoreError)
        }
      }

      attemptLogs.push({
        attempt,
        provider:       gen.provider,
        provider_model: gen.providerModel,
        edge_map_used:  edgeMapImageIndex !== null,
        duration_ms:    gen.latencyMs,
        ink,
        ...(scoreError ? { score_error: scoreError } : {}),
      })

      console.log(
        `[apresentar/humanized-plan:fidelity] attempt=${attempt}/${maxAttempts} provider=${gen.provider} ` +
        `edgeMap=${edgeMapImageIndex !== null} score=${ink ? ink.score.toFixed(3) : 'n/a'} ` +
        `(line=${ink ? ink.lineRecall.toFixed(3) : '—'} worst=${ink ? ink.worstRegionRecall.toFixed(3) : '—'}) ` +
        `min=${gate.enabled ? gate.minScore.toFixed(2) : 'off'}`
      )

      if (!best || (ink?.score ?? -1) > (best.score ?? -1)) {
        best = { gen, prompt, score: ink?.score ?? null }
      }

      // `ink === null` = o original não é desenho de traço (foto, render). Não
      // há o que preservar: entrega sem retry, em vez de cobrar duas gerações
      // por uma régua que não se aplica àquela entrada.
      const passed = !gate.enabled || ink === null || ink.score >= gate.minScore
      if (passed) break
      if (attempt >= maxAttempts) {
        console.warn(`[apresentar/humanized-plan:fidelity] score abaixo do limite após ${attempt} tentativas — entregando a melhor (score=${best.score?.toFixed(3) ?? 'n/a'})`)
      }
    }

    if (!best) throw new Error('nenhuma tentativa de geração concluída')
    const gen = best.gen
    prompt = best.prompt

    outputUrl = gen.images[0]?.url
    if (!outputUrl) throw new Error('Provider não retornou imagem')
    const falRequestId = gen.requestId
    console.log('[apresentar/humanized-plan] outputUrl :', outputUrl, '| provider:', gen.provider, '| req:', falRequestId)

    // ── Persistência ──────────────────────────────────────────────────────────
    const configSnapshot = {
      tool:        TOOL.id,
      module:      'apresentar',
      look,
      projectType: brief.projectType,
      style,
      level,
      options,
      additionalInstructions,
      plan_brief: {
        rooms:                brief.rooms,
        has_outdoor:          brief.hasOutdoor,
        has_printed_labels:   brief.hasPrintedLabels,
        degraded:             brief.degraded,
        degraded_reason:      brief.degradedReason ?? null,
        reader_ms:            readerMs,
        labels_drawn_locally: labelsDrawnLocally,
      },
      generation: {
        provider:       gen.provider,
        provider_model: gen.providerModel,
        fallback_used:  gen.fallbackUsed,
        provider_error: gen.errorMessage,
        latency_ms:     gen.latencyMs,
      },
      // Observabilidade do portão de tinta (tentativas + scores). É esta série
      // que calibra HUMANIZED_PLAN_MIN_INK_SCORE com dado real, em vez de
      // chute — foi exatamente o que faltou no gate anterior.
      fidelity: {
        metric:       'ink_score_v1',
        gate_enabled: gate.enabled,
        min_score:    gate.minScore,
        final_score:  best.score,
        attempts:     attemptLogs,
      },
    }

    const insertResult = await admin
      .from('renders')
      .insert({
        user_id:         user.id,
        input_url:       inputUrl,
        output_url:      outputUrl,
        prompt,
        ambient:         'planta humanizada',
        style:           style,
        lighting:        level,
        engine,
        resolution,
        nodes_charged:   nodesToCharge,
        fal_request_id:  falRequestId,
        status:          'completed',
        completed_at:    new Date().toISOString(),
        config_snapshot: configSnapshot,
      })
      .select('id')
      .single()

    if (insertResult.error) {
      console.error('[apresentar/humanized-plan] DB INSERT falhou (imagem gerada — investigar):', {
        error: insertResult.error, userId: user.id, outputUrl,
      })
    }

    // Saldo pós-débito da BOLSA (dono do workspace) — é dela que saiu.
    const payerId = (await getPayerId(admin, user.id)) ?? user.id
    const { data: balance } = await admin
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance')
      .eq('user_id', payerId)
      .single()

    return NextResponse.json({
      url:              outputUrl,
      originalUrl:      inputUrl,
      renderId:         insertResult.data?.id ?? null,
      creditsRemaining: balance?.total_balance ?? 0,
      planBalance:      balance?.plan_balance  ?? 0,
      extraBalance:     balance?.lumen_balance ?? 0,
      nodesCharged:     nodesToCharge,
      prompt,
      // O cliente desenha os rótulos a partir daqui. Lista vazia = a planta já
      // vinha com texto, o usuário desligou, ou a leitura degradou (e aí o
      // próprio modelo escreveu).
      rooms:            labelsDrawnLocally ? brief.rooms : [],
      projectType:      brief.projectType,
    })

  } catch (err: unknown) {
    // ── Estorno best-effort ───────────────────────────────────────────────────
    if (debited && nodesToCharge > 0) {
      await refundNodes(admin, user.id, nodesToCharge, { module: 'apresentar/humanized-plan' })
    }

    const e = err as { status?: number; body?: unknown; message?: string; isFalTimeout?: boolean }
    console.error('[apresentar/humanized-plan] ERROR status:', e?.status)
    console.error('[apresentar/humanized-plan] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))

    let userMessage = 'Erro ao gerar planta humanizada. Tente novamente.'
    if (e?.isFalTimeout)        userMessage = 'Tempo limite excedido. Tente novamente.'
    else if (e?.status === 422) userMessage = 'Imagem ou parâmetros não aceitos pelo modelo.'
    else if (e?.status === 429) userMessage = 'Limite de requisições atingido. Aguarde alguns segundos.'

    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}
