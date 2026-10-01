import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMetaPurchase, metaConversionsAdapter, metaConversionsConfigured } from '@/lib/analytics/adapters/meta-conversions'
import { forwardServerEvent, type ServerAdapterEvent } from '@/lib/analytics/server-adapters'
import { attributionToStripeMetadata, attributionFromStripeMetadata } from '@/lib/analytics/stripe-metadata'

const base: ServerAdapterEvent = {
  event: 'subscription_started', userId: 'user-1', anonymousId: null, planId: 'essence',
  valueCents: 9900, page: null, occurredAt: null, dedupeKey: 'subscription:sub-1',
  consent: 'granted', props: { currency: 'brl' }, fbc: 'fb.1.1790890025575.click_id',
  fbp: 'fb.1.1790890025575.1234567',
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('confirmed first paid subscription for Meta', () => {
  it('uses amount actually charged, stable subscription id and hashed identity', () => {
    const p = buildMetaPurchase(base)!
    expect(p.event_name).toBe('Purchase')
    expect(p.event_id).toBe('subscription:sub-1')
    expect(p.custom_data).toMatchObject({ value: 99, currency: 'BRL', content_ids: ['essence'] })
    expect(p.user_data.external_id[0]).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(p)).not.toContain('user-1')
    expect(p.user_data.fbc).toBe(base.fbc)
    expect(p.user_data.fbp).toBe(base.fbp)
    expect(p).not.toHaveProperty('test_event_code')
  })
  it.each(['unknown', 'denied'] as const)('does not send without marketing consent: %s', consent => {
    expect(buildMetaPurchase({ ...base, consent })).toBeNull()
  })
  it.each([0, -1, null, NaN, Infinity, 1.5])('does not turn non-paid or invalid amount %s into acquisition', valueCents => {
    expect(buildMetaPurchase({ ...base, valueCents })).toBeNull()
  })
  it('ignores checkout, credits, renewals and missing payment identifiers', () => {
    expect(buildMetaPurchase({ ...base, event: 'checkout_completed' })).toBeNull()
    expect(buildMetaPurchase({ ...base, event: 'checkout_started' })).toBeNull()
    expect(buildMetaPurchase({ ...base, dedupeKey: 'renewal:invoice1' })).toBeNull()
    expect(buildMetaPurchase({ ...base, dedupeKey: null })).toBeNull()
    expect(buildMetaPurchase({ ...base, props: {} })).toBeNull()
  })
  it('uses fact timestamp and rejects stale or future replay', () => {
    const now = Date.UTC(2026, 9, 1)
    expect(buildMetaPurchase({ ...base, occurredAt: new Date(now - 60000).toISOString() }, now)?.event_time).toBe(now / 1000 - 60)
    expect(buildMetaPurchase({ ...base, occurredAt: 'invalid' }, now)).toBeNull()
    expect(buildMetaPurchase({ ...base, occurredAt: new Date(now - 8 * 86400000).toISOString() }, now)).toBeNull()
    expect(buildMetaPurchase({ ...base, occurredAt: new Date(now + 120000).toISOString() }, now)).toBeNull()
  })
  it('strips hostile browser cookie values', () => {
    expect(buildMetaPurchase({ ...base, fbc: 'bad', fbp: 'https://evil.example' })?.user_data).toEqual({ external_id: expect.any(Array) })
  })
})
describe('matching metadata across checkout and webhook', () => {
  it('keeps Meta browser ids only with granted consent, including long click IDs', () => {
    const fbc = 'fb.1.1790890025575.' + 'x'.repeat(300)
    const meta = attributionToStripeMetadata({ consent: 'granted', fbc, fbp: base.fbp })
    expect(meta.sn_fbc).toBe(fbc)
    expect(attributionFromStripeMetadata(meta)).toMatchObject({ consent: 'granted', fbc, fbp: base.fbp })
    for (const consent of ['denied', 'unknown'] as const) {
      const denied = attributionToStripeMetadata({ consent, fbc, fbp: base.fbp })
      expect(denied).not.toHaveProperty('sn_fbc')
      expect(denied).not.toHaveProperty('sn_fbp')
      expect(attributionFromStripeMetadata({ ...meta, consent })).not.toHaveProperty('fbc')
    }
  })
})
describe('Meta transport stays outside fulfillment', () => {
  function configure() {
    vi.stubEnv('META_CAPI_ENABLED', 'true')
    vi.stubEnv('META_CAPI_ACCESS_TOKEN', 'test-secret')
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '1118003564247575')
  }
  it('requires all configuration, including explicit enablement', () => {
    expect(metaConversionsConfigured()).toBe(false)
    configure(); expect(metaConversionsConfigured()).toBe(true)
    vi.stubEnv('META_CAPI_ENABLED', 'false'); expect(metaConversionsConfigured()).toBe(false)
  })
  it('sends a server-side authorized event and never puts secret in URL', async () => {
    configure()
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ events_received: 1 })))
    vi.stubGlobal('fetch', fetcher)
    await forwardServerEvent(base)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v23.0/1118003564247575/events')
    expect(url).not.toContain('test-secret')
    expect(options.headers.Authorization).toBe('Bearer test-secret')
    expect(JSON.parse(options.body).data).toHaveLength(1)
  })
  it('never sends denied or unknown consent', async () => {
    configure()
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await forwardServerEvent({ ...base, consent: 'denied' })
    await forwardServerEvent({ ...base, consent: 'unknown' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('retries temporary failure with same event id', async () => {
    configure()
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ events_received: 1 })))
    vi.stubGlobal('fetch', fetcher)
    await metaConversionsAdapter.send(base)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body)
  })
  it('does not retry auth errors or leak them into Stripe fulfillment', async () => {
    configure()
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetcher)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(forwardServerEvent(base)).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls.flat().join(' ')).not.toContain('test-secret')
  })
})

