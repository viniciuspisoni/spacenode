import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createMemorySupabase } from './helpers/memory-supabase'
import { deliverSignupConversion } from '@/lib/analytics/signup-conversion'
import { buildMetaRegistration } from '@/lib/analytics/adapters/meta-conversions'
import { waitForMarketingTag } from '@/lib/analytics/tag-ready'

const now = Date.UTC(2026, 9, 28, 20)
const user = { id: 'verified-user', created_at: new Date(now - 120000).toISOString(),
  email_confirmed_at: new Date(now - 60000).toISOString() } as User
const event = { id: 'signup-row', event_type: 'signup', user_id: user.id,
  is_internal: false, metadata: { origin: 'paid', attribution_source: 'account' } }
const request = (consent = 'a1m1', host = 'spacenode.app') => new NextRequest(`https://${host}/api/marketing/track`, {
  method: 'POST', headers: { host, 'user-agent': 'Test browser',
    cookie: `sn_consent=${consent}; _fbc=fb.1.${now - 300000}.RealClick; _fbp=fb.1.${now - 300000}.12345` },
})
const db = (seed = {}) => createMemorySupabase({ 'marketing.acquisition_events': [structuredClone(event)], ...seed })
const ack = () => new Response(JSON.stringify({ events_received: 1 }))

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('META_CAPI_ENABLED', 'true')
  vi.stubEnv('META_CAPI_ACCESS_TOKEN', 'test-secret')
  vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '1118003564247575')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('authenticated persisted signup → Meta', () => {
  it('sends the real timestamp and browser matching ids, preserving first-party attribution', async () => {
    const store = db(); const fetcher = vi.fn().mockImplementation(async () => ack()); vi.stubGlobal('fetch', fetcher)
    expect(await deliverSignupConversion(store as never, user, request())).toEqual({ status: 'accepted', eventId: `signup:${user.id}` })
    const [url, init] = fetcher.mock.calls[0]
    const sent = JSON.parse(init.body).data[0]
    expect(url).not.toContain('test-secret')
    expect(sent).toMatchObject({ event_name: 'CompleteRegistration', event_time: (now - 120000) / 1000,
      event_id: `signup:${user.id}`, action_source: 'website', custom_data: { status: true },
      user_data: { fbc: `fb.1.${now - 300000}.RealClick`, client_user_agent: 'Test browser' } })
    expect(sent.user_data.external_id[0]).toMatch(/^[a-f0-9]{64}$/)
    expect(sent.user_data).not.toHaveProperty('em')
    expect(store.rows('marketing.acquisition_events')[0].metadata).toMatchObject({
      origin: 'paid', attribution_source: 'account', meta_registration: { status: 'accepted', consent: 'granted', has_fbc: true },
    })
    const metadata = JSON.stringify(store.rows('marketing.acquisition_events')[0].metadata)
    expect(metadata).not.toContain('RealClick'); expect(metadata).not.toContain('Test browser')
  })
  it.each(['a0m0', 'a1m0', ''])('does not send without marketing consent: %s', async consent => {
    const store = db(); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect(await deliverSignupConversion(store as never, user, request(consent))).toEqual({ status: 'consent_required' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(store.rows('marketing.acquisition_events')).toHaveLength(1)
  })
  it('retries after explicit later consent', async () => {
    const store = db(); const fetcher = vi.fn().mockImplementation(async () => ack()); vi.stubGlobal('fetch', fetcher)
    await deliverSignupConversion(store as never, user, request(''))
    expect((await deliverSignupConversion(store as never, user, request())).status).toBe('accepted')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not resend accepted conversions or issue another Pixel instruction on subsequent devices', async () => {
    const store = db(); const fetcher = vi.fn().mockImplementation(async () => ack()); vi.stubGlobal('fetch', fetcher)
    await deliverSignupConversion(store as never, user, request())
    vi.setSystemTime(now + 3 * 86400000)
    expect(await deliverSignupConversion(store as never, user, request())).toEqual({ status: 'accepted' })
    expect(await deliverSignupConversion(store as never, user, request('denied'))).toEqual({ status: 'consent_required' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('records a failure and retries with the same event id without duplicating signup', async () => {
    const store = db(); const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockImplementation(async () => ack()); vi.stubGlobal('fetch', fetcher)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await deliverSignupConversion(store as never, user, request())).status).toBe('failed')
    expect((await deliverSignupConversion(store as never, user, request())).status).toBe('accepted')
    expect(JSON.parse(fetcher.mock.calls[0][1].body).data[0].event_id).toBe(JSON.parse(fetcher.mock.calls[1][1].body).data[0].event_id)
    expect(store.rows('marketing.acquisition_events')).toHaveLength(1)
  })
  it('does not mistake an HTTP success without acknowledgment for reception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"events_received":0}')))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await deliverSignupConversion(db() as never, user, request())).status).toBe('failed')
  })
  it('does not let a slower failed request overwrite an accepted receipt', async () => {
    const store = db()
    let failFirst!: (response: Response) => void
    let firstStarted!: () => void
    const started = new Promise<void>(resolve => { firstStarted = resolve })
    const fetcher = vi.fn().mockImplementationOnce(() => {
      firstStarted()
      return new Promise<Response>(resolve => { failFirst = resolve })
    }).mockImplementation(async () => ack())
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stale = deliverSignupConversion(store as never, user, request())
    await started
    expect((await deliverSignupConversion(store as never, user, request())).status).toBe('accepted')
    failFirst(new Response('{}', { status: 401 }))
    await stale
    expect(store.rows('marketing.acquisition_events')[0].metadata).toMatchObject({
      meta_registration: { status: 'accepted' },
    })
    expect(await deliverSignupConversion(store as never, user, request())).toEqual({ status: 'accepted' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it.each(['expired', 'future', 'unconfirmed', 'preview', 'actor', 'internal_event', 'missing_signup'])('rejects %s without sending', async reason => {
    const account = { ...user }
    let seed = {}; let req = request()
    if (reason === 'expired') account.created_at = new Date(now - 8 * 86400000).toISOString()
    if (reason === 'future') account.created_at = new Date(now + 1000).toISOString()
    if (reason === 'unconfirmed') account.email_confirmed_at = undefined
    if (reason === 'preview') req = request('granted', 'test.vercel.app')
    if (reason === 'actor') seed = { 'marketing.internal_actors': [{ user_id: user.id }] }
    if (reason === 'internal_event') seed = { 'marketing.acquisition_events': [{ ...event, is_internal: true }] }
    if (reason === 'missing_signup') seed = { 'marketing.acquisition_events': [] }
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const result = await deliverSignupConversion(db(seed) as never, account, req)
    expect(result.eventId).toBeUndefined(); expect(fetcher).not.toHaveBeenCalled()
  })
  it('returns an explicit unconfigured status while preserving browser fallback', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'false')
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect(await deliverSignupConversion(db() as never, user, request())).toEqual({ status: 'unconfigured', eventId: `signup:${user.id}` })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects invalid identifiers and timestamps in the payload builder', () => {
    expect(buildMetaRegistration({ userId: user.id, createdAt: 'invalid', consent: 'granted' }, now)).toBeNull()
    const built = buildMetaRegistration({ userId: user.id, createdAt: user.created_at, consent: 'granted', fbc: 'hostile' }, now)!
    expect(built.user_data).not.toHaveProperty('fbc')
  })
})

