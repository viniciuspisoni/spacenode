// lib/spaces/generation.ts
//
// Executor de UMA vista do Spaces — pipeline único compartilhado pelas rotas
// de geração (generate e generate-from-sketches). Cada vista é uma transação
// independente:
//
//   débito (consume_workspace_nodes)
//     → row pendente em `vistas` com a provenance COMPLETA das referências
//     → prompt único (lib/spaces/reference-prompt) com papéis explícitos
//     → chamada ao provider (image_urls: [#1 geometria, #2 identidade?],
//       com rótulo de papel por imagem no caminho GCP)
//     → gate de fidelidade (lib/spaces/fidelity): geometry score do output
//       contra a REFERÊNCIA GEOMÉTRICA; score baixo → retry com
//       condicionamento reforçado (edge map, mediaResolution ultra, thinking
//       do NB2, prompt escalado) — entrega a MELHOR tentativa
//     → validação do output (aspecto + visão)
//     → update pra completed (metadados + telemetria + validações)
//   refund best-effort + row 'failed' em qualquer erro pós-débito.
//
// Princípios do fluxo Referência → Ação → Gerar:
//   - A referência geométrica escolhida é SEMPRE a Image #1 (âncora dos
//     motores de edição). A Vista Mestre nunca sobrescreve a geometria dela.
//   - A validação pós-geração compara com a referência geométrica — não com a
//     Vista Mestre — porque é o enquadramento DELA que precisa sobreviver.
//   - Logs registram a origem de cada referência e os parâmetros enviados.
//
// SERVER-ONLY (importa sharp via geometry-score) — consumir apenas de rotas.

import { fal } from '@fal-ai/client'
import { after } from 'next/server'
import type { createAdminClient } from '@/lib/supabase/admin'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { trackServerEvent } from '@/lib/analytics/server'
import { recordAcquisitionEvent } from '@/lib/marketing/ads/service'
import type { EngineId, Resolution } from '@/lib/engines'
import { materialSurfaceEn, type BriefingArquitetonico, type ProjectMaterials } from '@/lib/prompts'
import type { Axis, GenerationAction, ProjectDNA, Space } from './types'
import { getMaterialRefsFromDna } from './dna'
import {
  levelForGeneration, modeForAction, modeAllowsCloserCrop,
  type SpacesMode, type SpacesPreservationLevel,
} from './preservation'
import { imageUrlsFor, imagePartLabelsFor, hasIdentityImage, type ReferenceSet } from './references'
import { buildGenerationPrompt } from './reference-prompt'
import { aspectRatioLabel, type SourceMeta } from './source-meta'
import { validateGeneration, checkArchitecturalPreservation } from './preserve-validate'
import { visionPreservationCheckEnabled } from './preserve-flags'
import { generateImage, type GenerateImageResult } from '@/lib/ai/image-provider'
import {
  getSpacesFidelityConfig, fidelityGateApplies, minScoreForAction,
  getFidelityAttemptParams, EDGE_MAP_PART_LABEL,
  type SpacesFidelityAttemptLog,
} from './fidelity'
import { computeGeometryScore, buildEdgeMapPng, type GeometryScoreBreakdown } from '@/lib/ai/fidelity/geometry-score'
import { nearestSupportedAspectRatio } from '@/lib/ai/aspect-ratio'
import { fetchStorageBuffer, assertSafeFetchUrl } from '@/lib/storage/fetch'

// Timeout da chamada ao provider por motor (espelha o /api/generate do
// Renderizar). Vega (Nano Banana Pro) e Quasar (GPT Image 2) passam de 90s com
// frequência; Pulsar (Nano Banana 2) é rápido.
export const FAL_TIMEOUT_MS: Record<EngineId, number> = {
  vega:   180_000,
  pulsar:  90_000,
  quasar: 180_000,
}

