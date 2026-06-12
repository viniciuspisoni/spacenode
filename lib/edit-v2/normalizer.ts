// lib/edit-v2/normalizer.ts
//
// Camada invisível 1: normalizador de instrução. Converte o pedido do usuário
// (PT, linguagem livre) num spec estruturado e SEGURO em inglês técnico, antes
// do roteamento. Substitui o classifier por keywords do v1.
//
// Responsabilidades (aprovadas pelo fundador, 2026-06-12):
//   - traduzir a instrução preservando geometria, câmera, escala, perspectiva
//     e intenção arquitetônica;
//   - detectar pedido ambíguo/fora do tipo e escolher a leitura SEGURA
//     (regra de desempate: preservar o projeto);
//   - sugerir o papel da referência anexada;
//   - sinalizar quando o pedido exige rigor geométrico extra.
//
// Telemetria: custo e latência REGISTRADOS SEPARADAMENTE (durationMs +
// costUsdEstimated) para decidirmos se a camada fica sempre ligada ou só em
// alguns tipos de edição. Kill-switch: EDIT_V2_NORMALIZER=0.
//
// Falha do LLM NUNCA bloqueia a edição: cai no fallback determinístico
// (instrução crua + cláusulas do composer, que já garantem o contrato).

import { geminiTextJson } from '@/lib/gemini'
import { NORMALIZER_COST_USD } from './pricing'
import { deterministicInstructionEn } from './prompts'
import type { EditIntentV2, NormalizedInstructionV2, ReferenceKindV2 } from './types'

const SYSTEM = `You are the instruction compiler of an architectural image editor.
Users are architects/interior designers writing in Portuguese. Convert their request
into a precise, SAFE English editing instruction for an image model.

Rules:
- Preserve the architectural project above all: geometry, camera, perspective, scale,
  openings, layout. Never expand the request beyond what was asked.
- If the request is ambiguous or asks for more than the edit type supports (e.g. two
  surfaces in a single material swap), narrow it to the SAFEST single interpretation
  and flag it.
- Keep material names, finishes and architectural terms technically precise.
- Output JSON only.`

interface NormalizerLlmOutput {
  instruction_en?: unknown
  ambiguous?: unknown
  ambiguity_note?: unknown
  strict_geometry?: unknown
  reference_kind_hint?: unknown
}

const VALID_REF_KINDS: ReadonlySet<string> = new Set(['material', 'object', 'context'])

export interface NormalizeInstructionOpts {
  instructionPt: string
  intent: EditIntentV2
  hasMask: boolean
  referenceKind?: ReferenceKindV2 | null
  /** Kill-switch externo (flags.normalizer). */
  enabled: boolean
  timeoutMs?: number
}

export async function normalizeInstruction(
  opts: NormalizeInstructionOpts,
): Promise<NormalizedInstructionV2> {
  const fallback: NormalizedInstructionV2 = {
    instructionEn: deterministicInstructionEn(opts.instructionPt, opts.intent),
    ambiguous: false,
    ambiguityNote: null,
    requiresStrictGeometry: false,
    referenceKindHint: opts.referenceKind ?? null,
    used: false,
    durationMs: 0,
    costUsdEstimated: 0,
  }

  // Sem texto não há o que normalizar (remoção/correção só com seleção).
  if (!opts.enabled || !opts.instructionPt.trim()) return fallback

  const startedAt = Date.now()
  try {
    const user = JSON.stringify({
      edit_type: opts.intent,
      has_selection: opts.hasMask,
      attached_reference: opts.referenceKind ?? null,
      user_request_pt: opts.instructionPt.trim(),
      expected_json: {
        instruction_en: 'string — the safe technical instruction',
        ambiguous: 'boolean',
        ambiguity_note: 'string|null — what was narrowed and why',
        strict_geometry: 'boolean — true if the request touches structure/openings/frames',
        reference_kind_hint: "'material'|'object'|'context'|null",
      },
    })

    const raw = await geminiTextJson({
      system: SYSTEM,
      user,
      temperature: 0.1,
      maxTokens: 500,
      timeoutMs: opts.timeoutMs ?? 12_000,
    })
    const parsed = JSON.parse(raw) as NormalizerLlmOutput

    const instructionEn =
      typeof parsed.instruction_en === 'string' && parsed.instruction_en.trim()
        ? parsed.instruction_en.trim()
        : fallback.instructionEn
    const refHint =
      typeof parsed.reference_kind_hint === 'string' && VALID_REF_KINDS.has(parsed.reference_kind_hint)
        ? (parsed.reference_kind_hint as ReferenceKindV2)
        : fallback.referenceKindHint

    return {
      instructionEn,
      ambiguous: parsed.ambiguous === true,
      ambiguityNote: typeof parsed.ambiguity_note === 'string' ? parsed.ambiguity_note : null,
      requiresStrictGeometry: parsed.strict_geometry === true,
      referenceKindHint: refHint,
      used: true,
      durationMs: Date.now() - startedAt,
      costUsdEstimated: NORMALIZER_COST_USD,
    }
  } catch (err) {
    // Best-effort: loga e segue com o fallback determinístico — a edição nunca
    // falha por causa da camada invisível.
    console.warn(
      `[edit-v2/normalizer] indisponível (${String((err as Error)?.message ?? err).slice(0, 120)}) — fallback determinístico`,
    )
    return { ...fallback, durationMs: Date.now() - startedAt }
  }
}
