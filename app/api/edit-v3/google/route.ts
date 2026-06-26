// POST /api/edit-v3/google — rota do Editar V3 (Google/Gemini-first).
//
// Regras do fundador (2026-06-23):
//   - Nasce atrás de EDIT_V3_ENABLED: flag desligada → 404.
//   - Cobrança REAL de nodes, debitada SOMENTE no sucesso (gate aprovado).
//     Falha técnica / rejeição do gate / erro de provider → NADA é debitado.
//     EDIT_V3_CHARGE=0 simula a cobrança (para teste manual da UI).
//   - Persistência completa do job (source, mask, prompt, action_type, model,
//     provider, result, status) em edit_v3_jobs (resiliente: funciona sem a
//     tabela enquanto a migration aguarda aprovação).
//   - provider/modelo/USD só em modo debug — nunca no contrato público.
//
// Bypass de teste local (sem sessão de browser): header `x-edit-v3-test-user:
// <uuid>` — aceito APENAS fora de produção e fora da Vercel.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadEditAsset } from '@/lib/spaces/edit-route-helpers'
import { MaskImageMismatchError, fetchImageBuffer } from '@/lib/spaces/edit-crop'
import { GoogleEditError, type GoogleImageModel } from '@/lib/ai/google/editImage'
import { FalEditError } from '@/lib/ai/fal/editImage'
import {
  editV3Enabled,
  editV3ChargeEnabled,
  editV3FalFallbackEnabled,
  editV3AllowHighPrecision,
  editV3DebugAllowed,
  editV3NoMaskEnabled,
} from '@/lib/edit-v3/flags'
import {
  nodesForAction,
  resolveResolution,
  modelCostUsd,
  MODEL_FOR_QUALITY,
  marginAt,
} from '@/lib/edit-v3/pricing'
import { runEditV3, EditV3GenerationError } from '@/lib/edit-v3/pipeline'
import { assertSafeImageUrl, EditV3InputError } from '@/lib/edit-v3/ssrf'
import { insertJobResilient, updateJobResilient } from '@/lib/edit-v3/persist'
import {
  EDIT_V3_ACTIONS,
  REFERENCE_KIND_FOR,
  REQUIRES_MASK,
  type EditV3Action,
  type EditV3Intensity,
  type EditV3Preservation,
  type EditV3Quality,
  type EditV3Reference,
  type EditV3Request,
  type EditV3ResolutionRequest,
} from '@/lib/edit-v3/types'

export const runtime = 'nodejs'
export const maxDuration = 300

const PRESERVATION: ReadonlySet<string> = new Set(['maximum', 'standard'])
const INTENSITY: ReadonlySet<string> = new Set(['subtle', 'standard', 'strong'])
const RESOLUTION: ReadonlySet<string> = new Set(['source', '1K', '2K', '4K'])
const QUALITY: ReadonlySet<string> = new Set(['standard', 'high'])

interface BodyV3 {
  action?: unknown
  source_image_url?: unknown
  mask_url?: unknown
  instruction?: unknown
  quality?: unknown
  preservation?: unknown
  intensity?: unknown
  output_resolution?: unknown
  references?: unknown
  debug?: unknown
  /** true → para ANTES do provider: valida, roteia e devolve o custo, sem
   *  nenhuma chamada paga e sem telemetria. */
  dry_run?: unknown
  /** Só com dry_run: trata como SE houvesse seleção (custo antes de pintar). */
  assume_mask?: unknown
}

/** Filtra referências ao papel da ação (cap 1). Ação sem referência → []. */
function parseReferences(action: EditV3Action, raw: unknown): EditV3Reference[] {
  const kind = REFERENCE_KIND_FOR[action]
  if (!kind || !Array.isArray(raw)) return []
  for (const item of raw) {
    const r = item as { kind?: unknown; url?: unknown }
    if (typeof r?.url === 'string' && r.url && r.kind === kind) {
      return [{ kind, url: r.url }]
    }
  }
  return []
}

