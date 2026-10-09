import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ callbacks: [] as (() => Promise<void>)[], insert: vi.fn() }))
vi.mock('next/server', () => ({ after: (callback: () => Promise<void>) => mocks.callbacks.push(callback) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }) }))
import { observeApiCall } from '@/lib/costs/observe'
beforeEach(() => { mocks.callbacks.length = 0; mocks.insert.mockReset().mockResolvedValue({ error: null }); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co') })
const meta = { provider: 'ark', endpoint: 'seedream', context: 'generate' }
describe('non-blocking call observation', () => {
  it('registers a late losing branch before completion and preserves the original promise', async () => {
    let resolve!: (value: { requestId: string }) => void
    const pending = new Promise<{ requestId: string }>(r => { resolve = r })
    const returned = observeApiCall(meta, () => pending, value => ({ requestId: value.requestId, usd: 0.09 }))
    expect(returned).toBe(pending); expect(mocks.callbacks).toHaveLength(1); expect(mocks.insert).not.toHaveBeenCalled()
    resolve({ requestId: 'paid-losing-branch' }); await returned; await mocks.callbacks[0]()
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ request_id: 'paid-losing-branch', estimated_usd: 0.09 }))
  })
  it('passes failures through and records no raw error or zero price', async () => {
    const error = new Error('secret prompt or image URL')
    await expect(observeApiCall(meta, () => Promise.reject(error))).rejects.toBe(error)
    await mocks.callbacks[0]()
    const recorded = mocks.insert.mock.calls[0][0]
    expect(recorded.status).toBe('failed'); expect(recorded.estimated_usd).toBeNull(); expect(JSON.stringify(recorded)).not.toContain('secret')
  })
  it('never makes a successful delivery fail because an estimator or persistence failed', async () => {
    mocks.insert.mockRejectedValue(new Error('database unavailable'))
    await expect(observeApiCall(meta, () => Promise.resolve('image'), () => { throw new Error('estimate') })).resolves.toBe('image')
    await expect(mocks.callbacks[0]()).resolves.toBeUndefined()
  })
})