// Params do provider por engine (espelha generate.ts do Renderizar).
// output_format png: master lossless — alinha o caminho FAL com o GCP/Vertex
// (que já devolve PNG e re-hospeda). JPEG na entrega criava uma geração de
// perda a cada passo da cadeia render → editar → ampliar.
// aspectRatio: pino de formato (lib/ai/aspect-ratio) — presente só quando o
// aspecto da referência geométrica bate (≤2%) com um valor suportado; ausente,
// o motor segue o formato do input (default 'auto').
export function falParamsForEngine(
  engine: EngineId,
  q: Resolution,
  aspectRatio: string | null = null,
): Record<string, unknown> {
  if (engine === 'quasar') {
    return {
      quality:       q === '4k' ? 'high' : 'medium',
      image_size:    'auto',
      num_images:    1,
      output_format: 'png',
    }
  }
  const map: Record<Resolution, string> = { hd: '1K', '2k': '2K', '4k': '4K' }
  return {
    resolution:    map[q],
    num_images:    1,
    output_format: 'png',
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
  }
}

// Eixo persistido (vistas.axis) por ação — mantém filtros/verify-dna/histórico
// coerentes com as gerações antigas ('angulo' segue sendo "nova vista").
export function axisForAction(action: GenerationAction): Axis {
  if (action === 'nova_vista') return 'angulo'
  if (action === 'luz')        return 'iluminacao'
  if (action === 'material')   return 'material'
  return 'detalhe'
}

export interface VistaGenerationArgs {
  admin:           ReturnType<typeof createAdminClient>
  userId:          string
  space:           Space
  action:          GenerationAction
  refs:            ReferenceSet
  /** Slug do card/direção (vistas.axis_value). Null para print sem direção. */
  axisValue:       string | null
  /** Rótulo exibido no histórico (card, direção ou nome do print). */
  axisLabel:       string
  /** Modificador em inglês da opção escolhida (vazio quando não se aplica). */
  userIntent:      string
  /** Instrução livre do usuário (direção personalizada / pedido de material). */
  userInstruction: string | null
  engine:          EngineId
  quality:         Resolution
  costPerVista:    number
  falEndpoint:     string
  /** Provenance da referência geométrica (dimensões/aspect/hash). */
  sourceMeta:      SourceMeta | null
  dna:             ProjectDNA | null
  briefing:        BriefingArquitetonico | null
  /** Agrupa vistas geradas no mesmo lote (prints múltiplos). */
  batchId?:        string | null
  /** Contexto pros logs ('spaces.generate' | 'spaces.sketches'). */
  logContext:      string
  /** Epoch ms do fim do orçamento da rota (startedAt + ROUTE_BUDGET). Retries
   *  do gate de fidelidade só rodam se couberem antes dele; ausente → nenhum
   *  retry (single-shot, comportamento seguro por default). */
  deadlineAt?:     number | null
}

