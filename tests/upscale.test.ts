// tests/upscale.test.ts
//
// O módulo Ampliar não tinha teste nenhum — e era onde moravam dois erros que
// só apareciam em produção, contra dinheiro do usuário: 8× cobrava 5× a base e
// entregava 4×, e o Topaz rodava com `face_enhancement` ligado (default do
// FAL) num módulo cujo contrato é não inventar elemento.
//
// Estes testes fixam o contrato: o que se cobra é o que se entrega, e os
// parâmetros de preservação vão explícitos no payload.

import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  computeUpscaleCost,
  effectiveFactor,
  isScaleClamped,
  maxScaleForDimensions,
  projectedDimensions,
  resolveScale,
  scaleExceedsCap,
  analyzeImage,
  MAX_OUTPUT_MP,
  MAX_UPSCALE_FACTOR,
  OBJECTIVE_PRESETS,
  type Scale,
} from '@/lib/upscale'

// ── Teto de escala ───────────────────────────────────────────────────────────

describe('teto de escala', () => {
  it('nenhum fator efetivo passa do máximo do schema do FAL', () => {
    const scales: Scale[] = ['none', '2x', '4x', '8x', 'ultra']
    for (const s of scales) {
      expect(effectiveFactor(s)).toBeLessThanOrEqual(MAX_UPSCALE_FACTOR)
    }
  })

  it('marca como clampada só a escala que o motor não entrega', () => {
    expect(isScaleClamped('2x')).toBe(false)
    expect(isScaleClamped('4x')).toBe(false)
    expect(isScaleClamped('8x')).toBe(true)
    expect(isScaleClamped('ultra')).toBe(true)
  })
})

// ── Custo ────────────────────────────────────────────────────────────────────

describe('custo: cobra o que entrega', () => {
  const base = { tab: 'resolution', modeId: 'fidelity', megapixels: 2 } as const

  it('8× custa o mesmo que 4×, porque entrega o mesmo que 4×', () => {
    const at4 = computeUpscaleCost({ ...base, scale: '4x' }).total
    const at8 = computeUpscaleCost({ ...base, scale: '8x' }).total
    expect(at8).toBe(at4)
  })

  it('regressão: 8× não volta a cobrar o múltiplo antigo (5× a base)', () => {
    const cost = computeUpscaleCost({ ...base, scale: '8x' }).total
    // A base da Alta Fidelidade é 10; o bug cobrava 50 + surcharge.
    expect(cost).toBeLessThan(50)
  })

  it('4× custa mais que 2×', () => {
    expect(computeUpscaleCost({ ...base, scale: '4x' }).total)
      .toBeGreaterThan(computeUpscaleCost({ ...base, scale: '2x' }).total)
  })

  it('escala "none" não paga multiplicador de escala', () => {
    const c = computeUpscaleCost({ tab: 'enhance', modeId: 'denoise', scale: 'none', megapixels: 2 })
    expect(c.scaleFactor).toBe(1)
  })

  it('imagem maior custa mais na mesma escala', () => {
    const pequena = computeUpscaleCost({ ...base, scale: '2x', megapixels: 2 }).total
    const grande  = computeUpscaleCost({ ...base, scale: '2x', megapixels: 20 }).total
    expect(grande).toBeGreaterThan(pequena)
  })
})

// ── Escala derivada da imagem ────────────────────────────────────────────────

