import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMemorySupabase } from './helpers/memory-supabase'

const state = vi.hoisted(() => ({ user: null as Record<string, unknown> | null, admin: null as unknown }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.admin }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user } }) },
}) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }), clientIp: () => '127.0.0.1' }))
import { POST } from '@/app/api/marketing/track/route'

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('META_CAPI_ENABLED', 'true')
  vi.stubEnv('META_CAPI_ACCESS_TOKEN', 'test-secret')
  vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '123456')
  state.admin = createMemorySupabase()
  state.user = { id: 'authenticated-account', created_at: new Date(Date.now() - 120000).toISOString(),
    email_confirmed_at: new Date(Date.now() - 60000).toISOString(), user_metadata: {} }
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const request = (consent = 'a1m1') => new NextRequest('https://spacenode.app/api/marketing/track', {
  method: 'POST', headers: { host: 'spacenode.app', cookie: `sn_consent=${consent}` },
  // Client-controlled identity, consent and timestamp must not create the event.
  body: JSON.stringify({ type: 'bind_signup', user_id: 'spoofed', consent: 'granted', event_time: 1 }),
})

describe('signup route → persistence → Meta receipt', () => {
  it('uses the verified identity and persisted signup, returning the same ID to Pixel', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"events_received":1}'))
    vi.stubGlobal('fetch', fetcher)
    const response = await POST(request())
    expect(await response.json()).toEqual({ ok: true, bound: true,
      conversion: { status: 'accepted', eventId: 'signup:authenticated-account' } })
    const payload = JSON.parse(fetcher.mock.calls[0][1].body).data[0]
    expect(payload.event_id).toBe('signup:authenticated-account')
    expect(payload.event_time).toBe(Math.floor(Date.parse(state.user!.created_at as string) / 1000))
    expect(JSON.stringify(payload)).not.toContain('spoofed')
    const rows = (state.admin as ReturnType<typeof createMemorySupabase>).rows('marketing.acquisition_events')
    expect(rows).toHaveLength(1)
    expect(rows[0].metadata).toMatchObject({ meta_registration: { status: 'accepted' } })
  })
  it('keeps first-party signup but refuses third-party delivery without cookie consent', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    state.user!.user_metadata = { consent: 'granted', marketing_consent: 'granted' }
    expect(await (await POST(request(''))).json()).toMatchObject({ bound: true, conversion: { status: 'consent_required' } })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects an anonymous caller even with a claimed identity and consent', async () => {
    state.user = null
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect((await POST(request())).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
