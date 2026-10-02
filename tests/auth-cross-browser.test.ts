// Cadastro iniciado num navegador e confirmado em outro — o caso do anúncio
// aberto no navegador interno do Instagram/Facebook, com o link de
// confirmação aberto pelo app de e-mail.
//
// Usa o cliente REAL do Supabase (@supabase/ssr + auth-js). Só são simulados
// os cookies de cada navegador (next/headers) e as respostas HTTP do GoTrue.
// O que estes testes protegem:
//
//   • reprodução: o link padrão (PKCE) não fecha a sessão fora do navegador
//     do cadastro — falha antes de qualquer chamada de rede;
//   • /auth/confirm (token_hash) fecha a sessão em qualquer navegador e leva
//     ao destino gravado na conta com signup=1 (CompleteRegistration);
//   • signup=1 sai no cadastro por e-mail (confirmação tardia) e no Google, e
//     não sai no login de conta antiga.

import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  written: [] as Array<{ name: string; value: string }>,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...mocks.jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => (mocks.jar.has(name) ? { name, value: mocks.jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      mocks.written.push({ name, value })
      if (value) mocks.jar.set(name, value)
      else mocks.jar.delete(name)
    },
  }),
}))

import { GET as callbackGET } from '@/app/auth/callback/route'
import { GET as confirmGET } from '@/app/auth/confirm/route'
import { POST as googlePOST } from '@/app/auth/google/route'

