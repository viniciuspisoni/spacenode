// Prompt composition helpers for Retocar (both standalone and embedded routes).
//
// The client sends `prompt` already enriched with chips/presets ("trocar parede
// por concreto. Manter geometria. Resultado fotorrealista."). The server is
// still responsible for:
//   1. The non-negotiable mask constraint (do not touch pixels outside the
//      painted area).
//   2. The fidelity clause (how strictly to preserve geometry/lighting/scale).
//   3. Mode-specific guard rails (handled separately in guard-policy.ts when
//      a retry is triggered).
//
// Keeping this server-side means a malicious or buggy client can't downgrade
// the constraints by sending a hand-crafted prompt.

import type { EditMode } from './engines'

// ── FidelityMode ──────────────────────────────────────────────────────────────

export type FidelityMode = 'max' | 'balanced' | 'creative'

export const VALID_FIDELITY_MODES: FidelityMode[] = ['max', 'balanced', 'creative']

export function isFidelityMode(v: unknown): v is FidelityMode {
  return typeof v === 'string' && (VALID_FIDELITY_MODES as string[]).includes(v)
}

export interface FidelityMeta {
  label:       string
  description: string
}

export const FIDELITY_LABELS: Record<FidelityMode, FidelityMeta> = {
  max: {
    label:       'Máxima fidelidade',
    description: 'Recomendado para projetos reais. Preserva geometria, escala e composição.',
  },
  balanced: {
    label:       'Equilibrado',
    description: 'Permite pequenas adaptações para melhorar o resultado.',
  },
  creative: {
    label:       'Mais criativo',
    description: 'Permite alterações mais livres na área selecionada.',
  },
}

// ── Fidelity clause ───────────────────────────────────────────────────────────
// Injected into the final prompt sent to the model. Shapes how strictly the
// model preserves architecture outside the mask AND how literally it follows
// the user's intent inside.

function buildFidelityClause(mode: FidelityMode): string {
  switch (mode) {
    case 'max':
      return (
        'Preserve strictly the original architecture, geometry, perspective, ' +
        'scale, camera angle, lighting direction, and overall composition. ' +
        'Modify only the masked area.'
      )
    case 'balanced':
      return (
        'Preserve the original architecture, geometry, and perspective. ' +
        'Small adaptations to scale or lighting are allowed only inside the ' +
        'masked area to improve the final result.'
      )
    case 'creative':
      return (
        'You may freely reinterpret the masked area while preserving the ' +
        'overall composition, perspective, and camera angle. The unmasked ' +
        'context still defines style and atmosphere.'
      )
  }
}

// ── Standalone prompt composer ────────────────────────────────────────────────
// Used by /api/edits (modo standalone). No DNA context — the source image can
// be anything the user uploaded.

export function composeStandaloneFinalPrompt(args: {
  userPrompt: string
  mode:       EditMode
  fidelity:   FidelityMode
}): string {
  const { userPrompt, mode, fidelity } = args
  if (mode === 'remove') {
    // The removal model ignores the prompt entirely. We still return an empty
    // string so callers don't need to special-case it.
    return ''
  }
  return [
    'Edit only the masked area of this image. Do not modify any pixels outside the mask.',
    '',
    `USER REQUEST: ${userPrompt}`,
    '',
    buildFidelityClause(fidelity),
    '',
    'Maintain visual coherence with the rest of the image. Match lighting, perspective, scale, and material rendering style of unmasked areas.',
    '',
    'IMPORTANT: do not modify anything outside the masked area. The output must be pixel-identical to the input outside the mask boundaries.',
    '',
    'Output: photorealistic edit.',
  ].join('\n')
}

// ── Embedded prompt composer ──────────────────────────────────────────────────
// Used by /api/spaces/.../edit (modo embebido). Receives the Space's visual
// DNA as additional context so edits stay coherent with the project's style.

export interface EmbeddedDnaContext {
  estiloNome:    string
  materiais:     Array<{ nome: string; hex: string }>
  paleta:        string[]
  contexto:      string[]
}

export function composeEmbeddedFinalPrompt(args: {
  userPrompt: string
  mode:       EditMode
  fidelity:   FidelityMode
  dna:        EmbeddedDnaContext | null
}): string {
  const { userPrompt, mode, fidelity, dna } = args
  if (mode === 'remove') return ''

  const dnaLines: string[] = []
  if (dna) {
    dnaLines.push(`- Style: ${dna.estiloNome}`)
    if (dna.materiais.length > 0) {
      dnaLines.push(
        `- Materials present: ${dna.materiais.map(m => `${m.nome} (${m.hex})`).join(', ')}`,
      )
    }
    if (dna.paleta.length > 0) {
      dnaLines.push(`- Color palette: ${dna.paleta.join(', ')}`)
    }
    if (dna.contexto.length > 0) {
      dnaLines.push(`- Mood/context: ${dna.contexto.join(', ')}`)
    }
  }
  const dnaBlock = dnaLines.length > 0
    ? `PROJECT CONTEXT (preserve consistency with these):\n${dnaLines.join('\n')}\n\n`
    : ''

  return [
    'Edit only the masked area of this architectural image. Do not modify any pixels outside the mask.',
    '',
    `USER REQUEST: ${userPrompt}`,
    '',
    buildFidelityClause(fidelity),
    '',
    dnaBlock +
    'Maintain visual coherence with the rest of the image. Match lighting, perspective, scale, and material rendering style of unmasked areas.',
    '',
    'IMPORTANT: do not modify anything outside the masked area. The output must be pixel-identical to the input outside the mask boundaries.',
    '',
    'Output: photorealistic architectural rendering.',
  ].join('\n')
}
