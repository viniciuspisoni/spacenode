import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ gate: vi.fn(), load: vi.fn(), upsert: vi.fn() }))
vi.mock('@/lib/marketing/api', () => ({ staffOr404: mocks.gate }))
vi.mock('@/lib/costs/service', () => ({ loadCostsDashboard: mocks.load }))
import { GET } from '@/app/api/admin/costs/route'
import { POST } from '@/app/api/admin/costs/invoices/route'
beforeEach(() => { mocks.load.mockReset().mockResolvedValue({ month: '2026-10' }); mocks.upsert.mockReset().mockResolvedValue({ error: null }); mocks.gate.mockReset().mockResolvedValue({ ok: true, ctx: { user: { id: 'staff' }, admin: { from: () => ({ upsert: mocks.upsert }) } } }) })
const post = (body: unknown, origin = 'https://spacenode.app') => new Request('https://spacenode.app/api/admin/costs/invoices', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
const invoice = { provider: 'fal', month: '2026-10', currency: 'USD', amount: 123, note: '' }
describe('staff financial routes', () => {
  it('never reads or writes for a nonstaff visitor', async () => {
    mocks.gate.mockResolvedValue({ ok: false, res: new Response('not found', { status: 404 }) })
    expect((await GET(new Request('https://spacenode.app/api/admin/costs?month=2026-10'))).status).toBe(404)
    expect((await POST(post(invoice))).status).toBe(404); expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('validates the month and prevents caching financial data', async () => {
    expect((await GET(new Request('https://spacenode.app/api/admin/costs?month=2026-99'))).status).toBe(400)
    expect((await GET(new Request('https://spacenode.app/api/admin/costs?month=2026-10'))).headers.get('cache-control')).toContain('no-store')
  })
  it('rejects cross-origin invoice mutations', async () => {
    expect((await POST(post(invoice, 'https://other.example'))).status).toBe(403); expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('rejects invalid monetary values but allows a genuine zero invoice', async () => {
    for (const amount of [null, '', -1, '100', 1000001]) expect((await POST(post({ ...invoice, amount }))).status).toBe(400)
    expect((await POST(post({ ...invoice, amount: 0 }))).status).toBe(200)
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ amount: 0 }), { onConflict: 'provider,month' })
  })
})
