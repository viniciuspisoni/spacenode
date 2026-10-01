import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { parseRenderFeedback } from '@/lib/render-feedback'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), render: vi.fn(), existing: vi.fn(), upsert: vi.fn(), rateLimit: vi.fn(),
}))
vi.mock('@/lib/auth/request-user', () => ({ getRequestUser: mocks.getUser }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => table === 'renders'
      ? { select: () => ({ eq: () => ({ maybeSingle: mocks.render }) }) }
      : { select: () => ({ eq: () => ({ maybeSingle: mocks.existing }) }), upsert: mocks.upsert },
  }),
}))
import { GET, POST } from '@/app/api/renders/[renderId]/feedback/route'

const id = 'c25ac18f-8f83-4e7a-84d1-b31d53e24382'
const params = { params: Promise.resolve({ renderId: id }) }
const url = `https://spacenode.app/api/renders/${id}/feedback`
function post(body: unknown, origin = 'https://spacenode.app') {
  return new NextRequest(url, { method: 'POST',
    headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ user: { id: 'owner' } })
  mocks.render.mockResolvedValue({ data: { user_id: 'owner', status: 'completed', ambient: 'interior', output_url: 'https://example.com/result.png', is_internal_test: false }, error: null })
  mocks.existing.mockResolvedValue({ data: null, error: null })
  mocks.upsert.mockResolvedValue({ error: null })
  mocks.rateLimit.mockResolvedValue({ allowed: true, count: 1 })
})

describe('avaliação de render', () => {
  it('aceita somente resposta curta com motivo conhecido', () => {
    expect(parseRenderFeedback({ useful: true })).toEqual({ useful: true, reason: null })
    expect(parseRenderFeedback({ useful: false, reason: 'geometry' })).toEqual({ useful: false, reason: 'geometry' })
    expect(parseRenderFeedback({ useful: true, reason: 'geometry' })).toBeNull()
    expect(parseRenderFeedback({ useful: false, reason: 'prompt' })).toBeNull()
    expect(parseRenderFeedback({ useful: false, email: 'x@example.com' })).toBeNull()
  })

  it('não grava avaliação de render de outra pessoa', async () => {
    mocks.render.mockResolvedValue({ data: { user_id: 'other', status: 'completed', ambient: 'interior', output_url: 'https://example.com/result.png' }, error: null })
    expect((await POST(post({ useful: false }), params)).status).toBe(404)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('não grava render incompleto ou operação de vídeo', async () => {
    mocks.render.mockResolvedValue({ data: { user_id: 'owner', status: 'failed', ambient: 'interior', output_url: null }, error: null })
    expect((await POST(post({ useful: true }), params)).status).toBe(404)
    mocks.render.mockResolvedValue({ data: { user_id: 'owner', status: 'completed', ambient: 'video', output_url: 'https://example.com/video.mp4' }, error: null })
    expect((await POST(post({ useful: true }), params)).status).toBe(404)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('exige origem da própria plataforma', async () => {
    expect((await POST(post({ useful: true }, 'https://evil.example'), params)).status).toBe(403)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('salva a escolha sem aceitar identidade ou imagem do navegador', async () => {
    const response = await POST(post({ useful: false, reason: 'materials' }), params)
    expect(response.status).toBe(200)
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      render_id: id, user_id: 'owner', useful: false, reason: 'materials',
    }), { onConflict: 'render_id' })
    expect(await response.json()).toEqual({ feedback: { useful: false, reason: 'materials' } })
  })

  it('leitura não retorna dados de outro usuário', async () => {
    mocks.render.mockResolvedValue({ data: { user_id: 'other', status: 'completed', ambient: 'interior', output_url: 'https://example.com/result.png' }, error: null })
    expect((await GET(new NextRequest(url), params)).status).toBe(404)
    expect(mocks.existing).not.toHaveBeenCalled()
  })
})
