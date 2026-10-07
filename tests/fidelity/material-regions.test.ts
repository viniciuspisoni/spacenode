import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { buildMaterialRegionSheet } from '@/lib/ai/fidelity/material-regions'
import { buildMaterialRegionSheetBlock, normalizeMaterialInventory, normalizeMaterialRegion } from '@/lib/ai/material-inventory'

describe('original material region evidence', () => {
  it('discards invalid, reversed, tiny or nonnumeric bounds rather than inventing a region', () => {
    for (const value of [null, [0, 0, 1], [-1, 0, 1, 1], [0, 0, 2, 1], [0, 0, NaN, 1], [1, 0, 0, 1], [0, 0, .01, 1], ['0', 0, 1, 1]]) {
      expect(normalizeMaterialRegion(value)).toBeUndefined()
    }
    expect(normalizeMaterialRegion([.1, .2, .8, .9])).toEqual([.1, .2, .8, .9])
    expect(normalizeMaterialInventory([{ surface: 'floor', appearance: 'gray', region: [0, 0, 2, 1] }])[0]).not.toHaveProperty('region')
  })
  it('crops the correct original pixels, keeps ordering and never manufactures a swatch', async () => {
    const left = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#ff0000' } }).png().toBuffer()
    const right = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#0000ff' } }).png().toBuffer()
    const original = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#000000' } })
      .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 100, top: 0 }]).png().toBuffer()
    const sheet = await buildMaterialRegionSheet(original, [
      { surface: 'cabinet', appearance: 'red', region: [0, 0, .5, 1] },
      { surface: 'floor', appearance: 'blue', region: [.5, 0, 1, 1] },
    ])
    expect(sheet?.surfaces).toEqual(['cabinet', 'floor'])
    expect(await sharp(sheet!.png).metadata()).toMatchObject({ width: 512, height: 768 })
    const pixel = (top: number) => sharp(sheet!.png).extract({ left: 256, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer()
    expect([...await pixel(200)]).toEqual([255, 0, 0])
    expect([...await pixel(584)]).toEqual([0, 0, 255])
  })
  it('does not generate crops from missing coordinates and bounds the added reference count', async () => {
    const original = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#888888' } }).png().toBuffer()
    expect(await buildMaterialRegionSheet(original, [{ surface: 'floor', appearance: 'gray' }])).toBeNull()
    const sheet = await buildMaterialRegionSheet(original, Array(12).fill({ surface: 'floor', appearance: 'gray', region: [0, 0, 1, 1] }))
    expect(sheet?.surfaces).toHaveLength(4)
  })
  it('keeps crop evidence separate from geometry and requested material choices', () => {
    expect(buildMaterialRegionSheetBlock()).toBe('')
    const block = buildMaterialRegionSheetBlock(3, ['cabinet', 'floor'])
    expect(block).toContain('image #3')
    expect(block).toContain('1="cabinet"; 2="floor"')
    expect(block).toContain('not this sheet')
    expect(block).toContain('Do not tile the crop')
  })
})
