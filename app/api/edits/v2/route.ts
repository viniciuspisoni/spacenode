// POST /api/edits/v2 — rota do Editar v2 ("o novo editor arquitetônico").
//
// FASE 2 — backend controlado (regras do fundador, 2026-06-12):
//   - Nasce atrás de EDIT_V2_ENABLED: flag desligada → 404 (recusa execução).
//   - Custo em Nodes é CALCULADO mas NÃO debitado: cobrança SIMULADA e logada.
//   - Falha técnica → erro claro, sem cobrança (nada é debitado nesta fase).
//   - SEM retry pago automático.
//   - provider/modelo/custos USD só saem em modo debug (nunca contrato de UI).
//   - Telemetria em image_edit_attempts (tabela existente — sem migration),
//     com vocabulário v1 no `tool` (CHECK de produção) e o intent v2 em
//     `edit_intent` quando a coluna existir (insert resiliente do v1).
//   - Editar v1 (/api/edits) segue 100% intocado.
//
// Suporte a teste local SEM sessão de browser (dry-run/curl): header
// `x-edit-v2-test-user: <uuid>` — aceito APENAS fora de produção e fora da
// Vercel (NODE_ENV !== 'production' && !VERCEL). Em produção é ignorado.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  insertAttemptResilient,
  updateAttemptResilient,
  uploadEditAsset,
} from '@/lib/spaces/edit-route-helpers'
import { MaskImageMismatchError, fetchImageBuffer, maskWhiteRatio } from '@/lib/spaces/edit-crop'
import { currentFlags, editV2Enabled } from '@/lib/edit-v2/flags'
import { normalizeInstruction } from '@/lib/edit-v2/normalizer'
import { routeEditV2, validateEditRequestV2 } from '@/lib/edit-v2/router'
import {
  EditV2InputError,
  assertSafeImageUrl,
  runEditV2,
} from '@/lib/edit-v2/pipeline'
import {
  EDIT_INTENTS_V2,
  EditV2ProviderError,
  type EditIntentV2,
  type EditReferenceV2,
  type EditRouteInputV2,
  type IntensityModeV2,
  type OutputResolutionV2,
  type PreservationModeV2,
  type QualityModeV2,
  type ReferenceKindV2,
} from '@/lib/edit-v2/types'

export const runtime = 'nodejs'
export const maxDuration = 300

// ── Validação de payload (vocabulário fechado, mensagens PT) ─────────────────
const QUALITY: ReadonlySet<string> = new Set(['economic', 'high_precision'])
const PRESERVATION: ReadonlySet<string> = new Set(['maximum', 'standard'])
const INTENSITY: ReadonlySet<string> = new Set(['subtle', 'standard', 'strong'])
const RESOLUTION: ReadonlySet<string> = new Set(['source', '1K', '2K', '4K'])
const REF_KINDS: ReadonlySet<string> = new Set(['material', 'object', 'context'])
const MAX_REFERENCES = 3

interface BodyV2 {
  source_image_url?: unknown
  mask_url?: unknown
  instruction?: unknown
  edit_intent?: unknown
  quality_mode?: unknown
  preservation_mode?: unknown
  intensity_mode?: unknown
  output_resolution?: unknown
  references?: unknown
  debug?: unknown
  /** true → para ANTES do provider: valida, normaliza, roteia e simula a
   *  cobrança, sem nenhuma chamada paga. Modo de teste da Fase 2. */
  dry_run?: unknown
}

function parseReferencesV2(raw: unknown): EditReferenceV2[] {
  if (!Array.isArray(raw)) return []
  const out: EditReferenceV2[] = []
  for (const item of raw.slice(0, MAX_REFERENCES)) {
    const r = item as { kind?: unknown; url?: unknown; note?: unknown }
    if (typeof r?.url !== 'string' || !r.url) continue
    if (typeof r?.kind !== 'string' || !REF_KINDS.has(r.kind)) continue
    out.push({
      kind: r.kind as ReferenceKindV2,
      url: r.url,
      note: typeof r.note === 'string' ? r.note.slice(0, 300) : undefined,
    })
  }
  return out
}

const debugAllowed = () =>
  process.env.NODE_ENV !== 'production' || process.env.EDIT_V2_DEBUG === '1'

