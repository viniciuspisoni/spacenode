// Retocar engines — shared types.
//
// EditMode is what the USER picks (an architectural intention).
// The router maps it to a concrete FAL endpoint (invisible to the user).
// Each engine wrapper accepts the same RetouchInput shape so the router can
// dispatch uniformly.
//
// Adding a new engine? Implement the RetouchEngine signature, register it in
// router.ts, and the UI just needs a new tab entry in EDIT_MODE_LABELS.

import type { Quality } from '../types'

// ── User-facing intention ─────────────────────────────────────────────────────

export type EditMode =
  | 'remove'
  | 'material'
  | 'replace'
  | 'add'
  | 'fix'
  | 'lighting'
  | 'landscape'

export const VALID_EDIT_MODES: EditMode[] = [
  'remove', 'material', 'replace', 'add', 'fix', 'lighting', 'landscape',
]

export function isEditMode(v: unknown): v is EditMode {
  return typeof v === 'string' && (VALID_EDIT_MODES as string[]).includes(v)
}

export interface EditModeMeta {
  label:             string
  /** Curta — usada em tooltips e descrição abaixo das tabs. */
  description:       string
  /** Placeholder do textarea quando esse modo está ativo. */
  promptPlaceholder: string
  /** Ação no botão de gerar (verbo). */
  ctaVerb:           string
}

export const EDIT_MODE_LABELS: Record<EditMode, EditModeMeta> = {
  remove: {
    label:             'Remover',
    description:       'Apague objetos, pessoas, carros ou elementos indesejados.',
    promptPlaceholder: 'Ex: remover o carro selecionado e reconstruir o fundo de forma natural',
    ctaVerb:           'Gerar remoção',
  },
  // Renamed from 'texture' → 'material' (user-visible label and route key).
  material: {
    label:             'Trocar material',
    description:       'Altere revestimentos, pisos, paredes, fachadas e acabamentos.',
    promptPlaceholder: 'Ex: trocar a parede selecionada por concreto aparente cinza claro',
    ctaVerb:           'Gerar troca de material',
  },
  replace: {
    label:             'Substituir',
    description:       'Troque objetos mantendo escala, perspectiva e iluminação.',
    promptPlaceholder: 'Ex: substituir a cadeira selecionada por uma poltrona de couro caramelo',
    ctaVerb:           'Gerar substituição',
  },
  add: {
    label:             'Adicionar',
    description:       'Insira elementos realistas na área selecionada.',
    promptPlaceholder: 'Ex: adicionar vegetação tropical realista na área selecionada',
    ctaVerb:           'Gerar adição',
  },
  fix: {
    label:             'Corrigir detalhes',
    description:       'Corrija artefatos, distorções, manchas ou falhas da imagem.',
    promptPlaceholder: 'Ex: corrigir deformações e artefatos mantendo a imagem natural',
    ctaVerb:           'Gerar correção',
  },
  lighting: {
    label:             'Iluminação',
    description:       'Ajuste luz, sombras, temperatura e atmosfera da cena.',
    promptPlaceholder: 'Ex: adicionar iluminação quente indireta nas áreas selecionadas',
    ctaVerb:           'Gerar iluminação',
  },
  landscape: {
    label:             'Paisagismo',
    description:       'Adicione ou refine jardins, vegetação e áreas externas.',
    promptPlaceholder: 'Ex: criar jardim minimalista com vegetação baixa e pedras naturais',
    ctaVerb:           'Gerar paisagismo',
  },
}

// ── Engine input/output ───────────────────────────────────────────────────────

export interface RetouchInput {
  imageUrl:       string
  maskUrl:        string
  prompt:         string
  referenceUrl?:  string
  quality:        Quality
  seed?:          number
}

export interface RetouchOutput {
  imageUrl: string
  endpoint: string
}

export type RetouchEngine = (input: RetouchInput) => Promise<RetouchOutput>

// ── Engine descriptor returned by the router ──────────────────────────────────

export interface EngineDescriptor {
  mode:        EditMode
  endpoint:    string
  call:        RetouchEngine
  description: string
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class RetouchTimeoutError extends Error {
  readonly isFalTimeout = true
  constructor(public readonly endpoint: string) {
    super(`Retouch timeout on ${endpoint}`)
    this.name = 'RetouchTimeoutError'
  }
}

export class RetouchNoOutputError extends Error {
  constructor(public readonly endpoint: string) {
    super(`Retouch returned no output from ${endpoint}`)
    this.name = 'RetouchNoOutputError'
  }
}
