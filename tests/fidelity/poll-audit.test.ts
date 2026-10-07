import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizePublicAudit, pollRenderAudit } from '@/lib/ai/fidelity/poll-audit'

const pending = { status: 'pending', warning: false, materialsPassed: false }
const changed = { status: 'completed', warning: true, materialsPassed: false }
const passed = { status: 'completed', warning: false, materialsPassed: true }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('audit polling resilience', () => {
  it('follows a deferred audit and stops at its real warning', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(pending)).mockResolvedValueOnce(reply(changed))
    const onPending = vi.fn()
    const result = pollRenderAudit('render-id', { signal: new AbortController().signal, onPending, fetcher })
    await vi.runAllTimersAsync()
    expect(await result).toEqual(changed)
    expect(onPending).toHaveBeenCalledWith(pending)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][0]).toBe('/api/renders/render-id/preservation')
    expect(fetcher.mock.calls[0][1]?.cache).toBe('no-store')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([429, 503])('recovers from temporary HTTP %i without losing the audit', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply({}, status)).mockResolvedValueOnce(reply(passed))
    const result = pollRenderAudit('id', { signal: new AbortController().signal, onPending: vi.fn(), fetcher })
    await vi.runAllTimersAsync()
    expect(await result).toEqual(passed)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('recovers after a dropped connection', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('network offline')).mockResolvedValueOnce(reply(changed))
    const result = pollRenderAudit('id', { signal: new AbortController().signal, onPending: vi.fn(), fetcher })
    await vi.runAllTimersAsync()
    expect(await result).toEqual(changed)
  })

  it.each([401, 404])('does not repeatedly request a permanent HTTP %i failure', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({}, status))
    const result = await pollRenderAudit('id', { signal: new AbortController().signal, onPending: vi.fn(), fetcher })
    expect(result?.status).toBe('unavailable')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('caps repeated failures and does not turn invalid approval JSON into success', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => reply({ status: 'completed', warning: 'false', materialsPassed: 'true' }))
    const result = pollRenderAudit('id', { signal: new AbortController().signal, onPending: vi.fn(), fetcher })
    await vi.runAllTimersAsync()
    expect((await result)?.status).toBe('unavailable')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('limits audits that stay pending forever', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => reply(pending))
    const result = pollRenderAudit('id', { signal: new AbortController().signal, onPending: vi.fn(), fetcher })
    await vi.runAllTimersAsync()
    expect((await result)?.status).toBe('unavailable')
    expect(fetcher).toHaveBeenCalledTimes(30)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out hanging requests even if the transport ignores cancellation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}))
    const result = pollRenderAudit('id', { signal: new AbortController().signal, onPending: vi.fn(), fetcher })
    await vi.runAllTimersAsync()
    expect((await result)?.status).toBe('unavailable')
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls.every(call => call[1]?.signal?.aborted)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a network request and ignores its stale result after switching renders', async () => {
    let deliver: (response: Response) => void = () => {}
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { deliver = resolve }))
    const controller = new AbortController()
    const onPending = vi.fn()
    const result = pollRenderAudit('old-render', { signal: controller.signal, onPending, fetcher })
    controller.abort()
    expect(await result).toBeNull()
    deliver(reply(changed))
    await vi.runAllTimersAsync()
    expect(onPending).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the delay before another request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => reply(pending))
    const controller = new AbortController()
    const result = pollRenderAudit('id', { signal: controller.signal, onPending: vi.fn(), fetcher })
    await vi.advanceTimersByTimeAsync(1)
    controller.abort()
    expect(await result).toBeNull()
    await vi.runAllTimersAsync()
    expect(fetcher).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start an already-cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn<typeof fetch>()
    expect(await pollRenderAudit('id', { signal: controller.signal, onPending: vi.fn(), fetcher })).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('public audit payload checks', () => {
  it.each([null, {}, { ...passed, status: 'unknown' }, { ...passed, warning: 'false' }])('rejects malformed responses %j', value => {
    expect(normalizePublicAudit(value)).toBeNull()
  })
  it('does not approve pending checks or contradictory warnings', () => {
    expect(normalizePublicAudit({ ...pending, materialsPassed: true })?.materialsPassed).toBe(false)
    expect(normalizePublicAudit({ ...changed, materialsPassed: true })?.materialsPassed).toBe(false)
  })
})