export async function POST(req: Request) {
  // Flag de produto: desligada → a rota não existe para o mundo.
  if (!editV2Enabled()) {
    return NextResponse.json({ error: 'Não disponível.' }, { status: 404 })
  }

  // ── Auth (sessão Supabase; bypass de teste só local) ───────────────────────
  let userId: string | null = null
  const testBypassAllowed = process.env.NODE_ENV !== 'production' && !process.env.VERCEL
  const testUser = testBypassAllowed ? req.headers.get('x-edit-v2-test-user') : null
  if (testUser && /^[0-9a-f-]{36}$/i.test(testUser)) {
    userId = testUser
  } else {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    userId = user.id
  }

  let body: BodyV2
  try {
    body = (await req.json()) as BodyV2
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  // ── Campos obrigatórios/válidos ────────────────────────────────────────────
  const sourceUrl = typeof body.source_image_url === 'string' ? body.source_image_url : ''
  if (!sourceUrl) {
    return NextResponse.json({ error: 'Envie a imagem que será editada.' }, { status: 400 })
  }
  const intent = typeof body.edit_intent === 'string' && (EDIT_INTENTS_V2 as readonly string[]).includes(body.edit_intent)
    ? (body.edit_intent as EditIntentV2)
    : null
  if (!intent) {
    return NextResponse.json({ error: 'Tipo de edição inválido.' }, { status: 400 })
  }
  const quality: QualityModeV2 = QUALITY.has(String(body.quality_mode)) ? (body.quality_mode as QualityModeV2) : 'economic'
  const preservation: PreservationModeV2 = PRESERVATION.has(String(body.preservation_mode)) ? (body.preservation_mode as PreservationModeV2) : 'maximum'
  const intensity: IntensityModeV2 = INTENSITY.has(String(body.intensity_mode)) ? (body.intensity_mode as IntensityModeV2) : 'standard'
  const outputResolution: OutputResolutionV2 = RESOLUTION.has(String(body.output_resolution)) ? (body.output_resolution as OutputResolutionV2) : 'source'
  const instruction = typeof body.instruction === 'string' ? body.instruction.slice(0, 2000) : ''
  const maskUrl = typeof body.mask_url === 'string' && body.mask_url ? body.mask_url : null
  const references = parseReferencesV2(body.references)
  const debug = body.debug === true && debugAllowed()

  // FASE 2: Gemini Pro (Alta precisão) exige autorização específica do fundador.
  if (quality === 'high_precision' && process.env.EDIT_V2_ALLOW_PRO !== '1') {
    return NextResponse.json(
      { error: 'Alta precisão ainda não está disponível.' },
      { status: 403 },
    )
  }

  const flags = currentFlags()
  const admin = createAdminClient()
  let attemptId: string | null = null

  try {
    // ── Medidas server-side (nunca confiar no cliente) ──────────────────────
    assertSafeImageUrl(sourceUrl)
    if (maskUrl) assertSafeImageUrl(maskUrl)
    const sourceBuf = await fetchImageBuffer(sourceUrl)
    const sharp = (await import('sharp')).default
    const meta = await sharp(sourceBuf).metadata()
    const imageMegapixels = Math.min(64, ((meta.width ?? 0) * (meta.height ?? 0)) / 1_000_000 || 2)

    let maskCoverage: number | null = null
    if (maskUrl) {
      try {
        maskCoverage = await maskWhiteRatio(await fetchImageBuffer(maskUrl))
      } catch {
        maskCoverage = null // pipeline valida de novo; aqui é só p/ roteamento
      }
    }

    // ── Normalizador (camada invisível; custo/latência separados) ───────────
    // No dry_run o LLM é pulado (fallback determinístico): dry-run = custo ZERO
    // absoluto, incluindo as frações de centavo do gemini-2.5-flash.
    const normalized = await normalizeInstruction({
      instructionPt: instruction,
      intent,
      hasMask: Boolean(maskUrl),
      referenceKind: references[0]?.kind ?? null,
      enabled: flags.normalizer && body.dry_run !== true,
    })

    // ── Roteamento puro ──────────────────────────────────────────────────────
    const routeInput: EditRouteInputV2 = {
      editIntent: intent,
      qualityMode: quality,
      preservationMode: preservation,
      intensityMode: intensity,
      hasMask: Boolean(maskUrl),
      maskAreaRatio: maskCoverage,
      hasReferenceImage: references.length > 0,
      referenceKind: references[0]?.kind ?? null,
      hasProjectContextImages: references.some(r => r.kind === 'context'),
      requiresStrictGeometry: normalized.requiresStrictGeometry,
      outputResolution,
      imageMegapixels,
      userPlan: 'unknown', // não influencia roteamento/preço no v2
    }
    const validationError = validateEditRequestV2(routeInput, instruction)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }
    const routing = routeEditV2({ input: routeInput, normalized, references, flags })

    // ── DRY-RUN: para aqui — zero chamada paga, zero telemetria persistida ───
    if (body.dry_run === true) {
      console.log(
        `[edit-v2] DRY-RUN user=${userId} intent=${intent} nodes=${routing.nodesCost} ` +
        `provider=${routing.selectedProvider} model=${routing.selectedModel}`,
      )
      return NextResponse.json({
        dry_run: true,
        nodes_cost: routing.nodesCost,
        charge: { simulated: true, debited: false },
        valid: true,
        ...(debug
          ? {
              debug: {
                provider: routing.selectedProvider,
                model: routing.selectedModel,
                route_reason: routing.loggingData.reason,
                resolved_resolution: routing.loggingData.resolvedResolution,
                gate_thresholds: routing.loggingData.gateThresholds,
                expected_provider_cost_usd: routing.loggingData.expectedProviderCostUsd,
                expected_overhead_cost_usd: routing.loggingData.expectedOverheadCostUsd,
                normalizer: {
                  used: normalized.used,
                  duration_ms: normalized.durationMs,
                  cost_usd: normalized.costUsdEstimated,
                  ambiguous: normalized.ambiguous,
                  instruction_en: normalized.instructionEn,
                },
                image_megapixels: imageMegapixels,
                mask_coverage: maskCoverage,
              },
            }
          : {}),
      })
    }

    // ── Telemetria: attempt 'processing' (tabela existente; sem migration) ───
    const TOOL_V1: Record<EditIntentV2, string> = {
      swap_material: 'material',
      remove_element: 'remove',
      insert_element: 'add',
      adjust_atmosphere: 'lighting',
      fix_image: 'fix_detail',
    }
    const provider = routing.selectedProvider === 'vertex-imagen' ? 'vertex' : 'google'
    const baseRow = {
      user_id: userId,
      tool: TOOL_V1[intent],
      prompt: instruction,
      endpoint: routing.selectedModel,
      provider,
      cost_nodes: 0, // FASE 2: cobrança simulada — nodes calculados ficam no log
      provider_cost_usd: routing.loggingData.expectedProviderCostUsd,
      is_free_fix: false,
      has_mask: Boolean(maskUrl),
      mask_area_ratio: maskCoverage,
      used_crop: false,
      output_resolution: routing.loggingData.resolvedResolution === '1K' ? 'current' : routing.loggingData.resolvedResolution,
      preservation_mode: preservation === 'maximum' ? 'max' : 'balanced',
      reference_count: references.length,
      reference_roles: references.map(r => r.kind),
      status: 'processing',
    }
    attemptId = await insertAttemptResilient(
      admin,
      { ...baseRow, edit_intent: `v2:${intent}`, quality_mode: quality === 'high_precision' ? 'premium' : 'quick' },
      baseRow,
    )

    // ── Cobrança SIMULADA (Fase 2) ───────────────────────────────────────────
    console.log(
      `[edit-v2] charge SIMULATED user=${userId} nodes=${routing.nodesCost} ` +
      `intent=${intent} provider=${routing.selectedProvider} model=${routing.selectedModel} ` +
      `expUsd=${routing.loggingData.expectedProviderCostUsd}`,
    )

    // ── Execução (SEM retry pago) ────────────────────────────────────────────
    const run = await runEditV2({
      imageUrl: sourceUrl,
      maskUrl,
      intent,
      routing,
      references,
      flags,
      instructionEn: normalized.instructionEn,
      uploadAsset: (buffer, kind) => uploadEditAsset(admin, userId as string, buffer, kind),
    })

    // ── Telemetria final ─────────────────────────────────────────────────────
    const doneRow = {
      status: run.rejected ? 'rejected_quality_gate' : 'completed',
      error_message: run.rejected ? run.rejectReasons.join(',').slice(0, 500) : null,
      completed_at: new Date().toISOString(),
    }
    await updateAttemptResilient(
      admin,
      attemptId,
      {
        ...doneRow,
        gate_reason: run.rejected ? run.rejectReasons.join(',') : null,
        in_mask_delta: run.metrics.inMaskDelta,
        out_of_mask_delta: run.metrics.outOfMaskDelta,
        auto_retry_count: 0,
      },
      doneRow,
    )
    console.log(
      `[edit-v2] done user=${userId} rejected=${run.rejected} ` +
      `normalizer=${normalized.durationMs}ms/$${normalized.costUsdEstimated} ` +
      `provider=${run.stages.provider.durationMs}ms/$${run.stages.provider.costUsdEstimated} ` +
      `gate=${run.stages.semanticGate.durationMs}ms/$${run.stages.semanticGate.costUsdEstimated}` +
      `${run.stages.semanticGate.skipped ? '(skipped)' : ''} ` +
      `outDrift=${run.metrics.outOfMaskDelta} inDelta=${run.metrics.inMaskDelta}`,
    )

    // ── Resposta pública (sem provider/modelo/jargão) + bloco debug opcional ─
    const publicBody = run.rejected
      ? {
          rejected: true as const,
          reasons: ['A edição alterou áreas fora da seleção ou não aplicou o pedido e foi descartada.'],
          message: 'Nenhum node foi consumido. Refazer é grátis.',
          nodes_cost: routing.nodesCost,
          charge: { simulated: true as const, debited: false as const },
        }
      : {
          rejected: false as const,
          result_url: run.resultUrl,
          nodes_cost: routing.nodesCost,
          charge: { simulated: true as const, debited: false as const },
          output: run.outputDims,
        }

    return NextResponse.json(
      debug
        ? {
            ...publicBody,
            debug: {
              provider: routing.selectedProvider,
              model: routing.selectedModel,
              route_reason: routing.loggingData.reason,
              resolved_resolution: routing.loggingData.resolvedResolution,
              gate_thresholds: routing.loggingData.gateThresholds,
              expected_provider_cost_usd: routing.loggingData.expectedProviderCostUsd,
              expected_overhead_cost_usd: routing.loggingData.expectedOverheadCostUsd,
              normalizer: {
                used: normalized.used,
                duration_ms: normalized.durationMs,
                cost_usd: normalized.costUsdEstimated,
                ambiguous: normalized.ambiguous,
                instruction_en: normalized.instructionEn,
              },
              stages: run.stages,
              metrics: run.metrics,
              reject_reasons: run.rejectReasons,
              attempt_id: attemptId,
              result_url: run.resultUrl,
            },
          }
        : publicBody,
    )
  } catch (err) {
    // Falha técnica: erro claro, NADA cobrado (nada foi debitado nesta fase).
    const fail = async (status: number, message: string) => {
      await updateAttemptResilient(
        admin,
        attemptId,
        { status: 'failed', error_message: message.slice(0, 500), completed_at: new Date().toISOString() },
        { status: 'failed', error_message: message.slice(0, 500), completed_at: new Date().toISOString() },
      )
      return NextResponse.json(
        { error: message, charge: { simulated: true, debited: false } },
        { status },
      )
    }
    if (err instanceof EditV2InputError) return fail(400, err.message)
    if (err instanceof MaskImageMismatchError) {
      return fail(422, 'A seleção não corresponde a esta imagem. Refaça a seleção sobre a imagem atual.')
    }
    if (err instanceof EditV2ProviderError) {
      console.error(`[edit-v2] provider ${err.provider}/${err.kind}:`, err.message)
      return fail(502, 'Não foi possível concluir a edição. Nenhum node foi consumido.')
    }
    console.error('[edit-v2] erro:', err)
    return fail(500, 'Não foi possível concluir a edição. Nenhum node foi consumido.')
  }
}
