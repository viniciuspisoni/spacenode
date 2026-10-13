// Trava o escopo da faixa barata do Seedream.
//
// `SEEDREAM_CHEAP_TIER` é GLOBAL e o Quasar é o motor PADRÃO do Renderizar:
// ligar a env para fechar a margem da Planta Humanizada encolheria toda imagem
// do Renderizar de ~4,2 MP para ~2,36 MP. Por isso a Planta Humanizada pede a
// faixa barata por argumento (`forceCheapTier`), e o resto do produto não muda.

import { afterEach, describe, expect, it } from 'vitest'
import { falParamsForEngine } from '@/lib/ai/engine-params'
import { SEEDREAM_LOW_TIER_MAX_PIXELS } from '@/lib/ai/seedream-size'

const SOURCE = { width: 3000, height: 2000 }

afterEach(() => {
  delete process.env.SEEDREAM_CHEAP_TIER
})

describe('falParamsForEngine · faixa barata do Quasar', () => {
  it('sem a env e sem forceCheapTier, mantém auto_2K (comportamento do Renderizar)', () => {
    const params = falParamsForEngine('quasar', '2k', null, SOURCE)
    expect(params.image_size).toBe('auto_2K')
  })

  it('com forceCheapTier, pede WxH dentro do teto da faixa barata', () => {
    const params = falParamsForEngine('quasar', '2k', null, SOURCE, { forceCheapTier: true })
    const size = params.image_size as { width: number; height: number }
    expect(typeof size).toBe('object')
    expect(size.width * size.height).toBeLessThanOrEqual(SEEDREAM_LOW_TIER_MAX_PIXELS)
    // Mantém o aspecto do original (3:2), dentro do arredondamento de 16 px.
    expect(size.width / size.height).toBeCloseTo(SOURCE.width / SOURCE.height, 1)
  })

  it('forceCheapTier NÃO afeta Vega nem Pulsar', () => {
    for (const engine of ['vega', 'pulsar'] as const) {
      const params = falParamsForEngine(engine, '2k', null, SOURCE, { forceCheapTier: true })
      expect(params.image_size).toBeUndefined()
      expect(params.resolution).toBe('2K')
    }
  })

  it('sem as dimensões do original, cai no auto_2K mesmo com forceCheapTier', () => {
    const params = falParamsForEngine('quasar', '2k', null, null, { forceCheapTier: true })
    expect(params.image_size).toBe('auto_2K')
  })

  it('a env global continua funcionando para quem depende dela', () => {
    process.env.SEEDREAM_CHEAP_TIER = '1'
    const params = falParamsForEngine('quasar', '2k', null, SOURCE)
    expect(typeof params.image_size).toBe('object')
  })
})
