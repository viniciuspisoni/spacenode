import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { parsePlanRead } from '@/lib/apresentar/plan-reader'
import { measurePlanLineRecall } from '@/lib/apresentar/plan-line-score'

describe('plan reader validation', () => {
  it('falls back for unknown type and drops unsafe coordinates and uncertain labels', () => {
    const read = parsePlanRead(JSON.stringify({
      projectType: 'made-up',
      existingLabels: false,
      rooms: [
        { name: 'Sala', x: 0.4, y: 0.5, confidence: 0.94 },
        { name: 'Fora', x: 5, y: 0.5, confidence: 1 },
        { name: 'Sem posição', x: null, y: 0.4, confidence: 1 },
      ],
    }))
    expect(read.projectType).toBe('apartamento')
    expect(read.rooms).toEqual([{ name: 'Sala', x: 0.4, y: 0.5, confidence: 0.94 }])
  })
})

describe('plan line diagnostic', () => {
  const wall = (top: number) => sharp({
    create: { width: 400, height: 300, channels: 3, background: 'white' },
  }).composite([{ input: Buffer.from(`<svg width="400" height="300"><path d="M20 ${top} H380" stroke="black" stroke-width="3"/></svg>`) }]).png().toBuffer()

  it('recalls a preserved wall and detects a shifted one', async () => {
    const source = await wall(100)
    const same = await measurePlanLineRecall(source, source)
    const shifted = await measurePlanLineRecall(source, await wall(150))
    expect(same.structuralPixels).toBeGreaterThan(100)
    expect(same.recall).toBeGreaterThan(0.95)
    expect(shifted.recall).toBeLessThan(same.recall - 0.5)
  })
})
