// Intenção de plano da landing até o checkout — o que estes testes protegem:
//
//   • o destino pós-auth tem UMA regra (next > cookie de intenção > /app) e os
//     dois handlers (/auth/callback e /auth/google) a usam; conta nova sempre
//     ganha `signup=1`, inclusive pelo Google (antes só o callback fazia);
//   • `next` com query string sobrevive (é assim que /app/billing?…&resume=1
//     viaja pelos três caminhos de auth) e open redirect continua barrado;
//   • a intenção lida da URL só aceita plano VENDÁVEL — `plan=starter` num
//     link antigo não ressuscita um plano aposentado;
//   • o cookie de intenção é entrada hostil: parse defensivo.

import { describe, expect, it } from 'vitest'
import { isNewUser, postAuthDestination } from '@/lib/analytics/auth-intent'
import {
  intentFromSearchParams,
  intentResumePath,
  parseIntentCookie,
  serializeIntentCookie,
} from '@/lib/analytics/attribution'
import { internalNextPath, safeNextPath } from '@/lib/auth/safe-next-path'
import { isSellablePlanId } from '@/lib/plans'

const ORIGIN = 'https://spacenode.app'
const ESSENCE_COOKIE = serializeIntentCookie({ plan: 'essence', billing: 'monthly' })

describe('postAuthDestination', () => {
  it('sem next e sem intenção cai em /app', () => {
    const { url, intent } = postAuthDestination({ origin: ORIGIN, newUser: false })
    expect(url.toString()).toBe(`${ORIGIN}/app`)
    expect(intent).toBeNull()
  })

  it('next explícito vence a intenção, preservando a query', () => {
    const { url } = postAuthDestination({
      origin: ORIGIN,
      next: '/app/billing?plan=essence&billing=monthly&resume=1',
      intentCookie: serializeIntentCookie({ plan: 'pro', billing: 'monthly' }),
      newUser: false,
    })
    expect(url.pathname).toBe('/app/billing')
    expect(url.searchParams.get('plan')).toBe('essence')
    expect(url.searchParams.get('resume')).toBe('1')
  })

  it('sem next, a intenção do cookie vira a retomada do billing', () => {
    const { url, intent } = postAuthDestination({
      origin: ORIGIN,
      intentCookie: ESSENCE_COOKIE,
      newUser: false,
    })
    expect(url.pathname + url.search).toBe(intentResumePath({ plan: 'essence', billing: 'monthly' }))
    expect(intent?.plan).toBe('essence')
  })

  it('conta nova ganha signup=1 em qualquer destino', () => {
    const plain = postAuthDestination({ origin: ORIGIN, newUser: true })
    expect(plain.url.searchParams.get('signup')).toBe('1')

    const resumed = postAuthDestination({ origin: ORIGIN, intentCookie: ESSENCE_COOKIE, newUser: true })
    expect(resumed.url.searchParams.get('signup')).toBe('1')
    expect(resumed.url.searchParams.get('resume')).toBe('1')
  })

  it('next externo ou malformado é ignorado (open redirect)', () => {
    for (const bad of ['https://evil.example/app', '//evil.example', '/app\\@evil.example', '/app\tx']) {
      const { url } = postAuthDestination({ origin: ORIGIN, next: bad, newUser: false })
      expect(url.origin).toBe(ORIGIN)
      expect(url.pathname).toBe('/app')
    }
  })

  it('cookie de intenção inválido não desvia o destino', () => {
    for (const bad of ['{"plan":"gold"}', '{"plan":"free"}', 'lixo', '', '%%%']) {
      const { url, intent } = postAuthDestination({ origin: ORIGIN, intentCookie: bad, newUser: false })
      expect(intent).toBeNull()
      expect(url.pathname).toBe('/app')
    }
  })

  it('plano legado no cookie chega ao billing, e é o billing que recusa a retomada', () => {
    // O parser aceita qualquer plano PAGO (starter/office ainda existem para
    // assinantes antigos). A retomada automática só vale para plano vendável:
    // app/app/billing/page.tsx valida com isSellablePlanId antes de abrir o
    // checkout, então um cookie antigo no máximo mostra a tela de planos.
    const { url, intent } = postAuthDestination({
      origin: ORIGIN,
      intentCookie: serializeIntentCookie({ plan: 'office', billing: 'monthly' }),
      newUser: false,
    })
    expect(intent?.plan).toBe('office')
    expect(url.pathname).toBe('/app/billing')
    expect(isSellablePlanId(url.searchParams.get('plan'))).toBe(false)
  })
})

describe('internalNextPath / safeNextPath', () => {
  it('mantém a query string de um caminho interno', () => {
    expect(internalNextPath('/app/billing?plan=essence&resume=1')).toBe('/app/billing?plan=essence&resume=1')
    expect(safeNextPath('/app/billing?resume=1')).toBe('/app/billing?resume=1')
  })

  it('distingue ausente/inválido de /app explícito', () => {
    expect(internalNextPath(null)).toBeNull()
    expect(internalNextPath('https://evil.example')).toBeNull()
    expect(internalNextPath('/app')).toBe('/app')
    expect(safeNextPath(null)).toBe('/app')
  })
})

describe('intentFromSearchParams', () => {
  it('lê plano vendável e ciclo da URL', () => {
    expect(intentFromSearchParams(new URLSearchParams('plan=essence'))).toEqual({ plan: 'essence', billing: 'monthly' })
    expect(intentFromSearchParams(new URLSearchParams('plan=pro&billing=annual'))).toEqual({ plan: 'pro', billing: 'annual' })
  })

  it('recusa plano aposentado, inválido ou ausente', () => {
    expect(intentFromSearchParams(new URLSearchParams('plan=starter'))).toBeNull()
    expect(intentFromSearchParams(new URLSearchParams('plan=office'))).toBeNull()
    expect(intentFromSearchParams(new URLSearchParams('plan=free'))).toBeNull()
    expect(intentFromSearchParams(new URLSearchParams(''))).toBeNull()
  })

  it('ida e volta com o cookie', () => {
    const intent = intentFromSearchParams(new URLSearchParams('plan=essence'))!
    expect(parseIntentCookie(serializeIntentCookie(intent))).toEqual(intent)
  })
})

describe('isNewUser', () => {
  it('conta criada há menos de 60s é nova', () => {
    const now = new Date().toISOString()
    const old = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(isNewUser({ created_at: now } as never)).toBe(true)
    expect(isNewUser({ created_at: old } as never)).toBe(false)
    expect(isNewUser(null)).toBe(false)
  })
})
