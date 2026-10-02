// Origem do cadastro que sobrevive à troca de navegador + botão de plano.
//
//   • signUp grava na conta só o que a atribuição usa (sem referrer nem click
//     ids) e só destino interno;
//   • a leitura de volta é defensiva — user_metadata é editável pelo usuário;
//   • bind_signup no navegador B: sem a origem na conta o cadastro nasce sem
//     campanha (reprodução); com ela, nasce com a campanha do anúncio e a
//     origem da conta vence um cookie de outra visita;
//   • o botão de plano leva ao cadastro com plano e ciclo e termina no
//     checkout desse plano.

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  rows: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    schema: () => ({
      from: () => ({
        insert: async (row: Record<string, unknown>) => { mocks.rows.push(row); return { error: null } },
        select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      }),
    }),
  }),
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: async () => ({ allowed: true }),
  clientIp: () => '127.0.0.1',
}))

import { POST as trackPOST } from '@/app/api/marketing/track/route'
import {
  intentFromSearchParams,
  intentResumePath,
  planSignupPath,
} from '@/lib/analytics/attribution'
import { postAuthDestination } from '@/lib/analytics/auth-intent'
import {
  signupAttributionFromMetadata,
  signupAttributionMetadata,
} from '@/lib/analytics/signup-attribution'
import { startLandingCheckout } from '@/lib/billing/landing-checkout'
import { serializeAttributionCookie, type AttributionSnapshot } from '@/lib/marketing/ads/naming'

const ORIGIN = 'https://spacenode.app'
const ANON_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301' // navegador do Instagram
const ANON_B = '9b2d1a7e-1c2b-4d3e-8f90-112233445566' // navegador do app de e-mail
const RESUME = '/app/billing?plan=essence&billing=monthly&resume=1'

const META_AD: AttributionSnapshot = {
  last: {
    source: 'meta', medium: 'paid_social',
    campaign: 'sn_meta_conversao_arquiteto202610',
    content: 'sn_meta_conversao_arquiteto202610_apresentacao_video20_copy01',
    term: 'arquiteto', fbclid: 'IwY2xjawF-um-click-id-longo', referrer: 'https://l.instagram.com/',
    landing_path: '/', at: '2026-10-02T12:00:00.000Z',
  },
}
const GOOGLE_VISIT: AttributionSnapshot = {
  last: { source: 'google', medium: 'organic', campaign: 'busca', landing_path: '/', at: '2026-10-02T12:30:00.000Z' },
}

function bindRequest(cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  return new NextRequest(`${ORIGIN}/api/marketing/track`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ type: 'bind_signup' }),
  })
}

beforeEach(() => {
  mocks.rows = []
  mocks.user = null
})

describe('signupAttributionMetadata / signupAttributionFromMetadata', () => {
  it('grava campanha, id anônimo e destino — sem referrer nem click ids', () => {
    const data = signupAttributionMetadata({ attribution: META_AD, anonymousId: ANON_A, next: RESUME })
    const stored = (data.sn_signup as { attr: { last: Record<string, string> } }).attr.last
    expect(stored).toEqual({
      source: 'meta', medium: 'paid_social', campaign: META_AD.last.campaign, content: META_AD.last.content,
      term: 'arquiteto', landing_path: '/', at: META_AD.last.at,
    })
    expect(JSON.stringify(data)).not.toMatch(/fbclid|referrer|instagram\.com/)
    const back = signupAttributionFromMetadata(data)
    expect(back.attribution?.last.campaign).toBe(META_AD.last.campaign)
    expect(back.anonymousId).toBe(ANON_A)
    expect(back.next).toBe(RESUME)
  })

  it('sem nada a guardar não escreve metadata', () => {
    expect(signupAttributionMetadata({ attribution: null, anonymousId: null, next: null })).toEqual({})
  })

  it('leitura defensiva: lixo, id inválido e destino externo viram null', () => {
    expect(signupAttributionFromMetadata(null)).toEqual({ attribution: null, anonymousId: null, next: null })
    expect(signupAttributionFromMetadata({ sn_signup: 'x' }).attribution).toBeNull()
    const hostile = signupAttributionFromMetadata({
      sn_signup: { attr: { last: { campaign: 'sem-data' } }, aid: 'nao-e-uuid', next: 'https://evil.example/app' },
    })
    expect(hostile).toEqual({ attribution: null, anonymousId: null, next: null })
    expect(signupAttributionMetadata({ attribution: null, anonymousId: null, next: '//evil.example' })).toEqual({})
  })
})

