// Orçamento V2: deadline determinística e limites de referência.

import { describe, expect, it } from 'vitest'
import { V2_LIMITS, startDeadline } from '@/lib/nodi/v2/budget'

describe('startDeadline', () => {
  it('conta o tempo com relógio injetado', () => {
    let now = 1000
    const deadline = startDeadline(500, () => now)
    expect(deadline.expired()).toBe(false)
    expect(deadline.remaining()).toBe(500)
    now = 1400
    expect(deadline.remaining()).toBe(100)
    now = 1600
    expect(deadline.expired()).toBe(true)
    expect(deadline.remaining()).toBe(0)
  })
})

describe('limites de referência', () => {
  it('valores que o resto do código assume', () => {
    expect(V2_LIMITS.maxSteps).toBeGreaterThanOrEqual(3)
    expect(V2_LIMITS.maxVisionCalls).toBeLessThanOrEqual(4)   // multimodal é caro
    expect(V2_LIMITS.perDay).toBeGreaterThan(0)
    expect(V2_LIMITS.deadlineMs).toBeLessThanOrEqual(60_000)  // função serverless
  })
})
