// Economia de nodes do Spaces — fonte de verdade dos custos.
// Ajustar aqui afeta UI (cost preview, action bar) e backend (validação,
// débito via consume_nodes_v2). Validar contra custos reais do FAL nas
// primeiras semanas.

import type { EngineId, Resolution } from '@/lib/engines'
import type { Quality } from './types'

export const DNA_EXTRACTION_COST = 8

// Custo de variação por motor × qualidade.
// Pulsar é o motor de exploração e suporta HD; Vega/Quasar são premium e
// bloqueiam HD (constraint do banco e da UI).
const GENERATION_COST: Record<EngineId, Partial<Record<Quality, number>>> = {
  pulsar: { hd: 10, '2k': 15, '4k': 25 },
  vega:   {         '2k': 20, '4k': 40 },
  quasar: {         '2k': 28, '4k': 56 },
}

export function getVistaGenerationCost(engine: EngineId, quality: Quality): number {
  const c = GENERATION_COST[engine]?.[quality]
  if (c === undefined) {
    throw new Error(`Combinação inválida ${engine}/${quality}`)
  }
  return c
}

export function supportsQuality(engine: EngineId, quality: Quality): boolean {
  return GENERATION_COST[engine]?.[quality] !== undefined
}

export function getAvailableQualities(engine: EngineId): Quality[] {
  const map = GENERATION_COST[engine] ?? {}
  return (Object.keys(map) as Quality[]).filter(q => map[q] !== undefined)
}

// Custo de upscale (Clarity), aplicado sobre uma vista existente.
// O target é a qualidade FINAL desejada — 2K só vale a pena pra uma vista HD;
// 4K vale a pena pra qualquer ponto de partida.
export function getUpscaleCost(target: '2k' | '4k'): number {
  return target === '2k' ? 8 : 16
}
