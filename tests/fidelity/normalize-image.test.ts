// tests/fidelity/normalize-image.test.ts
//
// Normalização de input dos pipelines (lib/storage/normalize-image):
// regra de ouro = pass-through byte-idêntico quando nada é necessário;
// rotação EXIF, teto de dimensão (Lanczos) e preservação de formato PNG.

import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { normalizeSourceImage } from '@/lib/storage/normalize-image'

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 130, b: 140 } } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

describe('normalizeSourceImage', () => {
  it('sRGB dentro dos tetos passa byte-idêntico (zero perda geracional)', async () => {
    const input = await jpeg(1600, 1200)
    const out = await normalizeSourceImage(input)
    expect(out.transforms).toEqual([])
    expect(out.buffer.equals(input)).toBe(true)
    expect(out.mime).toBe('image/jpeg')
    expect(out.width).toBe(1600)
    expect(out.height).toBe(1200)
  })

  it('acima do teto de dimensão reduz pro lado maior = maxLongSide', async () => {
    const input = await jpeg(6000, 4000)
    const out = await normalizeSourceImage(input, { maxLongSide: 4096 })
    expect(out.transforms).toContain('resize')
    expect(Math.max(out.width ?? 0, out.height ?? 0)).toBe(4096)
    // Proporção preservada (fit inside)
    expect(Math.abs((out.width ?? 0) / (out.height ?? 1) - 1.5)).toBeLessThan(0.01)
  })

  it('maxLongSide null nunca redimensiona (caminho do Editar)', async () => {
    const input = await jpeg(6000, 4000)
    const out = await normalizeSourceImage(input, {
      maxLongSide: null,
      maxBytes: Number.MAX_SAFE_INTEGER,
    })
    expect(out.transforms).toEqual([])
    expect(out.buffer.equals(input)).toBe(true)
  })

  it('PNG continua PNG (lossless) quando precisa transformar', async () => {
    const png = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: { r: 10, g: 200, b: 30 } } })
      .png()
      .toBuffer()
    const out = await normalizeSourceImage(png, { maxLongSide: 2048 })
    expect(out.mime).toBe('image/png')
    expect(out.width).toBe(2048)
  })

  it('rotação EXIF é aplicada (orientation 6 → dims trocadas)', async () => {
    const input = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 50, g: 60, b: 70 } } })
      .jpeg({ quality: 90 })
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const out = await normalizeSourceImage(input)
    expect(out.transforms).toContain('exif-rotate')
    // orientation 6 = 90° — largura e altura se invertem no pixel-space final
    expect(out.width).toBe(600)
    expect(out.height).toBe(800)
  })

  it('buffer não-imagem lança (caller converte em 400)', async () => {
    await expect(normalizeSourceImage(Buffer.from('not an image'))).rejects.toThrow()
  })
})
