// Custo em nodes do módulo Ampliar — fonte única usada por UI (preview) e
// backend (validação + débito via consume_nodes_v2).
//
// O custo cresce com:
//   - provider (Topaz custa mais que Clarity, Clarity mais que NAFNet)
//   - escala (cada dobra duplica grosso modo)
//   - megapixels da imagem (cap aplicado quando relevante)
//   - número de steps do pipeline (multi-step = soma)
//
// Quando algum desses sinais não estiver disponível, usamos o pior caso
// razoável para evitar débito surpresa.

import {
  effectiveFactor,
  scaleToFactor,
  type ModeId,
  type Scale,
  type UpscaleTab,
} from './types'

// ── Tabela base por modo (custo de UMA execução em escala referência) ─────────
//
// Os valores foram calibrados para refletir custo FAL real + margem de
// nodes. Topaz tem markup maior porque a chamada FAL é mais cara.

const BASE_COST_BY_MODE: Record<ModeId, number> = {
  fidelity:  10,   // Topaz @ 2× referência
  recover:   4,    // Clarity conservador @ 2×
  denoise:   3,    // NAFNet denoise (sem upscale)
  deblur:    3,    // NAFNet deblur  (sem upscale)
  restore:   6,    // Photo Restoration
  smart:     4,    // Clarity conservador @ 2×
}

// ── Multiplicador de escala ───────────────────────────────────────────────────
// Cada dobra de escala cresce ~linearmente em megapixels de saída. 'none'
// não amplia.
//
// A tabela é indexada pelo fator EFETIVO (o que o motor entrega), não pela
// escala pedida — ver effectiveFactor() em types.ts. Antes era indexada pela
// escala e '8x' valia 5: um pedido 8× cobrava 50 nodes na Alta Fidelidade e o
// Topaz devolvia 4× (o teto do schema), trabalho de 20 nodes. Agora 8× e 4×
// custam o mesmo porque entregam o mesmo.

const MULTIPLIER_BY_FACTOR: Record<number, number> = {
  1: 1,
  2: 1,
  4: 2,
}

// ── Cap por megapixels da imagem de entrada ───────────────────────────────────
// Imagens já enormes (≥ 4 MP) usam um pequeno surcharge porque o FAL cobra
// por pixel de saída. Mantemos linear e modesto para não punir o usuário.

function megapixelSurcharge(megapixels: number | undefined): number {
  if (!megapixels || megapixels <= 0) return 0
  if (megapixels <= 4)               return 0
  if (megapixels <= 8)               return 1
  if (megapixels <= 16)              return 2
  return 4
}

// ── API pública ───────────────────────────────────────────────────────────────

export interface CostInput {
  tab:           UpscaleTab
  modeId:        ModeId
  scale:         Scale
  megapixels?:   number   // pixels da imagem de entrada / 1e6
  steps?:        number   // default 1; multi-step (futuro) soma cada etapa
}

export interface CostBreakdown {
  total:         number
  base:          number
  scaleFactor:   number
  megapixelAdd:  number
  steps:         number
}

export function computeUpscaleCost(input: CostInput): CostBreakdown {
  const base         = BASE_COST_BY_MODE[input.modeId]
  const megapixelAdd = megapixelSurcharge(input.megapixels)
  const steps        = Math.max(1, input.steps ?? 1)

  // Aba Aprimorar com escala 'none' ignora multiplicador de escala — só vale
  // a base + surcharge de megapixel. Caso o usuário escolha 2x/4x para Smart,
  // o multiplicador entra normalmente.
  const effectiveScaleMult = input.scale === 'none'
    ? 1
    : MULTIPLIER_BY_FACTOR[effectiveFactor(input.scale)] ?? 1

  const perStep = Math.ceil(base * effectiveScaleMult) + megapixelAdd
  const total   = perStep * steps

  return { total, base, scaleFactor: effectiveScaleMult, megapixelAdd, steps }
}

// Atalho mais comum, retorna só o total (UI usa isso para mostrar antes da
// geração).
export function getUpscaleCostNodes(input: CostInput): number {
  return computeUpscaleCost(input).total
}

// Helper para a UI: dado o file/dimensões, calcula megapixels.
export function megapixelsFromDimensions(w: number | null | undefined, h: number | null | undefined): number | undefined {
  if (!w || !h || w <= 0 || h <= 0) return undefined
  return (w * h) / 1_000_000
}

// Re-export para conveniência da UI
// Teto do OUTPUT em megapixels (input × fator²) — fonte única pro /api/upscale
// e pro catálogo do plugin SketchUp.
export const MAX_OUTPUT_MP = 256

export { scaleToFactor }