export async function generateVista(args: VistaGenerationArgs) {
  const {
    admin, userId, space, action, refs, axisValue, axisLabel,
    userIntent, userInstruction, engine, quality, costPerVista, falEndpoint,
    sourceMeta, dna, briefing, batchId, logContext, deadlineAt,
  } = args

  const axis  = axisForAction(action)
  const mode:  SpacesMode              = modeForAction(action)
  const level: SpacesPreservationLevel = levelForGeneration(action, refs.geometry.kind)
  const dualImage    = hasIdentityImage(refs)
  const cropExpected = modeAllowsCloserCrop(mode)
  const cameraMoves  = action === 'nova_vista' && refs.geometry.kind !== 'print'

  let debited = false
  let vistaId: string | null = null

  try {
    // 1) débito
    const { error: debitErr } = await admin.rpc('consume_workspace_nodes', {
      user_id_input: userId,
      amount:        costPerVista,
    })
    if (debitErr) {
      if (debitErr.code === 'P0001') throw new Error('insufficient_balance')
      throw new Error('debit_failed: ' + debitErr.message)
    }
    debited = true

    // Funil: vista iniciada (pós-débito). Cobre as DUAS rotas que chamam este
    // gerador (generate e generate-from-sketches); after() = latência zero.
    after(() =>
      trackServerEvent(admin, {
        event: 'generation_started',
        userId,
        feature: 'spaces',
        props: { action, engine, quality, nodes: costPerVista },
      }),
    )

    // 2) row pendente — provenance completa desde já (audita até falhas)
    const insertRow: Record<string, unknown> = {
      space_id:            space.id,
      user_id:             userId,
      status:              'processing',
      engine,
      quality,
      axis,
      axis_value:          axisValue,
      axis_label:          axisLabel,
      nodes_cost:          costPerVista,
      spaces_mode:         mode,
      preservation_level:  level,
      provider:            'fal',
      model:               falEndpoint,
      // Referência GEOMÉTRICA (a autoridade desta geração)
      reference_kind:      refs.geometry.kind,
      source_image_url:    sourceMeta?.url ?? refs.geometry.url,
      source_width:        sourceMeta?.width ?? null,
      source_height:       sourceMeta?.height ?? null,
      source_aspect_ratio: sourceMeta?.aspectRatio ?? null,
      source_hash:         sourceMeta?.hash ?? null,
      // Referência de IDENTIDADE (quando difere da geométrica)
      identity_image_url:  dualImage ? refs.identity.imageUrl : null,
      // Instrução livre do usuário
      user_instruction:    userInstruction,
    }
    // Provenance da vista do Space envolvida na geração: como GEOMETRIA
    // (kind='vista') ou como IDENTIDADE (multi-DNA legado). O verify-dna usa
    // esta coluna pra comparar contra o DNA certo.
    const provenanceVistaId =
      (refs.geometry.kind === 'vista' ? refs.geometry.vistaId : null)
      ?? refs.identity.vistaId ?? null
    if (provenanceVistaId) {
      insertRow.reference_vista_id = provenanceVistaId
    }
    if (refs.geometry.kind === 'print') {
      insertRow.source_sketch_url = refs.geometry.url // coluna legada do eixo Ângulo
    }
    if (batchId) insertRow.batch_id = batchId

    const { data: row, error: insErr } = await admin
      .from('vistas')
      .insert(insertRow)
      .select('id')
      .single()
    if (insErr || !row) throw new Error('insert_failed: ' + (insErr?.message ?? '?'))
    vistaId = row.id as string

    // 3) Gate de fidelidade + geração (retry ladder)
    //
    // Cada tentativa monta o prompt (escalada a partir da 2ª), chama o provider
    // e — quando o gate se aplica (regra OVERLAY) — mede o geometry score do
    // output contra a referência geométrica. Score baixo captura exatamente a
    // falha reportada em prod: o modelo ancorar na Vista Mestre (Image #2) em
    // vez de transformar o print (Image #1). Entrega a MELHOR tentativa; o
    // retry nunca vira erro/refund se já existe imagem válida.
    const fidelityCfg = getSpacesFidelityConfig()
    const gateActive  = fidelityCfg.enabled && fidelityGateApplies(action, refs.geometry.kind)
    const minScore    = minScoreForAction(fidelityCfg, action)
    const maxAttempts = gateActive ? fidelityCfg.maxAttempts : 1

    const baseImageUrls   = imageUrlsFor(refs)
    const baseImageLabels = imagePartLabelsFor(refs)

    // Kit de materiais do Space (herdado da render de origem via DNA): cada
    // amostra entra como referência ROTULADA por superfície — o modelo copia
    // o produto real em vez de reinterpretar o nome/hex do DNA. URLs passam
    // pelo allowlist; campo fora do vocabulário já foi filtrado na extração.
    const kit = getMaterialRefsFromDna(space.dna)
    const kitUrls: string[] = []
    const kitLabels: string[] = []
    const materialSamples: { field: string; imageIndex: number }[] = []
    const projectTypeHint =
      (space.source_metadata as { config_snapshot?: { projectType?: string } } | null)
        ?.config_snapshot?.projectType === 'interior' ? ('interior' as const) : undefined
    for (const ref of kit) {
      try { assertSafeFetchUrl(ref.url) } catch { continue }
      kitUrls.push(ref.url)
      const imageIndex = baseImageUrls.length + kitUrls.length
      kitLabels.push(
        `Image #${imageIndex} — MATERIAL SAMPLE for the ${materialSurfaceEn(ref.field as keyof ProjectMaterials, projectTypeHint)} (reproduce this exact material on that surface only):`,
      )
      materialSamples.push({ field: ref.field, imageIndex })
    }
    const imagesWithKit = kitUrls.length ? [...baseImageUrls, ...kitUrls] : baseImageUrls
    const labelsWithKit = kitLabels.length ? [...baseImageLabels, ...kitLabels] : baseImageLabels
    if (materialSamples.length > 0) {
      console.log(`[${logContext}] kit materiais   :`, materialSamples.map(s => `${s.field}→#${s.imageIndex}`).join(' '))
    }

    console.log(`[${logContext}] ação            :`, action, `(${mode}/${level})`)
    console.log(`[${logContext}] ref geométrica  :`, refs.geometry.kind, '→', refs.geometry.url,
      refs.geometry.label ? `(label "${refs.geometry.label}")` : '')
    console.log(`[${logContext}] ref identidade  :`, dualImage
      ? `${refs.identity.source} → ${refs.identity.imageUrl}`
      : 'mesma imagem da geométrica (single-image)')
    if (userInstruction) {
      console.log(`[${logContext}] instrução user  :`, userInstruction)
    }
    console.log(`[${logContext}] engine/quality  :`, engine, '→', falEndpoint, '·', quality, '·', costPerVista, 'nodes')
    console.log(`[${logContext}] image_urls      :`, baseImageUrls.length === 2 ? '[#1 geometria, #2 identidade]' : '[#1 geometria=identidade]')
    console.log(`[${logContext}] fidelity gate   :`, gateActive
      ? `on (min=${minScore.toFixed(2)} max_attempts=${maxAttempts})`
      : 'off (câmera/crop muda por design ou gate desligado)')

    // Pino de formato: quando a regra OVERLAY vale (gate ativo), o formato do
    // output é o da referência geométrica — pinado quando bate (≤2%) com um
    // valor suportado pelos dois caminhos. Fora do gate (Nova Vista/Detalhe
    // mudam o enquadramento por design), sem pino: o motor segue o input.
    const aspectPin = gateActive
      ? nearestSupportedAspectRatio(sourceMeta?.width ?? null, sourceMeta?.height ?? null)
      : null

    // Seed fixa por vista (espelha o Renderizar): retries do ladder viram
    // variação CONTROLADA da mesma amostra (tentativa 3 desloca via
    // seedOffset) e a geração fica reproduzível. NB2/Pro na FAL expõem `seed`
    // no schema (conferido 2026-08-17); o GCP recebe via gcpConfig.
    const generationSeed = Math.floor(Math.random() * 2_147_483_647)
    console.log(`[${logContext}] aspect/seed     :`, aspectPin ?? 'auto', '·', generationSeed)

    // Bytes da referência geométrica — lidos uma vez, servem ao score e ao
    // edge map. Best-effort: falha aqui não derruba a geração (só o gate).
    let sourceBuffer: Buffer | null = null
    const getSourceBuffer = async (): Promise<Buffer> => {
      if (!sourceBuffer) sourceBuffer = await fetchStorageBuffer(sourceMeta?.url ?? refs.geometry.url)
      return sourceBuffer
    }

    let edgeMapUrl: string | null = null
    let best: { gen: GenerateImageResult; prompt: string; geometry: GeometryScoreBreakdown | null } | null = null
    const attemptLogs: SpacesFidelityAttemptLog[] = []

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const params = getFidelityAttemptParams(attempt)

      // Condicionamento estrutural nos retries: lineart da referência
      // geométrica anexado como imagem extra (upload único por vista).
      let imageUrls   = imagesWithKit
      let imageLabels = labelsWithKit
      let edgeMapImageIndex: number | null = null
      if (gateActive && params.useEdgeMap) {
        try {
          if (!edgeMapUrl) {
            const edgePng = await buildEdgeMapPng(await getSourceBuffer())
            edgeMapUrl = await fal.storage.upload(new File([new Uint8Array(edgePng)], 'edge-map.png', { type: 'image/png' }))
          }
          imageUrls   = [...imagesWithKit, edgeMapUrl]
          imageLabels = [...labelsWithKit, EDGE_MAP_PART_LABEL]
          edgeMapImageIndex = imageUrls.length
        } catch (edgeErr) {
          console.warn(`[${logContext}] edge map indisponível (segue sem):`, (edgeErr as Error).message)
        }
      }

      const prompt = buildGenerationPrompt({
        action,
        refKind:          refs.geometry.kind,
        hasIdentityImage: dualImage,
        userIntent,
        userInstruction,
        referenceLabel:   refs.geometry.label ?? null,
        briefing,
        dna,
        quality,
        attempt,
        edgeMapImageIndex,
        materialSamples: materialSamples.length > 0 ? materialSamples : undefined,
      })
      if (attempt === 1) console.log(`[${logContext}] prompt          :`, prompt)

      const attemptSeed = generationSeed + params.seedOffset
      const falInput = {
        prompt,
        image_urls: imageUrls,
        ...falParamsForEngine(engine, quality, aspectPin),
        // Reprodutibilidade nos DOIS caminhos (Quasar não expõe seed).
        ...(engine !== 'quasar' ? { seed: attemptSeed } : {}),
        // Thinking do NB2 (único motor com o knob na FAL): planejar a cena
        // antes de gerar adere melhor ao contrato de preservação. No caminho
        // GCP o provider converte em thinkingConfig.
        ...(engine === 'pulsar' && params.thinkingLevel ? { thinking_level: params.thinkingLevel } : {}),
      }

      // 1ª tentativa: timeout cheio do engine (contrato atual das rotas, que
      // reservam FAL_TIMEOUT + overhead por chunk). Retries: só o que sobra
      // até o deadline da rota.
      const remainingMs = deadlineAt ? deadlineAt - Date.now() : null
      const attemptTimeoutMs = attempt === 1 || remainingMs === null
        ? FAL_TIMEOUT_MS[engine]
        : Math.min(FAL_TIMEOUT_MS[engine], Math.max(30_000, remainingMs - 15_000))

      let gen: GenerateImageResult
      try {
        gen = await generateImage({
          falEndpoint,
          falInput,
          timeoutMs: attemptTimeoutMs,
          context:   attempt === 1 ? logContext : `${logContext}#${attempt}`,
          deliver:   { kind: 'url', userId, area: 'vistas' },
          imageLabels,
          gcpConfig: {
            temperature: params.temperature,
            seed:        attemptSeed,
            ...(params.thinkingLevel   ? { thinkingLevel:   params.thinkingLevel }   : {}),
            ...(params.mediaResolution ? { mediaResolution: params.mediaResolution } : {}),
          },
        })
      } catch (genErr) {
        // Retry é best-effort: com imagem válida de tentativa anterior, falha
        // aqui não pode virar erro (nem refund) — entrega a melhor.
        if (attempt === 1 || !best) throw genErr
        console.warn(`[${logContext}] retry ${attempt} falhou (${(genErr as Error).message}) — entregando a melhor tentativa anterior`)
        break
      }

      // Score estrutural da tentativa — nunca derruba a request: sem score, a
      // imagem é aceita (comportamento legado).
      let geometry: GeometryScoreBreakdown | null = null
      let scoreError: string | undefined
      if (gateActive && gen.images[0]?.url) {
        try {
          const generatedBuffer = await fetchStorageBuffer(gen.images[0].url)
          geometry = await computeGeometryScore(await getSourceBuffer(), generatedBuffer)
        } catch (scoreErr) {
          scoreError = (scoreErr as Error).message
          console.warn(`[${logContext}] geometry score indisponível:`, scoreError)
        }
      }

      attemptLogs.push({
        attempt,
        provider:       gen.provider,
        provider_model: gen.providerModel,
        request_id:     gen.requestId,
        temperature:    params.temperature,
        thinking_level:   params.thinkingLevel,
        media_resolution: params.mediaResolution,
        seed:             attemptSeed,
        edge_map_used:  edgeMapImageIndex !== null,
        fallback_used:  gen.fallbackUsed,
        duration_ms:    gen.latencyMs,
        geometry,
        ...(scoreError ? { score_error: scoreError } : {}),
      })

      console.log(
        `[${logContext}] fidelity attempt=${attempt}/${maxAttempts} provider=${gen.provider} model=${gen.providerModel} ` +
        `temp=${params.temperature} thinking=${params.thinkingLevel ?? 'off'} mediaRes=${params.mediaResolution ?? 'default'} edgeMap=${edgeMapImageIndex !== null} ` +
        `score=${geometry ? geometry.score.toFixed(3) : 'n/a'}` +
        (geometry
          ? ` (recall=${geometry.edgeRecall.toFixed(3)} blockCorr=${geometry.blockCorrelation.toFixed(3)} worstBlock=${geometry.worstBlockDelta.toFixed(3)} aspectDelta=${geometry.aspectDelta.toFixed(3)})`
          : '') +
        ` min=${gateActive ? minScore.toFixed(2) : 'off'}`,
      )

      if (!best || (geometry?.score ?? -1) > (best.geometry?.score ?? -1)) {
        best = { gen, prompt, geometry }
      }

      const passed = !gateActive || geometry === null || geometry.score >= minScore
      if (passed) break
      if (attempt >= maxAttempts) {
        console.warn(`[${logContext}] score abaixo do limite após ${attempt} tentativas — entregando a melhor (score=${best.geometry?.score.toFixed(3) ?? 'n/a'})`)
        break
      }
      if (!deadlineAt || deadlineAt - Date.now() < 45_000) {
        console.warn(`[${logContext}] sem orçamento de tempo pra retry — entregando a melhor tentativa`)
        break
      }
    }

    // best sempre existe (≥ 1 tentativa concluída ou a 1ª lançou acima).
    if (!best) throw new Error('provider_no_output')
    const gen           = best.gen
    const finalPrompt   = best.prompt
    const fidelityScore = best.geometry?.score ?? null
    const retryCount    = Math.max(0, attemptLogs.length - 1)
    const generationDurationMs = attemptLogs.reduce((sum, a) => sum + a.duration_ms, 0)

    const outputUrl = gen.images[0]?.url
    if (!outputUrl) throw new Error('provider_no_output')
    const genW = gen.images[0]?.width  ?? null
    const genH = gen.images[0]?.height ?? null

    // 5) Validação contra a REFERÊNCIA GEOMÉTRICA — enquadramento/estrutura
    // precisam sobreviver à geração. Nova Vista (câmera se move) e Detalhe
    // (crop) mudam o enquadramento por design; nesses casos só a checagem de
    // visão avalia (com a regra certa pro caso).
    const genAspect = genW && genH ? genW / genH : null
    const validation = validateGeneration({
      sourceUrl:          sourceMeta?.url ?? refs.geometry.url,
      generatedUrl:       outputUrl,
      sourceAspect:       sourceMeta?.aspectRatio ?? null,
      generatedAspect:    genAspect,
      allowFramingChange: cropExpected || cameraMoves,
    })
    if (validation.issues.length) {
      console.warn(`[${logContext}] validação estrutural:`, validation.issues.join(', '))
    }
    let preservationWarning = !validation.ok
    // Gate de fidelidade: melhor tentativa ainda abaixo do limite → o output
    // provavelmente não preservou a referência geométrica (ex.: ancorou na
    // Vista Mestre). Warning visível na UI, como as demais validações.
    if (gateActive && fidelityScore !== null && fidelityScore < minScore) {
      preservationWarning = true
    }

    let check: Awaited<ReturnType<typeof checkArchitecturalPreservation>> = null
    if (visionPreservationCheckEnabled()) {
      check = await checkArchitecturalPreservation(
        sourceMeta?.url ?? refs.geometry.url, outputUrl, level,
        { cropExpected },
      )
      if (check?.warning) preservationWarning = true
      if (check) {
        console.log(`[${logContext}] checagem visão  : preserved=${check.preserved} score=${check.score}${check.notes ? ` — ${check.notes}` : ''}`)
      }
    }

    // 6) Persistir completed (provider/modelo REAIS — a row pendente registrou
    // a intenção; aqui gravamos quem gerou de fato, gcp ou fal via fallback).
    const completedAt = new Date().toISOString()
    const updateRow: Record<string, unknown> = {
      image_url:            outputUrl,
      prompt:               finalPrompt,
      fal_request_id:       gen.requestId,
      provider:             gen.provider,
      model:                gen.providerModel,
      generated_width:      genW,
      generated_height:     genH,
      aspect_ratio:         aspectRatioLabel(genAspect) ?? aspectRatioLabel(sourceMeta?.aspectRatio ?? null),
      preservation_warning: preservationWarning,
      preservation_check:   check,
      status:               'completed',
      completed_at:         completedAt,
    }
    // Arquivo técnico do Histórico (migration 20260701000000) + diagnóstico do
    // gate de fidelidade. Update resiliente: se as colunas de metadados ainda
    // não existirem no banco, regrava só com as colunas base — a vista nunca
    // fica presa em 'processing' por causa de telemetria.
    const extendedRow: Record<string, unknown> = {
      ...updateRow,
      duration_ms: generationDurationMs,
      retry_count: retryCount,
      generation_log: {
        provider:       gen.provider,
        provider_model: gen.providerModel,
        fallback_used:  gen.fallbackUsed,
        provider_error: gen.errorMessage,
        endpoint:       falEndpoint,
        request_id:     gen.requestId,
        engine,
        quality,
        parameters:     falParamsForEngine(engine, quality),
        image_count:    baseImageUrls.length,
        dual_image:     dualImage,
        duration_ms:    generationDurationMs,
        nodes_charged:  costPerVista,
        fidelity: gateActive
          ? { mode: 'spaces_overlay', min_score: minScore, final_score: fidelityScore, attempts: attemptLogs }
          : null,
      },
    }
    let upd = await admin.from('vistas').update(extendedRow).eq('id', vistaId)
    if (upd.error && (upd.error.code === 'PGRST204' || upd.error.code === '42703')) {
      console.warn(`[${logContext}] colunas de metadados ausentes — regravando com colunas base:`, upd.error.message)
      upd = await admin.from('vistas').update(updateRow).eq('id', vistaId)
    }
    if (upd.error) {
      console.error(`[${logContext}] DB update FALHOU (imagem ok, persistência não):`, upd.error)
    }

    // Funil: vista concluída + ativação (first_generation 1× por usuário).
    after(async () => {
      await trackServerEvent(admin, {
        event: 'generation_completed',
        userId,
        feature: 'spaces',
        props: {
          action,
          engine,
          quality,
          nodes: costPerVista,
          duration_ms: generationDurationMs,
          ...(vistaId ? { vista_id: vistaId } : {}),
        },
      })
      await recordAcquisitionEvent(admin, {
        user_id: userId,
        event_type: 'first_generation',
        metadata: { feature: 'spaces' },
      })
    })

    return {
      id:                   vistaId,
      space_id:             space.id,
      image_url:            outputUrl,
      engine,
      quality,
      axis,
      axis_value:           axisValue,
      axis_label:           axisLabel,
      nodes_cost:           costPerVista,
      status:               'completed',
      // A UI faz prepend deste objeto na grade — sem created_at o card mostra
      // "NaNd". created_at real é o DEFAULT do banco; o carimbo aqui é
      // display-only e é substituído no próximo fetch server-side.
      created_at:           completedAt,
      completed_at:         completedAt,
      spaces_mode:          mode,
      preservation_level:   level,
      reference_kind:       refs.geometry.kind,
      reference_vista_id:   provenanceVistaId,
      source_image_url:     sourceMeta?.url ?? refs.geometry.url,
      source_sketch_url:    refs.geometry.kind === 'print' ? refs.geometry.url : null,
      identity_image_url:   dualImage ? refs.identity.imageUrl : null,
      user_instruction:     userInstruction,
      source_aspect_ratio:  sourceMeta?.aspectRatio ?? null,
      aspect_ratio:         updateRow.aspect_ratio as string | null,
      preservation_warning: preservationWarning,
      preservation_check:   check,
      batch_id:             batchId ?? null,
    }
  } catch (err) {
    if (debited) {
      await refundNodes(admin, userId, costPerVista, { module: 'spaces/generate', jobTable: 'vistas' })
      // Funil: só falha PÓS-débito conta como geração falha (pré-débito é
      // validação barata, não uma geração que o usuário perdeu).
      after(() =>
        trackServerEvent(admin, {
          event: 'generation_failed',
          userId,
          feature: 'spaces',
          props: { action, engine, quality, nodes: costPerVista },
        }),
      )
    }
    if (vistaId) {
      await admin
        .from('vistas')
        .update({ status: 'failed', error_message: (err as Error).message })
        .eq('id', vistaId)
    }
    throw err
  }
}
