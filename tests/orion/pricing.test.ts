// Orion · tarifas e estimativa de custo.
//
// A regra que estes testes travam: DADO DESCONHECIDO NÃO VIRA ZERO. Um custo
// "US$ 0,00" por falta de informação leva à decisão errada sobre adotar (ou
// não) o GPT Image 2.5 — que é exatamente o que o piloto existe pra decidir.

import { describe, expect, it } from 'vitest'
import {
  EMPTY_ORION_USAGE, ORION_TARIFF_VERSION, ORION_USD_PER_MTOK,
  buildOrionCostRecord, estimateOrionCostUsd, parseOpenAiUsage,
} from '@/lib/orion/pricing'

describe('tarifas publicadas', () => {
  it('valores da doc oficial de 2026-09-10 (USD por 1M de tokens)', () => {
    expect(ORION_USD_PER_MTOK).toEqual({
      textInput: 5, textInputCached: 1.25,
      imageInput: 8, imageInputCached: 2,
      imageOutput: 30,
    })
    expect(ORION_TARIFF_VERSION).toBe('2026-09-10')
  })
})

describe('parseOpenAiUsage', () => {
  it('lê o formato da Image API', () => {
    expect(parseOpenAiUsage({
      input_tokens: 1500,
      input_tokens_details: { text_tokens: 500, image_tokens: 1000 },
      output_tokens: 4000,
      output_tokens_details: { image_tokens: 4000 },
      total_tokens: 5500,
    })).toEqual({
      inputTokens: 1500, inputTextTokens: 500, inputImageTokens: 1000,
      inputCachedTokens: null, outputTokens: 4000, outputImageTokens: 4000,
      totalTokens: 5500,
    })
  })

  it('ausência vira null, não zero', () => {
    expect(parseOpenAiUsage(undefined)).toEqual(EMPTY_ORION_USAGE)
    expect(parseOpenAiUsage(null)).toEqual(EMPTY_ORION_USAGE)
    expect(parseOpenAiUsage({})).toEqual(EMPTY_ORION_USAGE)
    // Valor inválido (string, negativo, NaN) também é desconhecido.
    const weird = parseOpenAiUsage({ input_tokens: '1500', output_tokens: -3 })
    expect(weird.inputTokens).toBeNull()
    expect(weird.outputTokens).toBeNull()
  })
})

describe('estimateOrionCostUsd', () => {
  it('soma os três componentes com as tarifas publicadas', () => {
    const est = estimateOrionCostUsd(parseOpenAiUsage({
      input_tokens: 1500,
      input_tokens_details: { text_tokens: 500, image_tokens: 1000 },
      output_tokens: 4000,
      total_tokens: 5500,
    }))
    // 500·5 + 1000·8 + 4000·30, tudo por 1M
    const expected = (500 * 5 + 1000 * 8 + 4000 * 30) / 1_000_000
    expect(est.usd).toBeCloseTo(expected, 10)
    expect(est.missing).toEqual([])
    expect(est.kind).toBe('estimate')
  })

  it('token em cache sai mais barato — com a premissa declarada', () => {
    const est = estimateOrionCostUsd(parseOpenAiUsage({
      input_tokens: 1500,
      input_tokens_details: { text_tokens: 500, image_tokens: 1000, cached_tokens: 400 },
      output_tokens: 4000,
    }))
    const expected = (500 * 5 + 600 * 8 + 400 * 2 + 4000 * 30) / 1_000_000
    expect(est.usd).toBeCloseTo(expected, 10)
    expect(est.assumptions).toContain('cached_tokens_atribuidos_a_entrada_de_imagem')
  })

  it('sem usage → null com o motivo, NUNCA 0', () => {
    const est = estimateOrionCostUsd(EMPTY_ORION_USAGE)
    expect(est.usd).toBeNull()
    expect(est.usd).not.toBe(0)
    expect(est.missing).toEqual(['input_text_tokens', 'input_image_tokens', 'output_tokens'])
    expect(est.breakdown).toEqual({
      textInputUsd: null, imageInputUsd: null, cachedInputUsd: null, imageOutputUsd: null,
    })
  })

  it('componente faltando derruba o total inteiro pra null', () => {
    const est = estimateOrionCostUsd(parseOpenAiUsage({
      input_tokens: 1500,
      input_tokens_details: { image_tokens: 1000 },   // sem text_tokens
      output_tokens: 4000,
    }))
    expect(est.usd).toBeNull()
    expect(est.missing).toEqual(['input_text_tokens'])
    // O que dá pra saber continua exposto — só o total é que não fecha.
    expect(est.breakdown.imageInputUsd).toBeCloseTo(1000 * 8 / 1_000_000, 10)
  })

  it('zero token informado é um zero REAL', () => {
    const est = estimateOrionCostUsd(parseOpenAiUsage({
      input_tokens: 0,
      input_tokens_details: { text_tokens: 0, image_tokens: 0 },
      output_tokens: 0,
    }))
    expect(est.usd).toBe(0)
    expect(est.missing).toEqual([])
  })
})

describe('buildOrionCostRecord (o que vai pro generation_log)', () => {
  it('marca quando o fornecedor NÃO informou uso — caso da fal.ai', () => {
    const rec = buildOrionCostRecord({
      provider: 'fal', variant: 'sunburst',
      model: 'openai/gpt-image-2.5/sunburst/edit',
      usage: EMPTY_ORION_USAGE, usageRaw: null,
    })
    expect(rec.usage_reported).toBe(false)
    expect(rec.estimated_usd).toBeNull()
    expect(rec.cost_kind).toBe('estimate')          // estimativa ≠ cobrança do fornecedor
    expect(rec.tariff_version).toBe(ORION_TARIFF_VERSION)
    expect(rec.tariff_source).toContain('developers.openai.com')
  })

  it('guarda o uso BRUTO junto do normalizado (refazer a conta depois)', () => {
    const raw = { input_tokens: 10, input_tokens_details: { text_tokens: 4, image_tokens: 6 }, output_tokens: 20 }
    const rec = buildOrionCostRecord({
      provider: 'openai', variant: 'flare', model: 'gpt-image-2.5-flare',
      usage: parseOpenAiUsage(raw), usageRaw: raw,
    })
    expect(rec.usage_raw).toEqual(raw)
    expect(rec.usage.inputImageTokens).toBe(6)
    expect(rec.estimated_usd).toBeCloseTo((4 * 5 + 6 * 8 + 20 * 30) / 1_000_000, 10)
  })
})
