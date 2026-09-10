// Orion · catálogo, listas fechadas e mapeamento do preset 2K.
//
// O piloto NUNCA manda 'auto' em size/quality: a comparação precisa saber o
// que foi pedido. E o catálogo público (Vega/Pulsar/Quasar) não pode ser
// contaminado — Orion vive só no vocabulário RenderEngineId.

import { describe, expect, it } from 'vitest'
import { ENGINE_ORDER, ENGINES, isEngineId } from '@/lib/engines'
import {
  ORION_CONFIG, ORION_LONG_EDGE_2K, ORION_MODELS, ORION_NODES_COST,
  ORION_QUALITY_ORDER, ORION_VARIANT_ORDER,
  ORION_LONG_EDGE_4K, orionResolutionOrDefault,
  isInternalRenderRow,
  isOrionProvider, isOrionQuality, isOrionResolution, isOrionVariant, isRenderEngineId,
  orionSizeParam, orionTargetSize, parseOrionSizeParam,
} from '@/lib/orion/config'

describe('isolamento do catálogo público', () => {
  it('Orion NÃO é um EngineId e não entra em ENGINE_ORDER/ENGINES', () => {
    expect(isEngineId('orion')).toBe(false)
    expect(ENGINE_ORDER).toEqual(['vega', 'pulsar', 'quasar'])
    expect(Object.keys(ENGINES).sort()).toEqual(['pulsar', 'quasar', 'vega'])
  })

  it('isRenderEngineId aceita os públicos + orion, e nada além', () => {
    for (const id of ['vega', 'pulsar', 'quasar', 'orion']) {
      expect(isRenderEngineId(id), id).toBe(true)
    }
    for (const bad of ['ORION', 'orion ', 'sunburst', '', null, undefined, 0, {}, ['orion']]) {
      expect(isRenderEngineId(bad), JSON.stringify(bad)).toBe(false)
    }
  })

  it('preços dos motores públicos ficam intactos', () => {
    expect(ENGINES.vega.nodes).toEqual({ '2k': 20, '4k': 40 })
    expect(ENGINES.pulsar.nodes).toEqual({ hd: 10, '2k': 15, '4k': 25 })
    expect(ENGINES.quasar.nodes).toEqual({ '2k': 20 })
    // Quasar continua no Seedream — o piloto não mexe nele.
    expect(ENGINES.quasar.falEndpoint).toBe('bytedance/seedream/v5/pro/edit')
  })
})

describe('catálogo do piloto', () => {
  it('modelos exatos das duas variantes', () => {
    expect(ORION_MODELS).toEqual({
      sunburst: 'gpt-image-2.5-sunburst',
      flare:    'gpt-image-2.5-flare',
    })
  })

  it('2K e 4K, zero nodes nos dois', () => {
    expect(ORION_CONFIG.resolutions).toEqual(['2k', '4k'])
    expect(ORION_CONFIG.nodes).toEqual({ '2k': 0, '4k': 0 })
    expect(ORION_NODES_COST).toBe(0)
  })

  it('listas fechadas de variante, qualidade, fornecedor e resolução', () => {
    expect(ORION_VARIANT_ORDER).toEqual(['sunburst', 'flare'])
    expect(ORION_QUALITY_ORDER).toEqual(['high', 'medium'])

    for (const bad of ['auto', 'low', 'xhigh', 'max', 'HIGH', '', null, undefined, 1]) {
      expect(isOrionQuality(bad), `quality ${JSON.stringify(bad)}`).toBe(false)
    }
    for (const bad of ['gpt-image-2.5-sunburst', 'Sunburst', '', null, undefined]) {
      expect(isOrionVariant(bad), `variant ${JSON.stringify(bad)}`).toBe(false)
    }
    for (const bad of ['gcp', 'ark', 'OPENAI', '', null, undefined]) {
      expect(isOrionProvider(bad), `provider ${JSON.stringify(bad)}`).toBe(false)
    }
    expect(isOrionProvider('openai')).toBe(true)
    expect(isOrionProvider('fal')).toBe(true)

    // 2K e 4K no piloto; HD é recusado mesmo sendo Resolution válida.
    expect(isOrionResolution('2k')).toBe(true)
    expect(isOrionResolution('4k')).toBe(true)
    expect(isOrionResolution('hd')).toBe(false)
  })
})