const ORIGIN = 'https://spacenode.app'
const SUPABASE = 'https://proj.supabase.test'
const STORAGE_KEY = 'sb-proj-auth-token'
const RESUME = '/app/billing?plan=essence&billing=monthly&resume=1'

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
const fakeJwt = (payload: Record<string, unknown>) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`

function sessionFor(user: Record<string, unknown>) {
  return {
    access_token: fakeJwt({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
    refresh_token: 'refresh-test',
    token_type: 'bearer',
    expires_in: 3600,
    user,
  }
}

/** GoTrue simulado: grava as chamadas e responde por rota. */
let gotrueCalls: Array<{ path: string; body: Record<string, unknown> }> = []
function stubGoTrue(routes: Record<string, (body: Record<string, unknown>) => Response>) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = `${url.pathname}${url.search}`.replace('/auth/v1', '')
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    gotrueCalls.push({ path, body })
    const handler = Object.entries(routes).find(([prefix]) => path.startsWith(prefix))?.[1]
    return handler ? handler(body) : new Response(JSON.stringify({ msg: 'not found' }), { status: 404 })
  })
}
const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })

const location = (res: Response) => new URL(res.headers.get('location')!)

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test'
  mocks.jar.clear()
  mocks.written = []
  gotrueCalls = []
})
afterEach(() => { vi.unstubAllGlobals() })

describe('reprodução: link padrão (PKCE) aberto em outro navegador', () => {
  it('sem o code_verifier do navegador do cadastro, o callback cai em /login?error=auth sem sessão', async () => {
    stubGoTrue({})
    // Navegador B (app de e-mail): nenhum cookie do navegador do Instagram.
    const res = await callbackGET(new Request(`${ORIGIN}/auth/callback?code=auth-code-1&next=${encodeURIComponent(RESUME)}`))
    expect(location(res).pathname).toBe('/login')
    expect(location(res).searchParams.get('error')).toBe('auth')
    expect(gotrueCalls).toEqual([]) // falha no cliente, antes da rede
    expect(mocks.written.some(c => c.name.startsWith(STORAGE_KEY) && c.value)).toBe(false)
  })

  it('controle: no MESMO navegador (com o code_verifier) o mesmo link fecha a sessão', async () => {
    stubGoTrue({
      '/token?grant_type=pkce': () => json(200, sessionFor({
        id: 'u-pkce', email: 'a@teste.invalid', created_at: minutesAgo(7), email_confirmed_at: minutesAgo(0),
      })),
    })
    mocks.jar.set(`${STORAGE_KEY}-code-verifier`, 'verifier-do-navegador-a')
    const res = await callbackGET(new Request(`${ORIGIN}/auth/callback?code=auth-code-1&next=${encodeURIComponent(RESUME)}`))
    expect(gotrueCalls[0]).toMatchObject({ path: '/token?grant_type=pkce', body: { code_verifier: 'verifier-do-navegador-a' } })
    expect(location(res).pathname).toBe('/app/billing')
  })
})

describe('correção: /auth/confirm (token_hash) em qualquer navegador', () => {
  const metadata = {
    sn_signup: {
      v: 1,
      attr: { last: { source: 'meta', campaign: 'sn_meta_conversao_arquiteto202610', at: minutesAgo(30) } },
      aid: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      next: RESUME,
    },
  }

  it('fecha a sessão no navegador B e volta ao checkout do plano com signup=1', async () => {
    stubGoTrue({
      '/verify': () => json(200, sessionFor({
        id: 'u-confirm', email: 'b@teste.invalid', created_at: minutesAgo(180),
        email_confirmed_at: minutesAgo(0), user_metadata: metadata,
      })),
    })
    const res = await confirmGET(new Request(`${ORIGIN}/auth/confirm?token_hash=th_123&type=email`))
    expect(gotrueCalls[0]).toMatchObject({ path: '/verify', body: { type: 'email', token_hash: 'th_123' } })
    const to = location(res)
    expect(to.pathname).toBe('/app/billing')
    expect(to.searchParams.get('plan')).toBe('essence')
    expect(to.searchParams.get('resume')).toBe('1')
    expect(to.searchParams.get('signup')).toBe('1')
    expect(mocks.written.some(c => c.name.startsWith(STORAGE_KEY) && c.value)).toBe(true)
  })

  it('tipo fora da lista não chega ao GoTrue', async () => {
    stubGoTrue({})
    const res = await confirmGET(new Request(`${ORIGIN}/auth/confirm?token_hash=th_123&type=recovery`))
    expect(location(res).pathname).toBe('/login')
    expect(gotrueCalls).toEqual([])
  })

  it('token vencido ou já usado volta para o login sem sessão', async () => {
    stubGoTrue({ '/verify': () => json(403, { code: 'otp_expired', msg: 'Email link is invalid or has expired' }) })
    const res = await confirmGET(new Request(`${ORIGIN}/auth/confirm?token_hash=usado&type=email`))
    expect(location(res).searchParams.get('error')).toBe('auth')
    expect(mocks.written.some(c => c.name.startsWith(STORAGE_KEY) && c.value)).toBe(false)
  })

  it('destino externo gravado na conta é ignorado (sem open redirect)', async () => {
    stubGoTrue({
      '/verify': () => json(200, sessionFor({
        id: 'u-evil', email: 'c@teste.invalid', created_at: minutesAgo(5), email_confirmed_at: minutesAgo(0),
        user_metadata: { sn_signup: { v: 1, next: 'https://evil.example/app' } },
      })),
    })
    const to = location(await confirmGET(new Request(`${ORIGIN}/auth/confirm?token_hash=th_9&type=email`)))
    expect(to.origin).toBe(ORIGIN)
    expect(to.pathname).toBe('/app')
  })
})

describe('signup=1 (CompleteRegistration) no e-mail e no Google', () => {
  it('e-mail confirmado 7 min depois do cadastro, no mesmo navegador → signup=1', async () => {
    stubGoTrue({
      '/token?grant_type=pkce': () => json(200, sessionFor({
        id: 'u-late', email: 'd@teste.invalid', created_at: minutesAgo(7), email_confirmed_at: minutesAgo(0),
      })),
    })
    mocks.jar.set(`${STORAGE_KEY}-code-verifier`, 'v')
    const to = location(await callbackGET(new Request(`${ORIGIN}/auth/callback?code=c&next=${encodeURIComponent(RESUME)}`)))
    expect(to.searchParams.get('signup')).toBe('1')
    expect(to.searchParams.get('resume')).toBe('1')
  })

  it('login de conta antiga pelo callback → sem signup=1', async () => {
    stubGoTrue({
      '/token?grant_type=pkce': () => json(200, sessionFor({
        id: 'u-old', email: 'e@teste.invalid', created_at: minutesAgo(60 * 24 * 30), email_confirmed_at: minutesAgo(60 * 24 * 30),
      })),
    })
    mocks.jar.set(`${STORAGE_KEY}-code-verifier`, 'v')
    const to = location(await callbackGET(new Request(`${ORIGIN}/auth/callback?code=c`)))
    expect(to.searchParams.get('signup')).toBeNull()
  })

  const googleRequest = () => {
    const rawNonce = 'nonce-cru-da-aba'
    const hashed = createHash('sha256').update(rawNonce).digest('hex')
    mocks.jar.set('g_csrf_token', 'csrf-1')
    mocks.jar.set('__Host-spn-google-nonce', JSON.stringify([rawNonce]))
    const form = new URLSearchParams({ credential: fakeJwt({ nonce: hashed }), g_csrf_token: 'csrf-1' })
    return new Request(`${ORIGIN}/auth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: `sn_login_next=${encodeURIComponent(RESUME)}`,
      },
      body: form.toString(),
    })
  }

  it('conta nova pelo Google → signup=1 e retomada do checkout', async () => {
    stubGoTrue({
      '/token?grant_type=id_token': () => json(200, sessionFor({
        id: 'u-google-new', email: 'f@teste.invalid', created_at: minutesAgo(0), email_confirmed_at: minutesAgo(0),
        app_metadata: { provider: 'google' },
      })),
    })
    const res = await googlePOST(googleRequest())
    expect(res.status).toBe(303)
    expect(gotrueCalls.map(c => c.path)).toEqual(['/token?grant_type=id_token'])
    const to = location(res)
    expect(to.pathname).toBe('/app/billing')
    expect(to.searchParams.get('signup')).toBe('1')
  })

  it('conta antiga pelo Google → sem signup=1', async () => {
    stubGoTrue({
      '/token?grant_type=id_token': () => json(200, sessionFor({
        id: 'u-google-old', email: 'g@teste.invalid', created_at: minutesAgo(60 * 24 * 90), email_confirmed_at: minutesAgo(60 * 24 * 90),
        app_metadata: { provider: 'google' },
      })),
    })
    const to = location(await googlePOST(googleRequest()))
    expect(to.searchParams.get('signup')).toBeNull()
  })
})
