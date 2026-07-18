// Intents V3: o client nunca decide payload/custo — só devolve o token.
// Aqui: roundtrip válido, adulteração, expiração, dono errado, lixo.

import { beforeAll, describe, expect, it } from 'vitest'
import { signIntent, verifyIntent } from '@/lib/nodi/v3/intents'

beforeAll(() => {
  process.env.NODI_ACTION_SECRET = 'segredo-de-teste-v3'
})

const base = {
  userId: 'user-1',
  action: 'render' as const,
  cost: 40,
  params: {
    inputUrl: 'https://x.supabase.co/storage/v1/object/public/b/in.jpg',
    anchorUrl: 'https://x.supabase.co/storage/v1/object/public/b/out.jpg',
    projectType: 'interior' as const,
    engine: 'vega',
    resolution: '4k',
    refinementText: 'luz de fim de tarde suave',
  },
}

describe('signIntent/verifyIntent', () => {
  it('roundtrip válido devolve a intent íntegra', () => {
    const token = signIntent(base)
    const intent = verifyIntent(token, 'user-1')
    expect(intent).not.toBeNull()
    expect(intent!.cost).toBe(40)
    expect(intent!.params.engine).toBe('vega')
    expect(intent!.params.refinementText).toContain('fim de tarde')
  })

  it('token adulterado (payload OU assinatura) é recusado', () => {
    const token = signIntent(base)
    const [payload, sig] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)]
    // troca o custo dentro do payload
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), cost: 1 })).toString('base64url')
    expect(verifyIntent(`${forged}.${sig}`, 'user-1')).toBeNull()
    // assinatura corrompida
    expect(verifyIntent(`${payload}.${sig.slice(0, -2)}xx`, 'user-1')).toBeNull()
  })

  it('expira em 10 minutos', () => {
    const token = signIntent(base, 1_000_000)
    expect(verifyIntent(token, 'user-1', 1_000_000 + 9 * 60_000)).not.toBeNull()
    expect(verifyIntent(token, 'user-1', 1_000_000 + 11 * 60_000)).toBeNull()
  })

  it('outro usuário não executa a intent', () => {
    const token = signIntent(base)
    expect(verifyIntent(token, 'user-2')).toBeNull()
  })

  it('lixo não explode', () => {
    expect(verifyIntent('', 'u')).toBeNull()
    expect(verifyIntent('a.b', 'u')).toBeNull()
    expect(verifyIntent('x'.repeat(5000), 'u')).toBeNull()
  })
})
