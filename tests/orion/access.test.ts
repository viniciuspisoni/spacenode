// Orion · autorização. Motor público desde 2026-09-11 — único gate é a flag
// privada de servidor; qualquer usuário autenticado passa com ela ligada.

import { afterEach, describe, expect, it } from 'vitest'
import { canUseOrion, orionInternalEnabled } from '@/lib/orion/access'

const USER   = { id: 'u-1', email: 'cliente@escritorio.com.br' }

afterEach(() => {
  delete process.env.ORION_INTERNAL_ENABLED
})

describe('flag ORION_INTERNAL_ENABLED', () => {
  it('desligada por padrão — ninguém passa', async () => {
    expect(orionInternalEnabled()).toBe(false)
    expect(await canUseOrion(USER)).toBe(false)
  })

  it('qualquer valor que não seja exatamente "1" continua desligado', async () => {
    for (const v of ['0', 'true', 'yes', '', ' 1', 'ORION']) {
      process.env.ORION_INTERNAL_ENABLED = v
      expect(orionInternalEnabled(), `valor ${JSON.stringify(v)}`).toBe(false)
      expect(await canUseOrion(USER)).toBe(false)
    }
  })
})

describe('com a flag ligada', () => {
  it('libera qualquer usuário autenticado, sem checar papel/staff', async () => {
    process.env.ORION_INTERNAL_ENABLED = '1'
    expect(await canUseOrion(USER)).toBe(true)
    expect(await canUseOrion({ id: 'u-2', email: null })).toBe(true)
  })

  it('recusa sem usuário (nada de gerar sem sessão)', async () => {
    process.env.ORION_INTERNAL_ENABLED = '1'
    expect(await canUseOrion(null)).toBe(false)
    expect(await canUseOrion(undefined)).toBe(false)
    expect(await canUseOrion({ id: '', email: 'x@x.com' })).toBe(false)
  })
})
