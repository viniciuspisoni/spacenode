// lib/edit-v2/semantic-gate.ts
//
// Camada invisível 3: gate semântico pós-geração (Gemini vision). Complementa
// o gate de pixels (drift fora da seleção + no-op) com uma avaliação visual:
//   - o pedido foi cumprido?
//   - a geometria/câmera/layout foram preservados?
//   - houve mudança NÃO pedida fora do escopo?
//   - a referência foi seguida (quando houver)?
//
// Papel no produto (norte): ajudar a REJEITAR resultados que alterem o projeto
// de forma indevida — rejeição automática antes de entregar NÃO cobra.
//
// Default LIGADO no v2; kill-switch EDIT_V2_SEMANTIC_GATE=0. Best-effort: se o
// serviço falhar, o gate é pulado (pass-through) — quem bloqueia de verdade é
// o gate de pixels; este refina. Custo e latência registrados SEPARADAMENTE
// (pedido do fundador) para decidirmos se fica sempre ligado.

import { geminiMultiVisionJson } from '@/lib/gemini'
import { SEMANTIC_GATE_COST_USD } from './pricing'
import type { EditIntentV2, SemanticGateResultV2 } from './types'

const SYSTEM = `You are the quality inspector of an architectural image editor.
Compare the ORIGINAL image (1st) with the EDITED result (2nd)` +
  ` — and, when provided, a REFERENCE image (3rd).
Evaluate strictly from an architect's point of view. Output JSON only.`

interface GateLlmOutput {
  change_applied?: unknown
  geometry_preserved?: unknown
  unrequested_changes?: unknown
  artifacts?: unknown
  reference_followed?: unknown
}

/** Vocabulário fechado de motivos — vai para telemetria e para o prompt do
 *  retry restritivo (nunca para o usuário em forma técnica). */
export type SemanticGateReason =
  | 'change_not_applied'
  | 'geometry_altered'
  | 'unrequested_changes'
  | 'artifacts'
  | 'reference_not_followed'

export interface SemanticGateOpts {
  originalUrl: string
  editedUrl: string
  referenceUrl?: string | null
  instructionEn: string
  intent: EditIntentV2
  /** Kill-switch externo (flags.semanticGate). */
  enabled: boolean
  timeoutMs?: number
}

export async function evaluateEditSemantics(opts: SemanticGateOpts): Promise<SemanticGateResultV2> {
  if (!opts.enabled) {
    return { pass: true, reasons: [], skipped: true, durationMs: 0, costUsdEstimated: 0 }
  }

  const startedAt = Date.now()
  try {
    const imageUrls = [opts.originalUrl, opts.editedUrl]
    if (opts.referenceUrl) imageUrls.push(opts.referenceUrl)

    const user = JSON.stringify({
      edit_type: opts.intent,
      instruction_en: opts.instructionEn,
      has_reference: Boolean(opts.referenceUrl),
      expected_json: {
        change_applied: 'boolean — the requested change is visible in the edited image',
        geometry_preserved: 'boolean — camera, perspective, structure, openings and layout unchanged',
        unrequested_changes: 'boolean — true if anything OUTSIDE the request visibly changed',
        artifacts: 'boolean — true if there are visual defects (warped lines, smudges, ghosting)',
        reference_followed: 'boolean|null — null when there is no reference',
      },
    })

    const raw = await geminiMultiVisionJson({
      system: SYSTEM,
      user,
      imageUrls,
      temperature: 0.1,
      maxTokens: 300,
      timeoutMs: opts.timeoutMs ?? 20_000,
    })
    const parsed = JSON.parse(raw) as GateLlmOutput

    const reasons: SemanticGateReason[] = []
    if (parsed.change_applied === false) reasons.push('change_not_applied')
    if (parsed.geometry_preserved === false) reasons.push('geometry_altered')
    if (parsed.unrequested_changes === true) reasons.push('unrequested_changes')
    if (parsed.artifacts === true) reasons.push('artifacts')
    if (opts.referenceUrl && parsed.reference_followed === false) reasons.push('reference_not_followed')

    return {
      pass: reasons.length === 0,
      reasons,
      skipped: false,
      durationMs: Date.now() - startedAt,
      costUsdEstimated: SEMANTIC_GATE_COST_USD,
    }
  } catch (err) {
    // Pass-through: o gate semântico nunca derruba uma edição por indisponibilidade
    // própria. O gate de pixels continua valendo.
    console.warn(
      `[edit-v2/semantic-gate] indisponível (${String((err as Error)?.message ?? err).slice(0, 120)}) — pass-through`,
    )
    return {
      pass: true,
      reasons: [],
      skipped: true,
      durationMs: Date.now() - startedAt,
      costUsdEstimated: 0,
    }
  }
}