describe('escala derivada do objetivo + imagem', () => {
  it('não gasta 4× quando 2× já alcança o alvo do objetivo', () => {
    // 4000px de borda longa: 2× já passa dos 6000px que "print" pede.
    expect(resolveScale('print', { width: 4000, height: 2250 })).toBe('2x')
  })

  it('usa 4× quando a imagem é pequena demais para o alvo', () => {
    expect(resolveScale('print', { width: 1200, height: 675 })).toBe('4x')
  })

  it('sem dimensões, cai no preset do objetivo', () => {
    for (const id of Object.keys(OBJECTIVE_PRESETS) as (keyof typeof OBJECTIVE_PRESETS)[]) {
      expect(resolveScale(id, null)).toBe(OBJECTIVE_PRESETS[id].scale)
    }
  })

  it('nunca escolhe uma escala que estoura o teto quando existe alguma que cabe', () => {
    // 6000×4000 = 24 MP: 2× cabe (96 MP), 4× não (384 MP).
    const dims = { width: 6000, height: 4000 }
    const s = resolveScale('final', dims)
    expect(scaleExceedsCap(s, dims)).toBe(false)
  })

  it('quando NENHUMA escala cabe, avisa em vez de sugerir uma que também estoura', () => {
    // 9000×9000 = 81 MP. Já em 2× daria 324 MP, acima de MAX_OUTPUT_MP.
    const dims = { width: 9000, height: 9000 }
    expect(maxScaleForDimensions(dims)).toBeNull()
  })
})

describe('teto de megapixels do output', () => {
  it('maxScaleForDimensions respeita MAX_OUTPUT_MP', () => {
    const dims = { width: 6000, height: 4000 }   // 24 MP
    const s = maxScaleForDimensions(dims)
    expect(s).not.toBeNull()
    const out = projectedDimensions(dims, s!)
    expect((out.width * out.height) / 1e6).toBeLessThanOrEqual(MAX_OUTPUT_MP)
  })

  it('imagem pequena libera a escala cheia', () => {
    expect(maxScaleForDimensions({ width: 1200, height: 800 })).toBe('4x')
  })

  it('projeta pelo fator EFETIVO — um 8× projeta 4×', () => {
    const dims = { width: 1000, height: 500 }
    expect(projectedDimensions(dims, '8x')).toEqual(projectedDimensions(dims, '4x'))
  })
})

// ── Análise da imagem ────────────────────────────────────────────────────────

describe('análise da imagem', () => {
  it('detecta compressão pesada pela densidade de bytes, não pelo nome', () => {
    // 1920×1080 em 60 KB = 0,029 B/px — um print de WhatsApp.
    const r = analyzeImage({ fileName: 'render-final.jpg', fileSize: 60 * 1024, width: 1920, height: 1080 })
    expect(r.objectiveId).toBe('recover')
    expect(r.reason).not.toBe('')
  })

  it('não inventa observação sobre um render bem exportado', () => {
    const r = analyzeImage({ fileName: 'casa-antiga-fachada.jpg', fileSize: 3_500_000, width: 2400, height: 1350 })
    expect(r.objectiveId).toBeNull()
    expect(r.reason).toBe('')
  })

  it('sugere Recuperar para imagem pequena', () => {
    const r = analyzeImage({ fileName: 'vista.png', fileSize: 400_000, width: 800, height: 600 })
    expect(r.objectiveId).toBe('recover')
  })

  it('sem dimensões, não palpita', () => {
    const r = analyzeImage({ fileName: 'x.jpg', fileSize: 100 })
    expect(r.objectiveId).toBeNull()
    expect(r.reason).toBe('')
  })
})

// ── Parâmetros de preservação enviados ao provider ───────────────────────────

const subscribe = vi.fn()
vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: (...args: unknown[]) => subscribe(...args),
  },
}))

