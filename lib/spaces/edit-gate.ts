// Quality gate AMPLIADO + retry automático do Editar (server-side).
//
// Envolve o runEdit (edit-pipeline.ts) com a avaliação pós-geração e o retry
// grátis da spec Google-first:
//
//   1. gera; 2. avalia (drift fora da máscara, no-op dentro da máscara e —
//   atrás de flag — avaliação semântica via Gemini vision); 3. se reprovar,
//   UMA tentativa extra automática com prompt mais restritivo (e, com
//   EDIT_FLUX_FALLBACK=1, no engine Flux equivalente); 4. se reprovar de novo,
//   devolve `rejected` — a rota estorna/não cobra e registra o motivo.
//
// O retry NUNCA gera débito extra (cobrança única antes da 1ª tentativa; a
// rejeição final estorna tudo). O custo do provider no retry é absorvido.

import type { Quality } from './types'
import type { EditRoutingResult, EditTool } from './edit-router'
import { isBlendTool } from './edit-router'
import { dispatchEndpoint } from './engines'
import { buildStrictRetryPrompt } from './edit-prompts'
import {
  runEdit,
  OUT_OF_MASK_GATE,
  BLEND_OUT_OF_MASK_GATE,
  type RunEditResult,
  type UploadKind,
} from './edit-pipeline'
import { geminiMultiVisionJson } from '@/lib/gemini'

/** Abaixo disso, a mudança DENTRO da máscara é imperceptível → no-op (não cobrar). */
export const NO_CHANGE_FLOOR = 0.01

/** Gate semântico (Gemini vision) — best-effort, atrás de flag (latência/custo). */
export function semanticGateEnabled(): boolean {
  return process.env.EDIT_SEMANTIC_GATE === '1'
}

export type GateRejectionKind = 'quality_gate' | 'no_change'

export interface GateVerdict {
  ok:     boolean
  kind:   GateRejectionKind | null
  reason: string | null
}

/** Ferramentas cuja edição mascarada DEVE produzir mudança visível na máscara. */
function isContentTool(tool: EditTool): boolean {
  return tool === 'remove' || tool === 'material' || tool === 'replace'
    || tool === 'add' || tool === 'fix_detail'
}

/** Gates baratos (sharp, sempre ativos): drift fora da máscara + no-op dentro. */
export function evaluateBasicGates(run: RunEditResult, tool: EditTool): GateVerdict {
  const gateLimit = isBlendTool(tool) ? BLEND_OUT_OF_MASK_GATE : OUT_OF_MASK_GATE
  if (run.outOfMaskDelta != null && run.outOfMaskDelta > gateLimit) {
    return {
      ok:     false,
      kind:   'quality_gate',
      reason: `out_of_mask_drift=${(run.outOfMaskDelta * 100).toFixed(1)}%`,
    }
  }
  if (isContentTool(tool) && run.inMaskDelta != null && run.inMaskDelta < NO_CHANGE_FLOOR) {
    return {
      ok:     false,
      kind:   'no_change',
      reason: `in_mask_delta=${(run.inMaskDelta * 100).toFixed(2)}% (sem alteração perceptível)`,
    }
  }
  return { ok: true, kind: null, reason: null }
}

// ── Gate semântico (flag EDIT_SEMANTIC_GATE=1) ─────────────────────────────────
// Pergunta ao Gemini vision se: a alteração pedida ocorreu; a geometria foi
// preservada; há artefatos; a referência foi seguida (quando enviada).
// BEST-EFFORT: qualquer erro de infra/parsing → passa (nunca derruba a edição
// por falha do avaliador).

interface SemanticVerdict {
  change_applied?:     boolean
  geometry_preserved?: boolean
  artifacts?:          boolean
  reference_followed?: boolean | null
  reason?:             string
}

export async function evaluateSemanticGate(args: {
  sourceUrl:    string
  resultUrl:    string
  referenceUrl: string | null
  userPrompt:   string
  tool:         EditTool
}): Promise<GateVerdict> {
  if (!semanticGateEnabled()) return { ok: true, kind: null, reason: null }
  try {
    const images = [args.sourceUrl, args.resultUrl, ...(args.referenceUrl ? [args.referenceUrl] : [])]
    const raw = await geminiMultiVisionJson({
      system: [
        'You are a strict quality evaluator for AI edits of architectural images.',
        'Image 1 = ORIGINAL. Image 2 = EDITED RESULT.',
        args.referenceUrl ? 'Image 3 = USER REFERENCE (guidance the edit should follow).' : '',
        'Answer ONLY a JSON object: {"change_applied":bool,"geometry_preserved":bool,',
        '"artifacts":bool,"reference_followed":bool|null,"reason":"short pt-BR"}.',
        'change_applied: the requested edit is clearly visible in the result.',
        'geometry_preserved: walls, openings, furniture layout, camera and perspective unchanged (except the requested edit).',
        'artifacts: visible AI artifacts, warping, smudges or unrealistic textures.',
        'reference_followed: null when there is no reference image.',
      ].filter(Boolean).join(' '),
      user: `Pedido do usuário (${args.tool}): ${args.userPrompt || '(remoção do conteúdo selecionado)'}`,
      imageUrls: images,
      maxTokens: 300,
    })
    const v = JSON.parse(raw) as SemanticVerdict
    const ok =
      v.change_applied !== false &&
      v.geometry_preserved !== false &&
      v.artifacts !== true &&
      v.reference_followed !== false
    if (ok) return { ok: true, kind: null, reason: null }
    const failed: string[] = []
    if (v.change_applied === false)     failed.push('alteração não aplicada')
    if (v.geometry_preserved === false) failed.push('geometria alterada')
    if (v.artifacts === true)           failed.push('artefatos')
    if (v.reference_followed === false) failed.push('referência não seguida')
    return {
      ok:     false,
      kind:   v.change_applied === false ? 'no_change' : 'quality_gate',
      reason: `semantic: ${failed.join(', ')}${v.reason ? ` — ${v.reason}` : ''}`,
    }
  } catch (err) {
    console.warn('[edit-gate] semantic gate indisponível (pass-through):', (err as Error).message)
    return { ok: true, kind: null, reason: null }
  }
}

