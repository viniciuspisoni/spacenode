// Preço do Editar V4.
//
// O preço não é uma tabela: é derivado do custo do fornecedor. Estes testes
// travam as DUAS regras de negócio que o derivam, para que uma mudança de custo
// (ou de preço de render) não quebre nenhuma delas em silêncio:
//
//   A. margem-alvo de 80%;
//   B. editar custa menos que gerar.
//
// Quando as duas brigam, B ganha e a margem cede — isso também é testado, senão
// alguém "conserta" o teto achando que é bug.

import { describe, expect, it } from 'vitest'
import {
  MARGIN_NODE_VALUE_USD,
  NODE_MEDIAN_USD,
  PROVIDER_COST,
  TARGET_MARGIN,
  callCostUsd,
  marginAt,
  maxEditNodes,
  nodesForCost,
  nodesForEdit,
} from '@/lib/edit-v4/pricing'
import { DEFAULT_ENGINE, DEFAULT_RESOLUTION, getNodesCost } from '@/lib/engines'

describe('preço da edição', () => {
  it('a edição padrão (ModelArk, faixa barata) custa 18 nodes', () => {
    // Este é o número que aparece na tela. Se ele mudar, foi porque o custo do
    // fornecedor mudou — e aí a mudança é intencional e este teste deve ser
    // atualizado junto, de propósito.
    expect(nodesForEdit({ provider: 'ark' })).toBe(18)
  })

  it('não arredonda para cima por erro de ponto flutuante', () => {
    // (0,045 × 1,08) / 0,2 / 0,0135 dá exatamente 18, mas em ponto flutuante sai
    // 18.000000000000007 — sem a tolerância do arredondamento, cobraria 19.
    const exact = (PROVIDER_COST.ark.low * 1.08) / (1 - TARGET_MARGIN) / MARGIN_NODE_VALUE_USD
    expect(exact).toBeGreaterThan(18)
    expect(exact).toBeLessThan(18.001)
    expect(nodesForCost(PROVIDER_COST.ark.low)).toBe(18)
  })

  it('entrega margem ≥ 80% na rota primária, com ou sem referência', () => {
    const nodes = nodesForEdit({ provider: 'ark' })
    const semRef = callCostUsd({ provider: 'ark', outputPixels: 2_000_000, inputImages: 1 })
    const comRef = callCostUsd({ provider: 'ark', outputPixels: 2_000_000, inputImages: 2 })
    expect(marginAt(nodes, semRef)).toBeGreaterThanOrEqual(0.8)
    expect(marginAt(nodes, comRef)).toBeGreaterThanOrEqual(0.8)
  })

  it('na mediana real do node a margem é ainda maior', () => {
    const nodes = nodesForEdit({ provider: 'ark' })
    const custo = callCostUsd({ provider: 'ark', outputPixels: 2_000_000, inputImages: 1 })
    expect(marginAt(nodes, custo, NODE_MEDIAN_USD)).toBeGreaterThan(0.85)
  })

  it('nunca cobra mais que um render — nem se o custo do fornecedor explodir', () => {
    const render = getNodesCost(DEFAULT_ENGINE, DEFAULT_RESOLUTION)
    expect(maxEditNodes()).toBeLessThan(render)
    expect(nodesForCost(999)).toBe(maxEditNodes())
    expect(nodesForCost(999)).toBeLessThan(render)
  })

  it('o teto acompanha o preço do render (não é número escrito à mão)', () => {
    expect(maxEditNodes()).toBe(getNodesCost(DEFAULT_ENGINE, DEFAULT_RESOLUTION) - 1)
  })

  it('preço nunca é zero nem negativo', () => {
    expect(nodesForCost(0)).toBeGreaterThanOrEqual(1)
    expect(nodesForCost(-5)).toBeGreaterThanOrEqual(1)
  })
})

describe('custo por chamada', () => {
  it('a faixa barata vale até o teto de CADA provedor', () => {
    expect(callCostUsd({ provider: 'ark', outputPixels: 2_600_000, inputImages: 1 })).toBe(
      PROVIDER_COST.ark.low,
    )
    expect(callCostUsd({ provider: 'ark', outputPixels: 2_700_000, inputImages: 1 })).toBe(
      PROVIDER_COST.ark.high,
    )
    expect(callCostUsd({ provider: 'fal', outputPixels: 1536 * 1536, inputImages: 1 })).toBe(
      PROVIDER_COST.fal.low,
    )
    expect(callCostUsd({ provider: 'fal', outputPixels: 1536 * 1536 + 1, inputImages: 1 })).toBe(
      PROVIDER_COST.fal.high,
    )
  })

  it('cobra por imagem de entrada além da primeira', () => {
    const uma = callCostUsd({ provider: 'ark', outputPixels: 1_500_000, inputImages: 1 })
    const duas = callCostUsd({ provider: 'ark', outputPixels: 1_500_000, inputImages: 2 })
    expect(duas - uma).toBeCloseTo(PROVIDER_COST.ark.extraInput, 6)
  })

  it('o teto da faixa barata da fal é o mais apertado dos dois', () => {
    // É por isso que o dimensionamento da saída mira o número da fal: um pedido
    // só cai na faixa barata nos DOIS provedores, e a queda de rota não muda o
    // preço de faixa.
    expect(PROVIDER_COST.fal.lowTierMaxPixels).toBeLessThan(PROVIDER_COST.ark.lowTierMaxPixels)
  })
})
