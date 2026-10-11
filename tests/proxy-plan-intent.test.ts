import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { INTENT_COOKIE, serializeIntentCookie } from '@/lib/analytics/attribution'

const session = vi.hoisted(() => ({
  user: { id: 'signed-in-user' } as { id: string } | null,
  refresh: false,
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: {
    cookies: { setAll: (cookies: Array<{
      name: string; value: string; options: { path: string; httpOnly: boolean; secure: boolean }
    }>) => void }
  }) => ({
    auth: {
      getUser: async () => {
        if (session.refresh) {
          options.cookies.setAll([{
            name: 'sb-test-auth-token',
            value: 'refreshed-session',
            options: { path: '/', httpOnly: true, secure: true },
          }])
        }
        return { data: { user: session.user } }
      },
    },
  }),
}))

import proxy from '@/proxy'

const ORIGIN = 'https://spacenode.app'
function request(path: string, intentCookie?: string) {
  return new NextRequest(new URL(path, ORIGIN), {
    headers: intentCookie ? { cookie: `${INTENT_COOKIE}=${intentCookie}` } : undefined,
  })
}
function destination(response: Response) {
  return new URL(response.headers.get('location')!)
}

beforeEach(() => {
  session.user = { id: 'signed-in-user' }
  session.refresh = false
})

describe('LP plan choice for an existing session', () => {
  it.each([
    ['essence', 'monthly'], ['pro', 'monthly'], ['studio', 'monthly'],
    ['essence', 'annual'], ['pro', 'annual'], ['studio', 'annual'],
  ])('resumes %s / %s instead of losing the choice in /app', async (plan, billing) => {
    const response = await proxy(request(`/login?mode=signup&plan=${plan}&billing=${billing}`))
    expect(response.status).toBe(307)
    const url = destination(response)
    expect(url.origin).toBe(ORIGIN)
    expect(url.pathname).toBe('/app/billing')
    expect(url.searchParams.get('plan')).toBe(plan)
    expect(url.searchParams.get('billing')).toBe(billing)
    expect(url.searchParams.get('resume')).toBe('1')
    expect(url.searchParams.has('mode')).toBe(false)
  })

  it('keeps the SketchUp next destination and its query ahead of plan intent', async () => {
    const next = '/sketchup/connect?nonce=plugin-nonce'
    const response = await proxy(request(`/login?plan=essence&next=${encodeURIComponent(next)}`))
    expect(destination(response).pathname + destination(response).search).toBe(next)
  })

  it('uses the cookie when the login URL has no plan', async () => {
    const cookie = serializeIntentCookie({ plan: 'pro', billing: 'annual' })
    const url = destination(await proxy(request('/login', cookie)))
    expect(url.pathname).toBe('/app/billing')
    expect(url.searchParams.get('plan')).toBe('pro')
    expect(url.searchParams.get('billing')).toBe('annual')
  })

  it('the current URL plan wins over an older cookie', async () => {
    const cookie = serializeIntentCookie({ plan: 'pro', billing: 'annual' })
    const url = destination(await proxy(request('/login?plan=essence', cookie)))
    expect(url.searchParams.get('plan')).toBe('essence')
    expect(url.searchParams.get('billing')).toBe('monthly')
  })

  it.each(['https://evil.example/app', '//evil.example', '/app\\@evil.example'])(
    'ignores unsafe next %s and keeps the valid plan',
    async (next) => {
      const url = destination(await proxy(request(`/login?plan=essence&next=${encodeURIComponent(next)}`)))
      expect(url.origin).toBe(ORIGIN)
      expect(url.pathname).toBe('/app/billing')
      expect(url.searchParams.get('plan')).toBe('essence')
    },
  )

  it.each(['/login', '/login?plan=free', '/login?plan=starter', '/login?plan=unknown'])(
    'uses the normal dashboard for %s without a valid intent',
    async (path) => {
      const url = destination(await proxy(request(path, '%%%')))
      expect(url.pathname).toBe('/app')
      expect(url.search).toBe('')
    },
  )

  it('leaves an anonymous visitor on signup to authenticate first', async () => {
    session.user = null
    const response = await proxy(request('/login?mode=signup&plan=essence'))
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('preserves refreshed auth cookies and forbids caching the personalized redirect', async () => {
    session.refresh = true
    const response = await proxy(request('/login?plan=essence'))
    expect(response.cookies.get('sb-test-auth-token')).toMatchObject({
      value: 'refreshed-session', path: '/', httpOnly: true, secure: true,
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
