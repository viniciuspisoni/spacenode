// Economia de nodes da Retocar.
//
// Tabela validada no briefing — ajustar contra custos reais do Flux nas
// primeiras semanas. Se margem cair abaixo de 60%, revisar antes da
// monetização ativa em agosto.

import type { Quality } from './types'

export const EDIT_COST: Record<Quality, number> = {
  hd:  6,
  '2k': 12,
  '4k': 24,
}

export function getEditCost(quality: Quality): number {
  return EDIT_COST[quality]
}

// Warning sutil sobre áreas grandes (sem bloqueio hard)
export const LARGE_MASK_THRESHOLD = 0.40