export async function POST(req: Request) {
  // Flag de produto: desligada → a rota não existe para o mundo.
  if (!editV3Enabled()) {
    return NextResponse.json({ error: 'Não disponível.' }, { status: 404 })
  }

  // ── Auth (sessão Supabase; bypass de teste só local) ───────────────────────
  let userId: string
  const testBypassAllowed = process.env.NODE_ENV !== 'production' && !process.env.VERCEL
  const testUser = testBypassAllowed ? req.headers.get('x-edit-v3-test-user') : null
  if (testUser && /^[0-9a-f-]{36}$/i.test(testUser)) {
    userId = testUser
  } else {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    userId = user.id
  }

  let body: BodyV3
  try {
    body = (await req.json()) as BodyV3
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  // ── Validação de payload (vocabulário fechado, mensagens PT) ────────────────
  const action = typeof body.action === 'string' && (EDIT_V3_ACTIONS as readonly string[]).includes(body.action)
    ? (body.action as EditV3Action)
    : null
  if (!action) {
    return NextResponse.json({ error: 'Tipo de edição inválido.' }, { status: 400 })
  }
  const sourceUrl = typeof body.source_image_url === 'string' ? body.source_image_url : ''
  if (!sourceUrl) {
    return NextResponse.json({ error: 'Envie a imagem que será editada.' }, { status: 400 })
  }
  const quality: EditV3Quality = QUALITY.has(String(body.quality)) ? (body.quality as EditV3Quality) : 'standard'
  const preservation: EditV3Preservation = PRESERVATION.has(String(body.preservation)) ? (body.preservation as EditV3Preservation) : 'maximum'
  const intensity: EditV3Intensity = INTENSITY.has(String(body.intensity)) ? (body.intensity as EditV3Intensity) : 'standard'
  const outputResolution: EditV3ResolutionRequest = RESOLUTION.has(String(body.output_resolution)) ? (body.output_resolution as EditV3ResolutionRequest) : 'source'
  const instruction = typeof body.instruction === 'string' ? body.instruction.slice(0, 2000) : ''
  const maskUrl = typeof body.mask_url === 'string' && body.mask_url ? body.mask_url : null
  const references = parseReferences(action, body.references)
  const debug = body.debug === true && editV3DebugAllowed()
  const dryRun = body.dry_run === true
  const assumeMask = dryRun && body.assume_mask === true

  // Alta precisão (Gemini Pro) exige autorização específica.
  if (quality === 'high' && !editV3AllowHighPrecision()) {
    return NextResponse.json({ error: 'Alta precisão ainda não está disponível.' }, { status: 403 })
  }

  // Seleção exigida? insert_element sempre; demais só se o no-mask estiver OFF.
  const maskRequired = REQUIRES_MASK[action] || !editV3NoMaskEnabled()
  if (maskRequired && !maskUrl && !dryRun) {
    return NextResponse.json({ error: 'Selecione a área que deseja alterar.' }, { status: 400 })
  }
  // Sem máscara, ainda precisa de um pedido claro (texto ou referência).
  if (!maskRequired && !maskUrl && !instruction && references.length === 0 && !dryRun) {
    return NextResponse.json({ error: 'Descreva o que deseja alterar ou selecione uma área.' }, { status: 400 })
  }

  const chargeOn = editV3ChargeEnabled()
  const model: GoogleImageModel = quality === 'high' ? 'gemini-3-pro-image' : 'gemini-3.1-flash-image'
  let admin: ReturnType<typeof createAdminClient> | null = null
  let jobId: string | null = null

  try {
    // createAdminClient dentro do try: se a service-role key faltar, o erro cai
    // no catch e devolve o shape JSON padrão (não um 500 cru do framework).
    const db = createAdminClient()
    admin = db
    // ── Medidas server-side (nunca confiar no cliente) ──────────────────────
    assertSafeImageUrl(sourceUrl)
    if (maskUrl) assertSafeImageUrl(maskUrl)
    const sourceBuf = await fetchImageBuffer(sourceUrl)
    const sharp = (await import('sharp')).default
    const meta = await sharp(sourceBuf).metadata()
    const imageMegapixels = Math.min(64, ((meta.width ?? 0) * (meta.height ?? 0)) / 1_000_000 || 2)

    const resolution = resolveResolution({ requested: outputResolution, imageMegapixels, quality })
    const hasReference = references.length > 0
    const nodes = nodesForAction({ action, quality, hasReference, resolution })
    const providerCostUsd = modelCostUsd(MODEL_FOR_QUALITY[quality], resolution)

    const debugBlock = debug
      ? {
          provider: 'google',
          model,
          resolved_resolution: resolution,
          image_megapixels: imageMegapixels,
          provider_cost_usd: providerCostUsd,
        }
      : undefined

    // ── DRY-RUN: custo estimado, zero chamada paga, zero telemetria ──────────
    // (assumeMask permite à UI mostrar o custo antes de o usuário pintar.)
    if (dryRun) {
      void assumeMask
      return NextResponse.json({
        dry_run: true,
        nodes_cost: nodes,
        charge: { simulated: !chargeOn, debited: false },
        valid: true,
        ...(debug ? { debug: debugBlock } : {}),
      })
    }

    // SEM pré-voo de saldo: a cobrança é atômica e autoritativa via
    // consume_workspace_nodes (P0001 → 402) DEPOIS do sucesso, e ela resolve o
    // PAGADOR (dono do workspace em saldo poolado). Um pré-read de
    // user_node_balance leria a carteira do MEMBRO, não a do pagador, e
    // bloquearia membros por engano. Débito só no sucesso; falha nunca cobra.

    // ── Job 'processing' (persistência completa; resiliente) ─────────────────
    jobId = await insertJobResilient(db, {
      user_id: userId,
      action_type: action,
      status: 'processing',
      source_image_url: sourceUrl,
      mask_url: maskUrl,
      prompt: instruction,
      instruction: instruction || null,
      provider: null,
      model: null,
      request_id: null,
      result_image_url: null,
      nodes_cost: nodes,
      charged: false,
      quality_mode: quality,
      preservation_mode: preservation,
      intensity_mode: intensity,
      reference_count: references.length,
      out_of_mask_delta: null,
      in_mask_delta: null,
      mask_coverage: null,
      error_message: null,
    })

    // ── Geração (recompose + gates dentro do pipeline) ───────────────────────
    const request: EditV3Request = {
      action,
      sourceImageUrl: sourceUrl,
      maskUrl,
      instruction,
      quality,
      preservation,
      intensity,
      outputResolution,
      references,
    }
    const run = await runEditV3({
      request,
      instructionEn: instruction, // PT cru — as cláusulas do prompt garantem o contrato
      model,
      resolution,
      falFallback: editV3FalFallbackEnabled(),
      uploadAsset: (buffer, kind) => uploadEditAsset(db, userId, buffer, kind),
    })

    // ── Reprovado pelo gate → NADA cobrado ───────────────────────────────────
    if (run.rejected) {
      await updateJobResilient(db, jobId, {
        status: 'rejected',
        provider: run.provider,
        model: run.model,
        request_id: run.requestId,
        result_image_url: run.resultUrl,
        out_of_mask_delta: run.metrics.outOfMaskDelta,
        in_mask_delta: run.metrics.inMaskDelta,
        mask_coverage: run.metrics.maskCoverage,
        error_message: run.rejectReasons.join(','),
        completed_at: new Date().toISOString(),
      })
      console.log(`[edit-v3] rejected user=${userId} action=${action} reasons=${run.rejectReasons.join(',')}`)
      return NextResponse.json({
        rejected: true,
        reasons: [maskUrl
          ? 'A edição alterou áreas fora da seleção ou não aplicou o pedido e foi descartada.'
          : 'A edição não aplicou o pedido como esperado e foi descartada.'],
        message: 'Nenhum node foi consumido. Refazer é grátis.',
        nodes_cost: nodes,
        charge: { simulated: !chargeOn, debited: false },
        ...(debug ? { debug: { ...debugBlock, metrics: run.metrics, reject_reasons: run.rejectReasons, used_fallback: run.usedFallback } } : {}),
      })
    }

    // ── SUCESSO → cobrança REAL no sucesso (ou simulada) ─────────────────────
    let charged = false
    if (chargeOn && nodes > 0) {
      const { error: debitErr } = await db.rpc('consume_workspace_nodes', {
        user_id_input: userId,
        amount: nodes,
      })
      if (debitErr) {
        // P0001 = saldo insuficiente (a cobrança atômica é o único guard de saldo).
        const status = debitErr.code === 'P0001' ? 402 : 500
        await updateJobResilient(db, jobId, {
          status: 'failed',
          provider: run.provider,
          model: run.model,
          request_id: run.requestId,
          error_message: `debit_failed:${debitErr.code ?? debitErr.message}`,
          completed_at: new Date().toISOString(),
        })
        console.error('[edit-v3] debit falhou após sucesso:', debitErr.message)
        return NextResponse.json(
          { error: status === 402 ? 'Saldo insuficiente.' : 'Não foi possível concluir a cobrança.', charge: { simulated: false, debited: false } },
          { status },
        )
      }
      charged = true
      // Uso mensal (1 edit + nodes) — só quando cobrou de verdade.
      try {
        await db.rpc('bump_monthly_usage', {
          user_id_input: userId,
          edits_delta: 1,
          free_fixes_delta: 0,
          nodes_delta: nodes,
        })
      } catch (e) {
        console.warn('[edit-v3] bump_monthly_usage falhou:', (e as Error).message)
      }
    }

    await updateJobResilient(db, jobId, {
      status: 'completed',
      provider: run.provider,
      model: run.model,
      request_id: run.requestId,
      result_image_url: run.resultUrl,
      charged,
      out_of_mask_delta: run.metrics.outOfMaskDelta,
      in_mask_delta: run.metrics.inMaskDelta,
      mask_coverage: run.metrics.maskCoverage,
      completed_at: new Date().toISOString(),
    })
    const ps = run.stages.provider
    console.log(
      `[edit-v3] done user=${userId} action=${action} provider=${run.provider} model=${run.model} ` +
      `res=${resolution} fallback=${run.usedFallback} charged=${charged} nodes=${nodes} ` +
      `tokens=${ps.totalTokens}(out ${ps.outputTokens}) realUsd=${ps.realCostUsd != null ? ps.realCostUsd.toFixed(4) : 'n/a'} ` +
      `marginReal=${ps.realCostUsd != null ? Math.round(marginAt(nodes, ps.realCostUsd) * 100) + '%' : 'n/a'} ` +
      `outDrift=${run.metrics.outOfMaskDelta} inDelta=${run.metrics.inMaskDelta} dur=${ps.durationMs}ms`,
    )

    return NextResponse.json({
      rejected: false,
      result_url: run.resultUrl,
      nodes_cost: nodes,
      charge: { simulated: !chargeOn, debited: charged },
      output: run.outputDims,
      ...(debug
        ? {
            debug: {
              ...debugBlock,
              used_fallback: run.usedFallback,
              request_id: run.requestId,
              metrics: run.metrics,
              job_id: jobId,
              cost: {
                resolution,
                est_provider_usd: providerCostUsd,
                real_output_usd: ps.realCostUsd,
                tokens: { prompt: ps.promptTokens, output: ps.outputTokens, total: ps.totalTokens },
                nodes,
                margin_real: ps.realCostUsd != null ? marginAt(nodes, ps.realCostUsd) : null,
              },
            },
          }
        : {}),
    })
  } catch (err) {
    // Falha técnica: erro claro, NADA cobrado (a cobrança só acontece no sucesso).
    const message =
      err instanceof EditV3InputError ? err.message
      : err instanceof MaskImageMismatchError ? 'A seleção não corresponde a esta imagem. Refaça a seleção sobre a imagem atual.'
      : 'Não foi possível concluir a edição. Nenhum node foi consumido.'
    const status =
      err instanceof EditV3InputError ? 400
      : err instanceof MaskImageMismatchError ? 422
      : (err instanceof GoogleEditError || err instanceof FalEditError || err instanceof EditV3GenerationError) ? 502
      : 500
    if (status >= 500) console.error('[edit-v3] erro:', err)
    // admin pode ser null se createAdminClient() falhou; updateJobResilient
    // também é no-op com jobId null. O guard mantém o tipo correto.
    if (admin) {
      await updateJobResilient(admin, jobId, {
        status: 'failed',
        error_message: (err as Error).message?.slice(0, 500) ?? 'erro',
        completed_at: new Date().toISOString(),
      })
    }
    return NextResponse.json({ error: message, charge: { simulated: !chargeOn, debited: false } }, { status })
  }
}
