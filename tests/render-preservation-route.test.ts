import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), render: vi.fn(), eq: vi.fn(), select: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: () => ({ select: mocks.select }) }) }))
import { GET } from '@/app/api/renders/[renderId]/preservation/route'
const id = 'd355992f-b666-4e33-92f1-e38a485f652a'
const params = { params: Promise.resolve({ renderId: id }) }
const req = () => new NextRequest(`https://spacenode.app/api/renders/${id}/preservation`)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } } })
  mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.render })
  mocks.render.mockResolvedValue({ data: { generation_log: { fidelity: { semantic_audit_status: 'pending' } } }, error: null })
})
describe('private render audit endpoint', () => {
  it('rejects malformed IDs before querying authentication or data', async () => {
    expect((await GET(req(), { params: Promise.resolve({ renderId: 'invalid' }) })).status).toBe(400)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })
  it('requires a signed-in user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET(req(), params)).status).toBe(401)
    expect(mocks.select).not.toHaveBeenCalled()
  })
  it('does not expose a render hidden by session RLS', async () => {
    mocks.render.mockResolvedValue({ data: null, error: null })
    expect((await GET(req(), params)).status).toBe(404)
  })
  it('keeps database failures distinct from a skipped audit', async () => {
    mocks.render.mockResolvedValue({ data: null, error: { message: 'private detail' } })
    const response = await GET(req(), params)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private detail')
  })
  it('returns only a non-cacheable public outcome for the selected render', async () => {
    const response = await GET(req(), params)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ status: 'pending', warning: false, materialsPassed: false })
    expect(mocks.select).toHaveBeenCalledWith('generation_log')
    expect(mocks.eq).toHaveBeenCalledWith('id', id)
  })
})
