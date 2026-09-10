// tests/ai/seedream-size.test.ts
//
// Contrato do tamanho da faixa BARATA do Seedream (lib/ai/seedream-size):
//   - nunca passa do teto da fal (1536² = 2,36 MP) — passar é pagar o dobro;
//   - nunca cai abaixo do piso do schema da fal (1024²) — abaixo o endpoint recusa;
//   - mantém a proporção do original dentro dos 2% que o produto tolera;
//   - lados múltiplos de 16;
//   - sem dimensões → null (o caller mantém o 'auto_2K' de hoje);
//   - a flag é desligada por padrão.

import { describe, it, expect, afterEach } from 'vitest'
import {
  seedreamCheapSize,
  seedreamCheapTierEnabled,
  SEEDREAM_LOW_TIER_MAX_PIXELS,
  SEEDREAM_MIN_PIXELS,
} from '@/lib/ai/seedream-size'

const saved = process.env.SEEDREAM_CHEAP_TIER

afterEach(() => {
  if (saved === undefined) delete process.env.SEEDREAM_CHEAP_TIER
  else process.env.SEEDREAM_CHEAP_TIER = saved
})

// Formatos reais de entrada: prints do SketchUp, fotos e os panorâmicos do Spaces.
const CASOS: [number, number][] = [
  [3072, 2304], [1920, 1080], [3840, 2160], [1024, 1024], [2048, 2048],
  [1080, 1920], [1200, 1600], [5000, 1940], [4000, 1000], [800, 600],
]

describe('seedreamCheapSize', () => {
  it('cabe na faixa barata e no envelope do endpoint', () => {
    for (const [w, h] of CASOS) {
      const size = seedreamCheapSize(w, h)
      expect(size, `${w}x${h}`).not.toBeNull()
      const px = size!.width * size!.height
      expect(px, `${w}x${h} passou do teto`).toBeLessThanOrEqual(SEEDREAM_LOW_TIER_MAX_PIXELS)
      expect(px, `${w}x${h} abaixo do piso`).toBeGreaterThanOrEqual(SEEDREAM_MIN_PIXELS)
    }
  })

  it('preserva a proporção dentro de 2% e usa múltiplos de 16', () => {
    for (const [w, h] of CASOS) {
      const size = seedreamCheapSize(w, h)!
      const delta = Math.abs(size.width / size.height - w / h) / (w / h)
      expect(delta, `${w}x${h} torceu o aspecto`).toBeLessThanOrEqual(0.02)
      expect(size.width % 16, `${w}x${h}`).toBe(0)
      expect(size.height % 16, `${w}x${h}`).toBe(0)
    }
  })

  it('aproveita o teto (não entrega imagem pequena à toa)', () => {
    // Pelo menos 95% da área permitida — o ganho de preço não pode virar perda
    // de resolução gratuita.
    for (const [w, h] of CASOS) {
      const size = seedreamCheapSize(w, h)!
      const uso = (size.width * size.height) / SEEDREAM_LOW_TIER_MAX_PIXELS
      expect(uso, `${w}x${h} desperdiçou área`).toBeGreaterThan(0.95)
    }
  })

  it('16:9 vira exatamente 2048x1152', () => {
    expect(seedreamCheapSize(1920, 1080)).toEqual({ width: 2048, height: 1152 })
  })

  it('sem dimensões devolve null', () => {
    expect(seedreamCheapSize(null, null)).toBeNull()
    expect(seedreamCheapSize(0, 100)).toBeNull()
    expect(seedreamCheapSize(undefined, undefined)).toBeNull()
  })
})

describe('seedreamCheapTierEnabled', () => {
  it('desligado por padrão; só SEEDREAM_CHEAP_TIER=1 liga', () => {
    delete process.env.SEEDREAM_CHEAP_TIER
    expect(seedreamCheapTierEnabled()).toBe(false)
    process.env.SEEDREAM_CHEAP_TIER = '0'
    expect(seedreamCheapTierEnabled()).toBe(false)
    process.env.SEEDREAM_CHEAP_TIER = '1'
    expect(seedreamCheapTierEnabled()).toBe(true)
  })
})