describe('payload do Topaz: contrato de preservação', () => {
  beforeEach(() => {
    subscribe.mockReset()
    subscribe.mockResolvedValue({ data: { image: { url: 'https://v3.fal.media/out.png' } }, requestId: 'req-1' })
  })

  async function call(input: Parameters<typeof import('@/lib/upscale/providers/topaz').callTopaz>[0]) {
    const { callTopaz } = await import('@/lib/upscale/providers/topaz')
    await callTopaz(input)
    return subscribe.mock.calls[0][1].input as Record<string, unknown>
  }

  it('desliga o realce de rosto (default do FAL é ligado, força 0.8)', async () => {
    const sent = await call({ imageUrl: 'https://v3.fal.media/in.png', scale: 2 })
    expect(sent.face_enhancement).toBe(false)
  })

  it('proíbe recorte — composição e proporções são contrato', async () => {
    const sent = await call({ imageUrl: 'https://v3.fal.media/in.png', scale: 2 })
    expect(sent.crop_to_fill).toBe(false)
  })

  it('usa o modelo preservador de detalhe, não o default generativo', async () => {
    const sent = await call({ imageUrl: 'https://v3.fal.media/in.png', scale: 2 })
    expect(sent.model).toBe('High Fidelity V2')
  })

  it('sai em PNG — o default jpeg recomprime o detalhe recém-comprado', async () => {
    const sent = await call({ imageUrl: 'https://v3.fal.media/in.png', scale: 2, params: { outputMegapixels: 30 } })
    expect(sent.output_format).toBe('png')
  })

  it('cai para jpeg só quando o PNG ficaria grande demais para entregar', async () => {
    const sent = await call({ imageUrl: 'https://v3.fal.media/in.png', scale: 4, params: { outputMegapixels: 200 } })
    expect(sent.output_format).toBe('jpeg')
  })

  it('clampa o fator no máximo do schema em vez de derrubar o request', async () => {
    const sent = await call({ imageUrl: 'https://v3.fal.media/in.png', scale: 8 })
    expect(sent.upscale_factor).toBe(MAX_UPSCALE_FACTOR)
  })

  it('não vaza sinal interno de roteamento para o payload do FAL', async () => {
    const sent = await call({ imageUrl: 'https://v3.fal.media/in.png', scale: 2, params: { outputMegapixels: 12 } })
    expect(sent).not.toHaveProperty('outputMegapixels')
  })

  it('aceita override por modo (fix_compression do Recuperar)', async () => {
    const sent = await call({
      imageUrl: 'https://v3.fal.media/in.png', scale: 2,
      params: { fix_compression: 0.6, outputMegapixels: 8 },
    })
    expect(sent.fix_compression).toBe(0.6)
  })
})

// ── Normalização da origem (server-only, sharp) ──────────────────────────────

describe('normalização da origem', () => {
  it('deixa passar intacta a imagem que já está correta', async () => {
    const { normalizeSource } = await import('@/lib/upscale/normalize-source')
    const sharp = (await import('sharp')).default
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c0392b' } }).png().toBuffer()

    const r = await normalizeSource(png, 'image/png')
    expect(r.note).toBeNull()
    expect(r.buffer).toBe(png)          // mesmo buffer: nenhuma recompressão
    expect(r.width).toBe(40)
    expect(r.height).toBe(30)
  })

  it('aplica a orientação EXIF — senão o resultado volta girado', async () => {
    const { normalizeSource } = await import('@/lib/upscale/normalize-source')
    const sharp = (await import('sharp')).default
    // orientation 6 = girar 90°: 40×30 deve virar 30×40.
    const deitada = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#2c3e50' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer()

    const r = await normalizeSource(deitada, 'image/jpeg')
    expect(r.note).toBe('orientation')
    expect(r.width).toBe(30)
    expect(r.height).toBe(40)
    expect(r.mime).toBe('image/png')    // re-encoda sem perda
  })

  it('NÃO mexe no perfil de cor — o provider preserva o ICC ponta a ponta', async () => {
    const { normalizeSource } = await import('@/lib/upscale/normalize-source')
    const sharp = (await import('sharp')).default
    // Display P3: o caso que a primeira versão tentava converter. Medido pelo
    // pipeline real, o Topaz devolve o MESMO perfil — converter aqui só
    // recortaria o gamut de graça (MEDICOES.md §7).
    const p3 = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 24, g: 190, b: 86 } } })
      .withMetadata({ icc: 'p3' }).png().toBuffer()

    const r = await normalizeSource(p3, 'image/png')
    expect(r.note).toBeNull()
    expect(r.buffer).toBe(p3)          // passa intacta: nem re-encode, nem conversão
  })
})
