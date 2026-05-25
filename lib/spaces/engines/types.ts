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

export type EditMode = 'remove' | 'material' | 'replace' | 'add'

export interface EditModeMeta {
  label:             string
  description:       string
  promptPlaceholder: string
}

export const EDIT_MODE_LABELS: Record<EditMode, EditModeMeta> = {
  remove: {
    label:             'Remover',
    description:       'Apagar objeto ou pessoa, preencher com o entorno',
    promptPlaceholder: 'Ex: remover pessoa em primeiro plano',
  },
  // Renamed from 'texture' → 'material' (user-visible label and route key).
  material: {
    label:             'Trocar material',
    description:       'Mudar material, cor ou acabamento da área mascarada',
    promptPlaceholder: 'Ex: paredes em concreto aparente pigmentado de cinza',
  },
  replace: {
    label:             'Substituir',
    description:       'Trocar elemento por outro (móvel, luminária, etc.)',
    promptPlaceholder: 'Ex: cadeira de madeira clara estilo Wegner',
  },
  add: {
    label:             'Adicionar',
    description:       'Inserir um novo elemento na cena',
    promptPlaceholder: 'Ex: planta tropical em vaso de concreto',
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