// ── Execução com gate + retry automático ───────────────────────────────────────

export interface GatedEditArgs {
  sourceUrl:    string
  maskUrl:      string | null
  /** Prompt FINAL normalizado (composeRouterPrompt — servidor). */
  finalPrompt:  string
  /** Prompt cru do usuário (gate semântico). */
  userPrompt:   string
  quality:      Quality
  referenceUrl?: string
  references?:  { url: string; role: string }[]
  routing:      EditRoutingResult
  tool:         EditTool
  uploadResult: (buffer: Buffer, kind: UploadKind) => Promise<string>
}

export interface GatedEditResult {
  /** Resultado da ÚLTIMA tentativa (aprovada ou não). */
  run:            RunEditResult
  /** true = reprovado mesmo após o retry automático → estornar/não cobrar. */
  rejected:       boolean
  rejectionKind:  GateRejectionKind | null
  gateReason:     string | null
  /** Quantos retries automáticos rodaram (0 ou 1). */
  autoRetryCount: number
  /** Endpoint efetivamente usado na última tentativa. */
  usedEndpoint:   string
}

async function runOnce(args: GatedEditArgs, routing: EditRoutingResult, prompt: string): Promise<RunEditResult> {
  const { call: engine, usesMask } = dispatchEndpoint(routing.endpoint)
  return runEdit({
    sourceUrl:        args.sourceUrl,
    maskUrl:          args.maskUrl,
    prompt,
    quality:          args.quality,
    referenceUrl:     args.referenceUrl,
    references:       args.references,
    routing,
    usesMask,
    softEdges:        isBlendTool(args.tool),
    intentHint:       args.tool === 'remove' ? 'removal' : 'insertion',
    dilateForRemoval: args.tool === 'remove',
    engine,
    uploadResult:     args.uploadResult,
  })
}

async function evaluate(args: GatedEditArgs, run: RunEditResult): Promise<GateVerdict> {
  const basic = evaluateBasicGates(run, args.tool)
  if (!basic.ok) return basic
  return evaluateSemanticGate({
    sourceUrl:    args.sourceUrl,
    resultUrl:    run.resultUrl,
    referenceUrl: args.references?.[0]?.url ?? args.referenceUrl ?? null,
    userPrompt:   args.userPrompt,
    tool:         args.tool,
  })
}

/**
 * runEdit + quality gate + retry automático (grátis) conforme a retryPolicy do
 * editRouter. A rota chama ISTO no lugar do runEdit direto.
 */
export async function runGatedEdit(args: GatedEditArgs): Promise<GatedEditResult> {
  const first = await runOnce(args, args.routing, args.finalPrompt)
  const verdict = await evaluate(args, first)
  if (verdict.ok) {
    return {
      run: first, rejected: false, rejectionKind: null, gateReason: null,
      autoRetryCount: 0, usedEndpoint: first.endpoint,
    }
  }

  const policy = args.routing.retryPolicy
  if (policy.maxAutoRetries < 1) {
    return {
      run: first, rejected: true, rejectionKind: verdict.kind, gateReason: verdict.reason,
      autoRetryCount: 0, usedEndpoint: first.endpoint,
    }
  }

  // ── Retry automático: prompt mais restritivo; Flux fallback atrás de flag. ──
  const retryRouting = policy.fallback ?? args.routing
  const retryPrompt  = buildStrictRetryPrompt(args.finalPrompt, verdict.reason)
  console.log(
    '[edit-gate] retry automático (grátis): motivo=%s endpoint=%s→%s',
    verdict.reason, args.routing.endpoint, retryRouting.endpoint,
  )
  try {
    const second = await runOnce(args, retryRouting, retryPrompt)
    const verdict2 = await evaluate(args, second)
    if (verdict2.ok) {
      return {
        run: second, rejected: false, rejectionKind: null, gateReason: null,
        autoRetryCount: 1, usedEndpoint: second.endpoint,
      }
    }
    // Reprovado de novo → devolve a MELHOR tentativa (menor drift fora da máscara)
    // só para preview de debug; a rota trata como rejeição (estorno).
    const best = pickBestRun(first, second)
    return {
      run: best, rejected: true, rejectionKind: verdict2.kind, gateReason: verdict2.reason,
      autoRetryCount: 1, usedEndpoint: best.endpoint,
    }
  } catch (err) {
    // Retry quebrou (provider/timeout) → mantém a rejeição da 1ª tentativa.
    console.error('[edit-gate] retry automático falhou:', (err as Error).message)
    return {
      run: first, rejected: true, rejectionKind: verdict.kind, gateReason: verdict.reason,
      autoRetryCount: 1, usedEndpoint: first.endpoint,
    }
  }
}

function pickBestRun(a: RunEditResult, b: RunEditResult): RunEditResult {
  const driftA = a.outOfMaskDelta ?? 0
  const driftB = b.outOfMaskDelta ?? 0
  return driftB <= driftA ? b : a
}
