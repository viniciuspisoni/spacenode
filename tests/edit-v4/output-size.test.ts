// Dimensionamento da saída pelo crop.
//
// Este número decide preço E latência de toda edição, e precisa valer para as
// DUAS rotas ao mesmo tempo: a fal recusa abaixo de 1024² e cobra caro acima de
// 1536²; a ModelArk cobra caro acima de 2,61 MP. O único intervalo que serve
// aos dois é [1024², 1536²] — e é ele que este teste tranca.

import { describe, expect, it } from 'vitest'
import { outputSizeForCrop } from '@/lib/edit-v4/engine'
import { SEEDREAM_LOW_TIER_MAX_PIXELS, SEEDREAM_MIN_PIXELS } from '@/lib/ai/seedream-size'
import { PROVIDER_COST, callCostUsd } from '@/lib/edit-v4/pricing'

const CROPS: [number, number][] = [
  [251, 225],     // o crop minúsculo que o V3 mandava gerar em 2 MP
  [64, 64],
  [1, 1],
  [300, 200],
  [800, 600],
  [1200, 1200],
  [1920, 1080],
  [3840, 2160],
  [4000, 250],    // faixa larguíssima (parede inteira, seleção rasa)
  [250, 4000],    // e o contrário
]

describe('outputSizeForCrop', () => {
  it.each(CROPS)('crop %ix%i cabe no envelope das duas rotas', (w, h) => {
    const size = outputSizeForCrop(w, h)
    const px = size.width * size.height
    expect(px).toBeGreaterThanOrEqual(SEEDREAM_MIN_PIXELS)
    expect(px).toBeLessThanOrEqual(SEEDREAM_LOW_TIER_MAX_PIXELS)
  })

  it.each(CROPS)('crop %ix%i sai sempre na faixa BARATA dos dois provedores', (w, h) => {
    const size = outputSizeForCrop(w, h)
    const px = size.width * size.height
    expect(callCostUsd({ provider: 'ark', outputPixels: px, inputImages: 1 })).toBe(
      PROVIDER_COST.ark.low,
    )
    expect(callCostUsd({ provider: 'fal', outputPixels: px, inputImages: 1 })).toBe(
      PROVIDER_COST.fal.low,
    )
  })

  it.each(CROPS)('crop %ix%i sai em múltiplos de 16', (w, h) => {
    const size = outputSizeForCrop(w, h)
    expect(size.width % 16).toBe(0)
    expect(size.height % 16).toBe(0)
  })

  it('preserva a proporção do crop', () => {
    const size = outputSizeForCrop(1920, 1080)
    expect(size.width / size.height).toBeCloseTo(1920 / 1080, 1)
  })

  it('crop pequeno pede MENOS pixels que crop grande — é daí que vem a velocidade', () => {
    const pequeno = outputSizeForCrop(251, 225)
    const grande = outputSizeForCrop(1920, 1080)
    expect(pequeno.width * pequeno.height).toBeLessThan(grande.width * grande.height)
  })

  it('crop grande satura no teto da faixa barata, não acima', () => {
    const size = outputSizeForCrop(3840, 2160)
    const px = size.width * size.height
    expect(px).toBeGreaterThan(SEEDREAM_LOW_TIER_MAX_PIXELS * 0.9)
    expect(px).toBeLessThanOrEqual(SEEDREAM_LOW_TIER_MAX_PIXELS)
  })

  it('não quebra com entrada degenerada', () => {
    for (const [w, h] of [[0, 0], [-10, 5], [Number.NaN, 100]] as [number, number][]) {
      const size = outputSizeForCrop(w, h)
      expect(Number.isFinite(size.width)).toBe(true)
      expect(Number.isFinite(size.height)).toBe(true)
      expect(size.width).toBeGreaterThan(0)
      expect(size.height).toBeGreaterThan(0)
    }
  })
})
