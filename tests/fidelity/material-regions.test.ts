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
      { surface: 'cabinet', appearance: 'red', certainty: 'visible', region: [0, 0, .5, .5] },
      { surface: 'floor', appearance: 'blue', certainty: 'visible', region: [.5, 0, 1, .5] },
    ])
    expect(sheet?.surfaces).toEqual(['original region [0,0,0.5,0.5]', 'original region [0.5,0,1,0.5]'])
    expect(await sharp(sheet!.png).metadata()).toMatchObject({ width: 512, height: 768 })
    const pixel = (top: number) => sharp(sheet!.png).extract({ left: 256, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer()
    expect([...await pixel(200)]).toEqual([255, 0, 0])
    expect([...await pixel(584)]).toEqual([0, 0, 255])
  })
  it('does not generate crops from missing coordinates and bounds the added reference count', async () => {
    const original = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#888888' } }).png().toBuffer()
    expect(await buildMaterialRegionSheet(original, [{ surface: 'floor', appearance: 'gray' }])).toBeNull()
    const sheet = await buildMaterialRegionSheet(original, Array.from({ length: 12 }, (_, i) => ({
      surface: 'floor', appearance: 'gray', certainty: 'visible', region: [i / 100, 0, .5 + i / 100, .5],
    })))
    expect(sheet?.surfaces).toHaveLength(4)
  })
  it('keeps crop evidence separate from geometry and requested material choices', () => {
    expect(buildMaterialRegionSheetBlock()).toBe('')
    const block = buildMaterialRegionSheetBlock(3, ['cabinet', 'floor'])
    expect(block).toContain('image #3')
    expect(block).toContain('1="cabinet"; 2="floor"')
    expect(block).toContain('not this sheet')
    expect(block).toContain('Do not tile the crop')
    expect(block).toContain('do not spread a pattern from one object to another')
  })

  async function quadrantOriginal() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00']
    const layers = await Promise.all(colors.map(async (background, i) => ({
      input: await sharp({ create: { width: 64, height: 64, channels: 3, background } }).png().toBuffer(),
      left: i % 2 * 64, top: Math.floor(i / 2) * 64,
    })))
    return sharp({ create: { width: 128, height: 128, channels: 3, background: '#000000' } }).composite(layers).png().toBuffer()
  }

  const rowColor = (png: Buffer, row: number) => sharp(png).extract({ left: 256, top: row * 384 + 208, width: 1, height: 1 }).removeAlpha().raw().toBuffer()

  it('provides correctly ordered original pixels without vision or material species guesses on explicit correction', async () => {
    const sheet = await buildMaterialRegionSheet(await quadrantOriginal(), undefined, { allowSourceGrid: true })
    expect(sheet?.source).toBe('original_grid')
    expect(sheet?.surfaces).toEqual([
      'original top-left quadrant [0,0,0.5,0.5]', 'original top-right quadrant [0.5,0,1,0.5]',
      'original bottom-left quadrant [0,0.5,0.5,1]', 'original bottom-right quadrant [0.5,0.5,1,1]',
    ])
    expect(await sharp(sheet!.png).metadata()).toMatchObject({ width: 512, height: 1536 })
    expect([...await rowColor(sheet!.png, 0)]).toEqual([255, 0, 0])
    expect([...await rowColor(sheet!.png, 1)]).toEqual([0, 255, 0])
    expect([...await rowColor(sheet!.png, 2)]).toEqual([0, 0, 255])
    expect([...await rowColor(sheet!.png, 3)]).toEqual([255, 255, 0])
  })

  it.each([undefined, [], [{ surface: 'floor', appearance: 'gray' }], [{ surface: 'floor', appearance: 'gray', region: [1, 1, 0, 0] }]])('grid fallback is opt-in for missing coordinates %j', async raw => {
    const original = await quadrantOriginal()
    expect(await buildMaterialRegionSheet(original, raw)).toBeNull()
    expect((await buildMaterialRegionSheet(original, raw, { allowSourceGrid: true }))?.source).toBe('original_grid')
  })

  it('prefers valid surface coordinates over the fallback and adds no extra image', async () => {
    const sheet = await buildMaterialRegionSheet(await quadrantOriginal(), [
      { surface: 'specified surface', appearance: 'blue', certainty: 'visible', region: [0, .5, .5, 1] },
    ], { allowSourceGrid: true })
    expect(sheet?.source).toBe('inventory')
    expect(sheet?.surfaces).toEqual(['original region [0,0.5,0.5,1]'])
    expect([...await rowColor(sheet!.png, 0)]).toEqual([0, 0, 255])
  })

  it('rejects mixed half-image and ambiguous crops without pretending to identify a material', async () => {
    const raw = [
      { surface: 'floor', appearance: 'gray', certainty: 'visible', region: [0, .5, 1, 1] },
      { surface: 'wall', appearance: 'gray', certainty: 'visible', region: [0, 0, 1, .5] },
      { surface: 'wood guess', appearance: 'brown', certainty: 'ambiguous', region: [0, 0, .2, .2] },
    ]
    expect(await buildMaterialRegionSheet(await quadrantOriginal(), raw)).toBeNull()
    expect((await buildMaterialRegionSheet(await quadrantOriginal(), raw, { allowSourceGrid: true }))?.source).toBe('original_grid')
  })

  it('keeps valid pixels without transmitting a mistaken model surface identity', async () => {
    const sheet = await buildMaterialRegionSheet(await quadrantOriginal(), [
      { surface: 'incorrect wood floor', appearance: 'brown', certainty: 'visible', region: [.5, 0, 1, .5] },
    ], { allowSourceGrid: true })
    expect(sheet?.surfaces).toEqual(['original region [0.5,0,1,0.5]'])
    expect([...await rowColor(sheet!.png, 0)]).toEqual([0, 255, 0])
    const block = buildMaterialRegionSheetBlock(2, sheet!.surfaces)
    expect(block).not.toContain('incorrect wood floor')
    expect(block).toContain('not verified surface identities')
  })

  it('deduplicates identical areas before applying the four-crop limit', async () => {
    const raw = Array(6).fill({ surface: 'same pixels', appearance: 'red', certainty: 'visible', region: [0, 0, .5, .5] })
    raw.push({ surface: 'different pixels', appearance: 'green', certainty: 'visible', region: [.5, 0, 1, .5] })
    const sheet = await buildMaterialRegionSheet(await quadrantOriginal(), raw)
    expect(sheet?.surfaces).toEqual(['original region [0,0,0.5,0.5]', 'original region [0.5,0,1,0.5]'])
    expect([...await rowColor(sheet!.png, 1)]).toEqual([0, 255, 0])
  })

  it('uses displayed coordinates after EXIF rotation, not the unrotated image quadrants', async () => {
    const original = await sharp(await quadrantOriginal()).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).withMetadata({ orientation: 6 }).toBuffer()
    const sheet = await buildMaterialRegionSheet(original, [], { allowSourceGrid: true })
    const expected = [[0, 0, 255], [255, 0, 0], [255, 255, 0], [0, 255, 0]]
    for (let row = 0; row < 4; row++) {
      const actual = [...await rowColor(sheet!.png, row)]
      actual.forEach((channel, i) => expect(Math.abs(channel - expected[row][i])).toBeLessThanOrEqual(2))
    }
  })

  it('does not upscale unusable one-pixel regions into fabricated evidence', async () => {
    const original = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#888888' } }).png().toBuffer()
    expect(await buildMaterialRegionSheet(original, [], { allowSourceGrid: true })).toBeNull()
    expect(await buildMaterialRegionSheet(original, [
      { surface: 'tiny', appearance: 'gray', certainty: 'visible', region: [0, 0, .5, .5] },
    ], { allowSourceGrid: true })).toBeNull()
  })

  it('does not let four unusable pixel samples hide a later usable sample', async () => {
    const original = await sharp(await quadrantOriginal()).resize(20, 20, { kernel: 'nearest' }).png().toBuffer()
    const raw = Array.from({ length: 4 }, (_, i) => ({
      surface: 'too small', appearance: 'red', certainty: 'visible', region: [i / 20, 0, i / 20 + .025, .025],
    }))
    raw.push({ surface: 'usable', appearance: 'green', certainty: 'visible', region: [.5, 0, 1, .5] })
    const sheet = await buildMaterialRegionSheet(original, raw)
    expect(sheet?.source).toBe('inventory')
    expect(sheet?.surfaces).toEqual(['original region [0.5,0,1,0.5]'])
    expect([...await rowColor(sheet!.png, 0)]).toEqual([0, 255, 0])
  })

  it('falls back to spatial pixels when normalized samples are valid but too small after rasterization', async () => {
    const original = await sharp(await quadrantOriginal()).resize(20, 20, { kernel: 'nearest' }).png().toBuffer()
    const raw = [{ surface: 'tiny', appearance: 'red', certainty: 'visible', region: [0, 0, .025, .025] }]
    expect(await buildMaterialRegionSheet(original, raw)).toBeNull()
    const sheet = await buildMaterialRegionSheet(original, raw, { allowSourceGrid: true })
    expect(sheet?.source).toBe('original_grid')
    expect(sheet?.surfaces).toHaveLength(4)
    for (const [row, color] of [[0, [255, 0, 0]], [1, [0, 255, 0]], [2, [0, 0, 255]], [3, [255, 255, 0]]] as const) {
      expect([...await rowColor(sheet!.png, row)]).toEqual(color)
    }
  })
})
