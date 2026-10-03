// tests/fidelity/native-edge.test.ts — validação do edge map nativo do plugin.
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { validateNativeEdgeMap, minPool, NATIVE_EDGE_MAX_EDGE_PX } from '@/lib/ai/fidelity/native-edge'

async function lineart(width: number, height: number, every = 32, offset = 0): Promise<Buffer> {
  // Branco com linhas pretas de 1 px a cada `every` px (deslocadas em `offset`).
  const raw = Buffer.alloc(width * height, 255)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((x + offset) % every === 0 || (y + offset) % every === 0) raw[y * width + x] = 0
    }
  }
  return sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer()
}

async function blackFraction(png: Buffer): Promise<number> {
  const grey = await sharp(png).greyscale().raw().toBuffer()
  let black = 0
  for (let i = 0; i < grey.length; i++) if (grey[i] === 0) black++
  return black / grey.length
}

describe('minPool', () => {
  it('mantém o pixel mais escuro do bloco (a linha de 1 px não some)', () => {
    const w = 8
    const h = 4
    const grey = Buffer.alloc(w * h, 255)
    grey[0 * w + 3] = 0 // linha vertical fina em x=3
    grey[2 * w + 3] = 0
    const out = minPool(grey, w, h, 2)
    expect(out.width).toBe(4)
    expect(out.height).toBe(2)
    expect(out.data[0 * 4 + 1]).toBe(0)
    expect(out.data[1 * 4 + 1]).toBe(0)
    expect(out.data[0]).toBe(255)
  })
})

describe('validateNativeEdgeMap', () => {
  it('aceita lineart com o aspecto do source e mantém o tamanho até 2048 px', async () => {
    const png = await lineart(1600, 900)
    const r = await validateNativeEdgeMap(png, { width: 3200, height: 1800 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const meta = await sharp(r.png).metadata()
      expect(meta.width).toBe(1600)
      expect(meta.format).toBe('png')
    }
  })

  it('linhas de 1 px fora da grade de amostragem contam como tinta (4096 px, deslocadas)', async () => {
    // Com reamostragem por 'nearest' este mapa daria 0 % de tinta e seria
    // rejeitado como vazio; com mínimo de bloco a tinta aparece.
    const png = await lineart(4096, 2304, 97, 5)
    const r = await validateNativeEdgeMap(png, { width: 4096, height: 2304 })
    expect(r.ok).toBe(true)
  })

  it('reduz a 2048 px no lado maior mantendo a linha PRETA', async () => {
    const png = await lineart(4096, 2304, 64, 1)
    const r = await validateNativeEdgeMap(png, { width: 4096, height: 2304 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const meta = await sharp(r.png).metadata()
      expect(meta.width).toBe(NATIVE_EDGE_MAX_EDGE_PX)
      expect(meta.height).toBe(1152)
      const before = await blackFraction(png)
      const after = await blackFraction(r.png)
      // Cada linha de 1 px vira 1 px na metade da largura: a fração de preto
      // dobra; o que importa é que não cai (nearest zerava).
      expect(after).toBeGreaterThan(before)
    }
  })

  it('rejeita mapa branco (estilo sem arestas)', async () => {
    const png = await sharp(Buffer.alloc(800 * 450, 255), { raw: { width: 800, height: 450, channels: 1 } }).png().toBuffer()
    const r = await validateNativeEdgeMap(png, { width: 800, height: 450 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/sem tinta/)
  })

  it('rejeita aspecto diferente do source (mapa de outra captura)', async () => {
    const png = await lineart(800, 600)
    const r = await validateNativeEdgeMap(png, { width: 1600, height: 900 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/aspecto/)
  })

  it('rejeita imagem com meio-tom em massa (uma foto/captura texturizada no lugar do mapa)', async () => {
    const width = 640
    const height = 360
    const raw = Buffer.alloc(width * height)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw[y * width + x] = 100 + ((x + y) % 60)
    const png = await sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer()
    const r = await validateNativeEdgeMap(png, { width, height })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/lineart|tinta/)
  })

  it('rejeita linha branca sobre fundo escuro (estilo de fundo preto sem o passe neutralizado)', async () => {
    const width = 640
    const height = 360
    const raw = Buffer.alloc(width * height, 20)
    for (let y = 0; y < height; y += 40) for (let x = 0; x < width; x++) raw[y * width + x] = 255
    const png = await sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer()
    const r = await validateNativeEdgeMap(png, { width, height })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/escuro demais/)
  })

  it('sem source conhecido só confere o conteúdo', async () => {
    const r = await validateNativeEdgeMap(await lineart(400, 300), null)
    expect(r.ok).toBe(true)
  })
})
