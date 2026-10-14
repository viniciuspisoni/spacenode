import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { renderFrame, renderFrameCrop, aspectDrift } from '@/lib/ai/render-frame'
import { falParamsForEngine } from '@/lib/ai/engine-params'

describe('render canvas preservation', () => {
  it('frames the Muda source without resizing and removes only the added pixels', async () => {
    const frame = renderFrame(823, 1600)
    expect(frame.aspectRatio).toBe('9:16')
    expect(frame.canvasWidth).toBe(900)
    expect(frame.canvasHeight).toBe(1600)
    const source = await sharp({ create: { width: 823, height: 1600, channels: 3, background: '#f02080' } }).png().toBuffer()
    const canvas = await sharp(source).extend({ left: frame.left, right: frame.right, top: frame.top, bottom: frame.bottom, background: '#808080' }).png().toBuffer()
    const restored = await sharp(canvas).extract(renderFrameCrop(frame, 900, 1600)).raw().toBuffer()
    expect(restored.equals(await sharp(source).raw().toBuffer())).toBe(true)
    const crop = renderFrameCrop(frame, 1152, 2048)
    expect(aspectDrift(823, 1600, crop.width, crop.height)).toBeLessThan(0.001)
  })

  it.each([[1600, 823], [1000, 690], [1920, 1080], [2048, 2048], [600, 2400]])('preserves %i × %i through its temporary canvas', (width, height) => {
    const frame = renderFrame(width, height)
    expect(frame.canvasWidth).toBeGreaterThanOrEqual(width)
    expect(frame.canvasHeight).toBeGreaterThanOrEqual(height)
    expect(renderFrameCrop(frame, frame.canvasWidth, frame.canvasHeight)).toEqual({ left: frame.left, top: frame.top, width, height })
  })

  it('rejects the reported square result and invalid dimensions', () => {
    expect(() => renderFrameCrop(renderFrame(823, 1600), 1536, 1512)).toThrow()
    expect(() => renderFrame(0, 1600)).toThrow()
    expect(() => renderFrame(NaN, 1600)).toThrow()
    expect(aspectDrift(823, 1600, 1536, 1512)).toBeGreaterThan(0.9)
  })

  it('pins Quasar to source dimensions in either price tier', () => {
    const previous = process.env.SEEDREAM_CHEAP_TIER
    try {
      for (const tier of ['0', '1']) {
        process.env.SEEDREAM_CHEAP_TIER = tier
        const size = falParamsForEngine('quasar', '2k', null, { width: 823, height: 1600 }).image_size as { width: number; height: number }
        expect(aspectDrift(823, 1600, size.width, size.height)).toBeLessThan(0.02)
        expect(size.width * size.height).toBeLessThanOrEqual((tier === '1' ? 1536 : 2048) ** 2)
        expect(size.width * size.height).toBeGreaterThanOrEqual(1024 ** 2)
      }
    } finally {
      if (previous === undefined) delete process.env.SEEDREAM_CHEAP_TIER
      else process.env.SEEDREAM_CHEAP_TIER = previous
    }
  })
})
