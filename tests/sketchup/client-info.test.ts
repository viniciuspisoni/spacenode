// tests/sketchup/client-info.test.ts — origem declarada do pedido (plugin 1.9.0).
import { describe, it, expect } from 'vitest'
import { detectClient } from '@/lib/sketchup/client-info'

describe('detectClient', () => {
  it('corpo com kind e versão válidos vence tudo', () => {
    expect(detectClient('Mozilla/5.0', { kind: 'sketchup', version: '1.9.0' })).toEqual({ kind: 'sketchup', version: '1.9.0' })
    expect(detectClient(null, { kind: 'web', version: '0.0.1' })).toEqual({ kind: 'web', version: '0.0.1' })
  })

  it('versão fora do formato x.y.z é descartada, kind fica', () => {
    expect(detectClient(null, { kind: 'sketchup', version: '1.9' })).toEqual({ kind: 'sketchup', version: null })
    expect(detectClient(null, { kind: 'sketchup', version: '<script>' })).toEqual({ kind: 'sketchup', version: null })
  })

  it('kind fora da whitelist cai no User-Agent do plugin', () => {
    expect(detectClient('SPACENODE SketchUp/1.8.1', { kind: 'bot' })).toEqual({ kind: 'sketchup', version: '1.8.1' })
    expect(detectClient('SPACENODE SketchUp/1.8.1', 'string')).toEqual({ kind: 'sketchup', version: '1.8.1' })
  })

  it('sem corpo e sem UA do plugin é unknown (web sem sinal fica como sempre)', () => {
    expect(detectClient('Mozilla/5.0 (Macintosh)', undefined)).toEqual({ kind: 'unknown', version: null })
    expect(detectClient(undefined, null)).toEqual({ kind: 'unknown', version: null })
    expect(detectClient('x SPACENODE SketchUp/1.0.0', null)).toEqual({ kind: 'unknown', version: null })
  })
})
