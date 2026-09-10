// POST /api/edit-v4 — a rota do Editar V4 (motor Seedream 5.0 Pro).
//
// Regras que não se negociam, herdadas do V3 e mantidas:
//
//   - Nasce atrás de EDIT_V4_ENABLED. Flag desligada → 404: a rota não existe
//     para o mundo.
//   - Nodes são debitados SOMENTE no sucesso. Falha técnica, reprovação do gate
//     ou erro do provider → nada é cobrado, e a mensagem diz isso ao usuário.
//   - Sem pré-voo de saldo. A cobrança é atômica e autoritativa via
//     `consume_workspace_nodes` (P0001 → 402) DEPOIS do sucesso, e é ela que
//     resolve o PAGADOR (dono do workspace, em saldo poolado). Um pré-read de
//     saldo leria a carteira do MEMBRO e bloquearia gente por engano.
//   - Provider, modelo e USD só aparecem em modo debug. O contrato público não
//     tem jargão de fornecedor.
//
// A telemetria vai para `edit_v3_jobs` — a mesma tabela do V3, de propósito: é
// dela que a aba Edições do Histórico lê. Tabela nova exigiria refazer aquela
// integração inteira para ganhar nada.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/auth/request-user'
import { uploadEditAsset } from '@/lib/spaces/edit-route-helpers'
import { MaskImageMismatchError } from '@/lib/spaces/edit-crop'
import { normalizeInstruction } from '@/lib/edit-v2/normalizer'
import { insertJobResilient, updateJobResilient } from '@/lib/edit-v3/persist'
import { EditV3InputError } from '@/lib/edit-v3/ssrf'
import {
  editV4ChargeEnabled,
  editV4DebugAllowed,
  editV4Enabled,
  editV4NormalizerEnabled,
  editV4OutlineEnabled,
  editV4Route,
  editV4SemanticGateEnabled,
} from '@/lib/edit-v4/flags'
import { marginAt, nodesForEdit } from '@/lib/edit-v4/pricing'
import { EditV4GenerationError, INTENT_FOR_ACTION, runEditV4 } from '@/lib/edit-v4/pipeline'
import { EditV4EngineError } from '@/lib/edit-v4/engine'
import {
  DEFAULT_EDGE_SOFTNESS,
  REFERENCE_KIND_FOR,
  REQUIRES_MASK,
  isEditV4Action,
  type EditV4Action,
  type EditV4EdgeSoftness,
  type EditV4Intensity,
  type EditV4Preservation,
  type EditV4Reference,
  type EditV4Request,
} from '@/lib/edit-v4/types'

export const runtime = 'nodejs'
export const maxDuration = 300

const PRESERVATION: ReadonlySet<string> = new Set(['maximum', 'standard'])
const INTENSITY: ReadonlySet<string> = new Set(['subtle', 'standard', 'strong'])
const EDGE: ReadonlySet<string> = new Set(['hard', 'soft'])

interface Body {
  action?: unknown
  source_image_url?: unknown
  mask_url?: unknown
  instruction?: unknown
  preservation?: unknown
  intensity?: unknown
  edge_softness?: unknown
  references?: unknown
  debug?: unknown
  /** true → valida e devolve o custo, sem nenhuma chamada paga. */
  dry_run?: unknown
}

/** Aceita no máximo UMA referência, e só se o papel bater com a ação. */
function parseReferences(action: EditV4Action, raw: unknown): EditV4Reference[] {
  const kind = REFERENCE_KIND_FOR[action]
  if (!kind || !Array.isArray(raw)) return []
  for (const item of raw) {
    const r = item as { kind?: unknown; url?: unknown }
    if (typeof r?.url === 'string' && r.url && r.kind === kind) return [{ kind, url: r.url }]
  }
  return []
}