describe('bind_signup no navegador da confirmação (sem os cookies do anúncio)', () => {
  it('reprodução: sem a origem na conta, o cadastro nasce sem campanha', async () => {
    mocks.user = { id: 'u1', created_at: '2026-10-02T12:05:00.000Z', user_metadata: {} }
    const res = await trackPOST(bindRequest({ sn_aid: ANON_B }))
    expect(await res.json()).toEqual({ ok: true, bound: true })
    expect(mocks.rows[0]).toMatchObject({ event_type: 'signup', campaign_identifier: null, ad_identifier: null, origin: 'unknown' })
  })

  it('com a origem gravada no signUp, o cadastro nasce com a campanha e o anúncio', async () => {
    mocks.user = {
      id: 'u2', created_at: '2026-10-02T12:05:00.000Z',
      user_metadata: signupAttributionMetadata({ attribution: META_AD, anonymousId: ANON_A, next: RESUME }),
    }
    await trackPOST(bindRequest({ sn_aid: ANON_B }))
    expect(mocks.rows[0]).toMatchObject({
      event_type: 'signup',
      campaign_identifier: 'sn_meta_conversao_arquiteto202610',
      ad_identifier: 'sn_meta_conversao_arquiteto202610_apresentacao_video20_copy01',
      anonymous_id: ANON_A, // a jornada do navegador do anúncio, não a do app de e-mail
      origin: 'paid',
    })
    expect(mocks.rows[0].metadata).toMatchObject({ attribution_source: 'account', plan_intent: 'essence' })
  })

  it('a origem da conta vence o cookie de outra visita no navegador B', async () => {
    mocks.user = {
      id: 'u3', created_at: '2026-10-02T12:05:00.000Z',
      user_metadata: signupAttributionMetadata({ attribution: META_AD, anonymousId: ANON_A, next: null }),
    }
    await trackPOST(bindRequest({ sn_attribution: serializeAttributionCookie(GOOGLE_VISIT), sn_aid: ANON_B }))
    expect(mocks.rows[0]).toMatchObject({ campaign_identifier: 'sn_meta_conversao_arquiteto202610' })
  })

  it('cadastro pelo Google (sem metadata) continua usando o cookie do navegador', async () => {
    mocks.user = { id: 'u4', created_at: '2026-10-02T12:05:00.000Z', user_metadata: { full_name: 'Ana' } }
    await trackPOST(bindRequest({ sn_attribution: serializeAttributionCookie(META_AD), sn_aid: ANON_A }))
    expect(mocks.rows[0]).toMatchObject({ campaign_identifier: 'sn_meta_conversao_arquiteto202610', anonymous_id: ANON_A })
    expect(mocks.rows[0].metadata).toMatchObject({ attribution_source: 'cookie' })
  })
})

describe('botão de plano preserva plano e ciclo depois do cadastro', () => {
  it('sem conta: cadastro com plano e ciclo na URL e intenção gravada', async () => {
    const navigate = vi.fn()
    const rememberIntent = vi.fn()
    await startLandingCheckout('pro', 'monthly', {
      fetch: async () => new Response('{}', { status: 401 }),
      navigate,
      rememberIntent,
    })
    expect(navigate).toHaveBeenCalledWith('/login?mode=signup&plan=pro&billing=monthly')
    expect(rememberIntent).toHaveBeenCalledWith({ plan: 'pro', billing: 'monthly' })
  })

  it('o cadastro iniciado pelo botão termina no checkout desse plano e ciclo', () => {
    for (const billing of ['monthly', 'annual'] as const) {
      const intent = intentFromSearchParams(new URL(planSignupPath('essence', billing), ORIGIN).searchParams)
      expect(intent).toEqual({ plan: 'essence', billing })
      const { url } = postAuthDestination({ origin: ORIGIN, next: intentResumePath(intent!), newUser: true })
      expect(url.pathname).toBe('/app/billing')
      expect(Object.fromEntries(url.searchParams)).toEqual({ plan: 'essence', billing, resume: '1', signup: '1' })
    }
  })

  it('com sessão abre o checkout; assinante vai ao billing', async () => {
    const navigate = vi.fn()
    const deps = { navigate, rememberIntent: vi.fn() }
    await startLandingCheckout('essence', 'monthly', {
      ...deps, fetch: async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test' }), { status: 200 }),
    })
    await startLandingCheckout('essence', 'monthly', { ...deps, fetch: async () => new Response('{}', { status: 409 }) })
    expect(navigate.mock.calls).toEqual([['https://checkout.stripe.com/c/pay/cs_test'], ['/app/billing']])
    expect(deps.rememberIntent).not.toHaveBeenCalled()
  })
})