describe('preset 2K → dimensão explícita', () => {
  const LIMITS = { minEdge: 512, maxEdge: 3840, maxAspect: 3 }

  function assertValidForOpenAi(w: number, h: number) {
    expect(w % 16, `${w} múltiplo de 16`).toBe(0)
    expect(h % 16, `${h} múltiplo de 16`).toBe(0)
    expect(Math.max(w, h)).toBeLessThanOrEqual(LIMITS.maxEdge)
    expect(Math.min(w, h)).toBeGreaterThanOrEqual(LIMITS.minEdge)
    const aspect = Math.max(w / h, h / w)
    expect(aspect, `aspecto ${w}x${h}`).toBeLessThanOrEqual(LIMITS.maxAspect)
  }

  it('preserva a proporção com lado maior 2048', () => {
    const cases: [number, number][] = [
      [1920, 1080], [3840, 2160], [4000, 3000], [1000, 1000],
      [1080, 1920], [2400, 1600], [1600, 2400], [5000, 2500],
    ]
    for (const [w, h] of cases) {
      const size = orionTargetSize(w, h)
      assertValidForOpenAi(size.width, size.height)
      expect(Math.max(size.width, size.height)).toBe(ORION_LONG_EDGE_2K)
      // Proporção preservada dentro do erro do arredondamento de 16 px.
      const before = w / h
      const after = size.width / size.height
      expect(Math.abs(after - before) / before, `${w}x${h}`).toBeLessThan(0.02)
      expect(size.source).toBe('aspect')
    }
  })

  it('aspecto extremo é cortado no limite do fornecedor, não rejeitado', () => {
    for (const [w, h] of [[6000, 1000], [1000, 6000]] as [number, number][]) {
      const size = orionTargetSize(w, h)
      assertValidForOpenAi(size.width, size.height)
      expect(size.source).toBe('clamped')
    }
  })

  it('sem dimensões cai no quadrado 2K — nunca "auto"', () => {
    for (const bad of [[null, null], [0, 100], [100, 0], [undefined, undefined]] as [number | null | undefined, number | null | undefined][]) {
      const size = orionTargetSize(bad[0], bad[1])
      expect(size).toEqual({ width: 2048, height: 2048, source: 'fallback' })
      expect(orionSizeParam(size)).not.toBe('auto')
    }
  })

  it('orionSizeParam usa o formato LARGURAxALTURA da Image API', () => {
    expect(orionSizeParam(orionTargetSize(1920, 1080))).toBe('2048x1152')
  })

  it('parseOrionSizeParam devolve null (não zero) pro que não entende', () => {
    expect(parseOrionSizeParam('2048x1152')).toEqual({ width: 2048, height: 1152 })
    expect(parseOrionSizeParam('2048X1152')).toEqual({ width: 2048, height: 1152 })
    for (const bad of ['auto', '', 'abcxdef', '2048', null, undefined, 2048, { width: 1 }]) {
      expect(parseOrionSizeParam(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})

describe('isInternalRenderRow — bloqueio de promoção pro Spaces', () => {
  it('reconhece o piloto pelo marcador, pelo motor OU pelo snapshot', () => {
    expect(isInternalRenderRow({ is_internal_test: true, engine: 'vega' })).toBe(true)
    expect(isInternalRenderRow({ engine: 'orion' })).toBe(true)
    expect(isInternalRenderRow({ engine: 'ORION' })).toBe(true)
    expect(isInternalRenderRow({ engine: ' orion ' })).toBe(true)
    // Banco ainda sem a migration: o snapshot segura sozinho.
    expect(isInternalRenderRow({ engine: null, config_snapshot: { internal_test: true } })).toBe(true)
  })

  it('render comercial passa (o bloqueio não vaza pros motores públicos)', () => {
    for (const engine of ['vega', 'pulsar', 'quasar']) {
      expect(isInternalRenderRow({ engine, is_internal_test: false }), engine).toBe(false)
      expect(isInternalRenderRow({ engine, config_snapshot: { briefing: {} } }), engine).toBe(false)
    }
    expect(isInternalRenderRow(null)).toBe(false)
    expect(isInternalRenderRow(undefined)).toBe(false)
    expect(isInternalRenderRow({})).toBe(false)
  })

  it('valor "quase true" vindo do banco não libera nem bloqueia por engano', () => {
    // Só o booleano true conta — 'true'/1 não são o marcador.
    expect(isInternalRenderRow({ engine: 'vega', is_internal_test: 'true' })).toBe(false)
    expect(isInternalRenderRow({ engine: 'vega', config_snapshot: { internal_test: 1 } })).toBe(false)
    // …mas o motor 'orion' sozinho já basta.
    expect(isInternalRenderRow({ engine: 'orion', is_internal_test: false })).toBe(true)
  })
})

describe('preset 4K (teto de 3840 px por lado da Image API)', () => {
  it('lado maior 3840 — não os 4096 do "4K" de Vega/Pulsar', () => {
    expect(ORION_LONG_EDGE_4K).toBe(3840)
    const s = orionTargetSize(1920, 1080, '4k')
    expect(orionSizeParam(s)).toBe('3840x2160')   // 4K UHD exato em 16:9
  })

  it('4K tem ~3,5× os pixels do 2K em qualquer aspecto', () => {
    for (const [w, h] of [[2207, 857], [1920, 1080], [1280, 1600], [1000, 1000]] as [number, number][]) {
      const a = orionTargetSize(w, h, '2k')
      const b = orionTargetSize(w, h, '4k')
      const ratio = (b.width * b.height) / (a.width * a.height)
      expect(ratio, `${w}x${h}`).toBeGreaterThan(3.3)
      expect(ratio, `${w}x${h}`).toBeLessThan(3.7)
      // Continua válido pro fornecedor: múltiplo de 16 e dentro do teto.
      expect(b.width % 16).toBe(0)
      expect(b.height % 16).toBe(0)
      expect(Math.max(b.width, b.height)).toBeLessThanOrEqual(3840)
    }
  })

  it('default continua 2K — quem não pede resolução não paga 4K sem querer', () => {
    expect(orionTargetSize(1920, 1080)).toEqual(orionTargetSize(1920, 1080, '2k'))
    expect(orionResolutionOrDefault(undefined)).toBe('2k')
    expect(orionResolutionOrDefault('hd')).toBe('2k')
    expect(orionResolutionOrDefault('4k')).toBe('4k')
  })
})
