// tests/fidelity/aspect-ratio.test.ts
//
// Pino de aspect ratio da geração (lib/ai/aspect-ratio): só pina quando o
// original bate (≤2%) com um valor suportado pelos dois caminhos (FAL +
// Vertex); fora disso devolve null — pinar um formato diferente do input
// forçaria crop/letterbox, drift pior que o default do motor.

import { describe, it, expect } from 'vitest'
import { nearestSupportedAspectRatio } from '@/lib/ai/aspect-ratio'

describe('nearestSupportedAspectRatio', () => {
  it('formatos exatos comuns de export (SketchUp/Enscape/print)', () => {
    expect(nearestSupportedAspectRatio(1920, 1080)).toBe('16:9')
    expect(nearestSupportedAspectRatio(4000, 3000)).toBe('4:3')
    expect(nearestSupportedAspectRatio(3000, 2000)).toBe('3:2')
    expect(nearestSupportedAspectRatio(2048, 2048)).toBe('1:1')
  })

  it('retrato espelha o paisagem', () => {
    expect(nearestSupportedAspectRatio(1080, 1920)).toBe('9:16')
    expect(nearestSupportedAspectRatio(2000, 3000)).toBe('2:3')
  })

  it('dentro da tolerância de 2% ainda pina', () => {
    // 1900/1080 = 1.759 vs 16:9 = 1.778 → delta ~1.05%
    expect(nearestSupportedAspectRatio(1900, 1080)).toBe('16:9')
  })

  it('fora da tolerância devolve null (nunca força formato)', () => {
    // 1000/690 = 1.449 — a 3.4% do 3:2 e a 8.7% do 4:3
    expect(nearestSupportedAspectRatio(1000, 690)).toBeNull()
  })

  it('dimensões ausentes/inválidas devolvem null', () => {
    expect(nearestSupportedAspectRatio(null, 500)).toBeNull()
    expect(nearestSupportedAspectRatio(500, undefined)).toBeNull()
    expect(nearestSupportedAspectRatio(0, 0)).toBeNull()
  })
})