export async function POST(req: NextRequest) {
  if (!editV4Enabled()) {
    return NextResponse.json({ error: 'Não disponível.' }, { status: 404 })
  }

  // Sessão de browser (cookie) ou Bearer (plugin SketchUp). O bypass por header
  // existe só fora de produção e fora da Vercel, para smoke sem browser.
  let userId: string
  const testBypassAllowed = process.env.NODE_ENV !== 'production' && !process.env.VERCEL
  const testUser = testBypassAllowed ? req.headers.get('x-edit-v4-test-user') : null
  if (testUser && /^[0-9a-f-]{36}$/i.test(testUser)) {
    userId = testUser
  } else {
    const { user } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    userId = user.id
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  // ── Validação (vocabulário fechado, mensagens em português) ────────────────
  if (!isEditV4Action(body.action)) {
    return NextResponse.json({ error: 'Tipo de edição inválido.' }, { status: 400 })
  }
  const action = body.action
  const sourceUrl = typeof body.source_image_url === 'string' ? body.source_image_url : ''
  // O dry-run existe para a tela saber o preço ANTES de o usuário ter imagem —
  // exigir uma aqui obrigaria o cliente a inventar uma URL falsa só para
  // perguntar quanto custa.
  if (!sourceUrl && body.dry_run !== true) {
    return NextResponse.json({ error: 'Envie a imagem que será editada.' }, { status: 400 })
  }
  const maskUrl = typeof body.mask_url === 'string' && body.mask_url ? body.mask_url : null
  const instruction = typeof body.instruction === 'string' ? body.instruction.slice(0, 2000) : ''
  const preservation: EditV4Preservation = PRESERVATION.has(String(body.preservation))
    ? (body.preservation as EditV4Preservation)
    : 'maximum'
  const intensity: EditV4Intensity = INTENSITY.has(String(body.intensity))
    ? (body.intensity as EditV4Intensity)
    : 'standard'
  const edgeSoftness: EditV4EdgeSoftness = EDGE.has(String(body.edge_softness))
    ? (body.edge_softness as EditV4EdgeSoftness)
    : DEFAULT_EDGE_SOFTNESS[action]
  const references = parseReferences(action, body.references)
  const debug = body.debug === true && editV4DebugAllowed()
  const dryRun = body.dry_run === true

  if (REQUIRES_MASK[action] && !maskUrl && !dryRun) {
    return NextResponse.json(
      {
        error:
          action === 'insert_element'
            ? 'Marque o lugar onde o elemento será inserido.'
            : 'Marque o objeto que deseja substituir.',
      },
      { status: 400 },
    )
  }
  if (!maskUrl && !instruction && references.length === 0 && !dryRun) {
    return NextResponse.json(
      { error: 'Descreva o que deseja alterar ou marque uma área.' },
      { status: 400 },
    )
  }

  const chargeOn = editV4ChargeEnabled()
  const primaryRoute = editV4Route()
  const nodes = nodesForEdit({ provider: primaryRoute })

  // ── Dry-run: custo, zero chamada paga, zero telemetria ────────────────────
  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      valid: true,
      nodes_cost: nodes,
      charge: { simulated: !chargeOn, debited: false },
      ...(debug ? { debug: { route: primaryRoute } } : {}),
    })
  }

  let admin: ReturnType<typeof createAdminClient> | null = null
  let jobId: string | null = null

  try {
    const db = createAdminClient()
    admin = db

    // ── Normalizador PT→EN ───────────────────────────────────────────────────
    // Instrução em português crua interpolada num prompt em inglês degrada a
    // obediência do modelo. Best-effort: falha do LLM cai na instrução original,
    // e as cláusulas rígidas do prompt seguram o contrato.
    const normalized = await normalizeInstruction({
      instructionPt: instruction,
      intent: INTENT_FOR_ACTION[action],
      hasMask: !!maskUrl,
      referenceKind: references[0]?.kind ?? null,
      enabled: editV4NormalizerEnabled(),
      timeoutMs: 12_000,
    })
    const instructionEn = normalized.instructionEn || instruction
    // Pedido que toca estrutura/aberturas/esquadrias força preservação máxima,
    // independentemente do que o cliente mandou.
    const effectivePreservation: EditV4Preservation = normalized.requiresStrictGeometry
      ? 'maximum'
      : preservation

    jobId = await insertJobResilient(db, {
      user_id: userId,
      action_type: action,
      status: 'processing',
      source_image_url: sourceUrl,
      mask_url: maskUrl,
      prompt: instruction,
      instruction: instruction || null,
      nodes_cost: nodes,
      charged: false,
      quality_mode: 'standard',
      preservation_mode: effectivePreservation,
      intensity_mode: intensity,
      reference_count: references.length,
    })

    const request: EditV4Request = {
      action,
      sourceImageUrl: sourceUrl,
      maskUrl,
      instruction,
      preservation: effectivePreservation,
      intensity,
      edgeSoftness,
      references,
    }
    const run = await runEditV4({
      request,
      instructionEn,
      primaryRoute,
      drawOutline: editV4OutlineEnabled(),
      semanticGate: editV4SemanticGateEnabled(),
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
      console.log(
        `[edit-v4] rejeitado user=${userId} acao=${action} motivos=${run.rejectReasons.join(',')} ` +
        `crop=${run.usedCrop} contorno=${run.usedOutline}`,
      )
      return NextResponse.json({
        rejected: true,
        reasons: [rejectionMessage(run.rejectReasons, !!maskUrl)],
        message: 'Nenhum node foi consumido. Refazer é grátis.',
        nodes_cost: nodes,
        charge: { simulated: !chargeOn, debited: false },
        ...(debug
          ? { debug: { route: primaryRoute, reject_reasons: run.rejectReasons, metrics: run.metrics, cost: run.cost } }
          : {}),
      })
    }

    // ── Sucesso → cobrança ───────────────────────────────────────────────────
    let charged = false
    if (chargeOn && nodes > 0) {
      const { error: debitErr } = await db.rpc('consume_workspace_nodes', {
        user_id_input: userId,
        amount: nodes,
      })
      if (debitErr) {
        const status = debitErr.code === 'P0001' ? 402 : 500
        await updateJobResilient(db, jobId, {
          status: 'failed',
          provider: run.provider,
          model: run.model,
          request_id: run.requestId,
          error_message: `debit_failed:${debitErr.code ?? debitErr.message}`,
          completed_at: new Date().toISOString(),
        })
        console.error('[edit-v4] débito falhou depois do sucesso:', debitErr.message)
        return NextResponse.json(
          {
            error: status === 402 ? 'Saldo insuficiente.' : 'Não foi possível concluir a cobrança.',
            charge: { simulated: false, debited: false },
          },
          { status },
        )
      }
      charged = true
      try {
        await db.rpc('bump_monthly_usage', {
          user_id_input: userId,
          edits_delta: 1,
          free_fixes_delta: 0,
          nodes_delta: nodes,
        })
      } catch (e) {
        console.warn('[edit-v4] bump_monthly_usage falhou:', (e as Error).message)
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

    console.log(
      `[edit-v4] ok user=${userId} acao=${action} rota=${run.provider} fallback=${run.usedFallback} ` +
      `crop=${run.usedCrop} contorno=${run.usedOutline} nodes=${nodes} cobrado=${charged} ` +
      `usd=${run.cost.usd.toFixed(4)} px=${run.cost.outputPixels} margem=${Math.round(marginAt(nodes, run.cost.usd) * 100)}% ` +
      `driftFora=${run.metrics.outOfMaskDelta} deltaDentro=${run.metrics.inMaskDelta} ` +
      `semantico=${run.semantic ? (run.semantic.skipped ? 'pulado' : run.semantic.pass ? 'ok' : run.semantic.reasons.join('|')) : 'off'} ` +
      `dur=${run.cost.durationMs}ms`,
    )

    // Com seleção o gate semântico é advisory: reprovou vira AVISO, não bloqueio
    // (o recompose já garantiu os pixels de fora; o aviso cobre o de dentro).
    const semanticWarning = run.semantic && !run.semantic.pass && !run.semantic.skipped

    return NextResponse.json({
      rejected: false,
      result_url: run.resultUrl,
      nodes_cost: nodes,
      charge: { simulated: !chargeOn, debited: charged },
      output: run.outputDims,
      ...(semanticWarning
        ? {
            warning:
              'A verificação visual apontou possíveis diferenças além do pedido. Confira o resultado antes de usar.',
          }
        : {}),
      ...(debug
        ? {
            debug: {
              route: primaryRoute,
              provider: run.provider,
              model: run.model,
              used_fallback: run.usedFallback,
              used_crop: run.usedCrop,
              used_outline: run.usedOutline,
              request_id: run.requestId,
              metrics: run.metrics,
              semantic: run.semantic,
              job_id: jobId,
              cost: {
                usd: run.cost.usd,
                output_pixels: run.cost.outputPixels,
                duration_ms: run.cost.durationMs,
                nodes,
                margin: marginAt(nodes, run.cost.usd),
              },
            },
          }
        : {}),
    })
  } catch (err) {
    const message =
      err instanceof EditV3InputError
        ? err.message
        : err instanceof MaskImageMismatchError
          ? 'A seleção não corresponde a esta imagem. Refaça a seleção sobre a imagem atual.'
          : 'Não foi possível concluir a edição. Nenhum node foi consumido.'
    const status =
      err instanceof EditV3InputError
        ? 400
        : err instanceof MaskImageMismatchError
          ? 422
          : err instanceof EditV4EngineError || err instanceof EditV4GenerationError
            ? 502
            : 500
    if (status >= 500) console.error('[edit-v4] erro:', err)
    if (admin) {
      await updateJobResilient(admin, jobId, {
        status: 'failed',
        error_message: (err as Error).message?.slice(0, 500) ?? 'erro',
        completed_at: new Date().toISOString(),
      })
    }
    return NextResponse.json(
      { error: message, charge: { simulated: !chargeOn, debited: false } },
      { status },
    )
  }
}

/** Uma frase que diz o que aconteceu e o que fazer — nunca o nome do gate. */
function rejectionMessage(reasons: string[], hadMask: boolean): string {
  if (reasons.includes('outline_leak')) {
    return 'O resultado saiu com marcas da seleção e foi descartado. Tente novamente.'
  }
  if (reasons.every(r => r.startsWith('semantic_'))) {
    return 'A verificação visual detectou alterações além do que foi pedido e a edição foi descartada.'
  }
  if (reasons.includes('no_change')) {
    return 'A edição não mudou nada na área marcada. Tente descrever o pedido de outro jeito.'
  }
  return hadMask
    ? 'A edição alterou áreas fora da seleção e foi descartada. Tente uma seleção menor ou mais precisa.'
    : 'A edição não aplicou o pedido como esperado e foi descartada.'
}