describe('delayed marketing script', () => {
  it('waits through URL changes until Pixel appears', async () => {
    const win = { location: { search: '?signup=1' }, fbq: undefined as unknown }
    vi.stubGlobal('window', win); vi.stubGlobal('document', { cookie: 'sn_consent=a1m1' })
    const result = waitForMarketingTag('fbq', new AbortController().signal)
    win.location.search = ''
    await vi.advanceTimersByTimeAsync(2000)
    win.fbq = vi.fn()
    await vi.advanceTimersByTimeAsync(100)
    expect(await result).toBe(true)
  })
  it('stops immediately on unmount and leaves no timer', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('document', { cookie: 'sn_consent=a1m1' })
    const controller = new AbortController()
    const result = waitForMarketingTag('fbq', controller.signal)
    controller.abort()
    expect(await result).toBe(false); expect(vi.getTimerCount()).toBe(0)
  })
  it('stops if consent is revoked while waiting', async () => {
    const doc = { cookie: 'sn_consent=a1m1' }; vi.stubGlobal('document', doc); vi.stubGlobal('window', {})
    const result = waitForMarketingTag('fbq', new AbortController().signal)
    doc.cookie = 'sn_consent=a0m0'
    await vi.advanceTimersByTimeAsync(100)
    expect(await result).toBe(false)
  })
  it('times out cleanly if Pixel is blocked', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('document', { cookie: 'sn_consent=a1m1' })
    const result = waitForMarketingTag('fbq', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(10000)
    expect(await result).toBe(false); expect(vi.getTimerCount()).toBe(0)
  })
})
