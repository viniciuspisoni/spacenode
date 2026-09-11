// Histórico · rótulo de motor.
//
// O bug que este arquivo tranca: a classificação era feita por SUBSTRING, e
// qualquer string com 'gpt-image' virava "Quasar". Com o Orion (cujos modelos
// são gpt-image-2.5-sunburst / -flare) isso carimbaria o piloto como Quasar.
//
// Regra: o motor PERSISTIDO tem precedência; a heurística de substring só vale
// pro modelo/endpoint cru dos registros antigos — e ali 'gpt-image-2.5' é
// testado ANTES de 'gpt-image', que continua significando Quasar (ele era GPT
// Image 2 até 2026-09-05).

import { describe, expect, it } from 'vitest'
import { engineDisplayLabel } from '@/lib/history/generation-detail'

describe('motor persistido tem precedência', () => {
  it('ids da coluna engine viram o nome do produto', () => {
    expect(engineDisplayLabel('vega')).toBe('Vega')
    expect(engineDisplayLabel('pulsar')).toBe('Pulsar')
    expect(engineDisplayLabel('quasar')).toBe('Quasar')
    expect(engineDisplayLabel('orion')).toBe('Orion')
    expect(engineDisplayLabel('ORION')).toBe('Orion')
    expect(engineDisplayLabel(' orion ')).toBe('Orion')
  })
})

describe('modelo/endpoint cru', () => {
  it('gpt-image-2.5 é Orion — não Quasar', () => {
    expect(engineDisplayLabel('gpt-image-2.5-sunburst')).toBe('Orion')
    expect(engineDisplayLabel('gpt-image-2.5-flare')).toBe('Orion')
    expect(engineDisplayLabel('openai/gpt-image-2.5/sunburst/edit')).toBe('Orion')
    expect(engineDisplayLabel('gpt-image-2.5-sunburst-2026-09-08')).toBe('Orion')
  })

  it('renders ANTIGOS do Quasar seguem sendo Quasar', () => {
    // O Quasar era GPT Image 2 até 2026-09-05 — esses registros existem em prod.
    expect(engineDisplayLabel('openai/gpt-image-2/edit')).toBe('Quasar')
    expect(engineDisplayLabel('gpt-image-2')).toBe('Quasar')
    expect(engineDisplayLabel('gpt-image-1')).toBe('Quasar')
    // E o Quasar de hoje (Seedream) também.
    expect(engineDisplayLabel('bytedance/seedream/v5/pro/edit')).toBe('Quasar')
    expect(engineDisplayLabel('dola-seedream-5-0-pro-260628')).toBe('Quasar')
  })

  it('os demais motores continuam classificados como antes', () => {
    expect(engineDisplayLabel('fal-ai/nano-banana-pro/edit')).toBe('Vega')
    expect(engineDisplayLabel('gemini-3-pro-image')).toBe('Vega')
    expect(engineDisplayLabel('fal-ai/nano-banana-2/edit')).toBe('Pulsar')
    expect(engineDisplayLabel('gemini-2.5-flash-image')).toBe('Pulsar')
  })

  it('valor desconhecido não vira label de produto', () => {
    expect(engineDisplayLabel(null)).toBeNull()
    expect(engineDisplayLabel('')).toBeNull()
    expect(engineDisplayLabel('algum-endpoint-interno')).toBeNull()
  })
})
