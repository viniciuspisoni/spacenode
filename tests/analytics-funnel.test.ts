import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_EVENTS,
  CLIENT_EVENTS,
  isAnalyticsEvent,
  MAX_PROP_KEYS,
  sanitizeProps,
  storageEventType,
} from '@/lib/analytics/events'
import {
  parseAnonymousId,
  parseIntentCookie,
  serializeIntentCookie,
  intentResumePath,
} from '@/lib/analytics/attribution'
import { postAuthDestination } from '@/lib/analytics/auth-intent'

describe('catálogo de eventos', () => {
  it('mapeia aliases de storage para os nomes legados do schema marketing', () => {
    // O painel /admin/marketing/ads e o índice único de signup dependem
    // desses nomes — mudar o alias quebra o funil existente.
    expect(storageEventType('signup_completed')).toBe('signup')
    expect(storageEventType('subscription_cancelled')).toBe('subscription_canceled')
  })

  it('mantém os demais nomes idênticos ao público', () => {
    expect(storageEventType('landing_view')).toBe('landing_view')
    expect(storageEventType('checkout_completed')).toBe('checkout_completed')
    expect(storageEventType('generation_failed')).toBe('generation_failed')
  })

  it('só permite eventos do catálogo no coletor público', () => {
    for (const event of CLIENT_EVENTS) {
      expect(ANALYTICS_EVENTS).toContain(event)
    }
  })

  it('nega eventos de dinheiro/cadastro/geração no coletor (anti-spoof)', () => {
    for (const serverOnly of [
      'signup_completed',
      'checkout_started',
      'checkout_completed',
      'subscription_started',
      'subscription_cancelled',
      'generation_started',
      'generation_completed',
      'generation_failed',
      'project_created',
    ] as const) {
      expect(CLIENT_EVENTS.has(serverOnly)).toBe(false)
    }
  })

  it('valida nomes de evento', () => {
    expect(isAnalyticsEvent('cta_clicked')).toBe(true)
    expect(isAnalyticsEvent('lp_view')).toBe(false) // legado é interno, não público
    expect(isAnalyticsEvent(42)).toBe(false)
  })
})

describe('sanitizeProps', () => {
  it('mantém escalares e derruba objetos/arrays/funções', () => {
    expect(
      sanitizeProps({ a: 'x', b: 2, c: true, d: null, e: { nested: 1 }, f: [1], g: () => 1 }),
    ).toEqual({ a: 'x', b: 2, c: true, d: null })
  })

  it('trunca strings longas e limita a quantidade de chaves', () => {
    const big = 'y'.repeat(1000)
    expect((sanitizeProps({ big }).big as string).length).toBe(300)

    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]))
    expect(Object.keys(sanitizeProps(many)).length).toBe(MAX_PROP_KEYS)
  })

  it('devolve objeto vazio para entradas fora do shape', () => {
    expect(sanitizeProps(null)).toEqual({})
    expect(sanitizeProps('str')).toEqual({})
    expect(sanitizeProps([1, 2])).toEqual({})
  })
})

describe('id anônimo (sn_aid)', () => {
  it('aceita uuid e rejeita qualquer outra coisa (cookie é input hostil)', () => {
    expect(parseAnonymousId('9b2f4c1e-8a3d-4f6b-9c2d-1e5a7b3c9d0f')).toBe(
      '9b2f4c1e-8a3d-4f6b-9c2d-1e5a7b3c9d0f',
    )
    expect(parseAnonymousId('not-a-uuid')).toBeNull()
    expect(parseAnonymousId('<script>')).toBeNull()
    expect(parseAnonymousId('')).toBeNull()
    expect(parseAnonymousId(undefined)).toBeNull()
  })
})

describe('cookie de intenção (sn_intent)', () => {
  it('faz round-trip de plano/ciclo/oferta', () => {
    const raw = serializeIntentCookie({ plan: 'starter', billing: 'monthly', offer: 'launch50' })
    expect(parseIntentCookie(raw)).toEqual({ plan: 'starter', billing: 'monthly', offer: 'launch50' })
  })

  it('rejeita plano inválido; ciclo desconhecido vira monthly', () => {
    expect(parseIntentCookie(encodeURIComponent(JSON.stringify({ plan: 'gold' })))).toBeNull()
    expect(
      parseIntentCookie(encodeURIComponent(JSON.stringify({ plan: 'pro', billing: 'weekly' }))),
    ).toEqual({ plan: 'pro', billing: 'monthly' })
  })

  it('rejeita next externo (open redirect) e oferta fora do formato', () => {
    const evil = parseIntentCookie(
      encodeURIComponent(
        JSON.stringify({ plan: 'pro', next: 'https://evil.example', offer: 'x y!' }),
      ),
    )
    expect(evil).toEqual({ plan: 'pro', billing: 'monthly' })
  })

  it('rejeita lixo e JSON malformado', () => {
    expect(parseIntentCookie('%%%')).toBeNull()
    expect(parseIntentCookie('{}')).toBeNull()
    expect(parseIntentCookie(undefined)).toBeNull()
  })

  it('monta a URL de retomada do checkout', () => {
    expect(intentResumePath({ plan: 'starter', billing: 'monthly', offer: 'launch50' })).toBe(
      '/app/billing?plan=starter&billing=monthly&resume=1&offer=launch50',
    )
  })
})

describe('destino pós-auth', () => {
  const origin = 'https://spacenode.app'
  const intentCookie = serializeIntentCookie({ plan: 'starter', billing: 'monthly' })

  it('intenção de plano leva ao billing com resume=1', () => {
    const { url } = postAuthDestination({ origin, intentCookie, newUser: false })
    expect(url.pathname).toBe('/app/billing')
    expect(url.searchParams.get('plan')).toBe('starter')
    expect(url.searchParams.get('resume')).toBe('1')
  })

  it('next explícito tem precedência sobre a intenção', () => {
    const { url } = postAuthDestination({ origin, next: '/app/spaces/new', intentCookie, newUser: false })
    expect(url.pathname).toBe('/app/spaces/new')
  })

  it('next externo é ignorado (open redirect)', () => {
    const { url } = postAuthDestination({ origin, next: 'https://evil.example/x', intentCookie: null, newUser: false })
    expect(url.pathname).toBe('/app')
    expect(url.host).toBe('spacenode.app')
    const protocolRelative = postAuthDestination({ origin, next: '//evil.example', intentCookie: null, newUser: false })
    expect(protocolRelative.url.host).toBe('spacenode.app')
  })

  it('conta nova ganha signup=1 (ping do Google Ads) em qualquer destino', () => {
    const a = postAuthDestination({ origin, intentCookie, newUser: true })
    expect(a.url.searchParams.get('signup')).toBe('1')
    const b = postAuthDestination({ origin, intentCookie: null, newUser: true })
    expect(b.url.pathname).toBe('/app')
    expect(b.url.searchParams.get('signup')).toBe('1')
  })

  it('sem next e sem intenção cai no /app', () => {
    const { url, intent } = postAuthDestination({ origin, intentCookie: null, newUser: false })
    expect(url.pathname).toBe('/app')
    expect(intent).toBeNull()
  })
})
