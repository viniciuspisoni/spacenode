import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mock = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), available: vi.fn(() => true) }))
vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), storage: { upload: vi.fn() } } }))
vi.mock('@/lib/auth/request-user', () => ({ getRequestUser: vi.fn(async () => ({ user: { id: 'test-user' } })) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mock.rpc }) }))
vi.mock('@/lib/storage/direct-upload', () => ({ DIRECT_UPLOAD_AREAS: { 'animar-source': {} }, downloadDirectUpload: mock.download }))
vi.mock('@/lib/video/adapters', () => ({ getAdapterForModel: () => ({ isAvailable: mock.available }) }))
import { POST } from '@/app/api/video/route'

describe('validação anterior ao débito', () => {
  beforeEach(() => { vi.clearAllMocks(); mock.available.mockReturnValue(true) })

  it.each([
    { engine: 'constructor', duration: '5' },
    { engine: 'fal-ai/veo3.1/image-to-video', duration: '4' },
    { engine: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', duration: '5', resolution: '4k' },
    { engine: 'fal-ai/veo3.1/image-to-video', duration: '8', endKey: 'end.jpg' },
  ])('rejeita configuração incompatível sem upload ou cobrança: %j', async configuration => {
    const response = await POST(new NextRequest('http://localhost/api/video', {
      method: 'POST', body: JSON.stringify({ sourceKey: 'source.jpg', ...configuration }),
    }))
    expect(response.status).toBe(400)
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.download).not.toHaveBeenCalled()
  })

  it('provider sem credencial não debita nem baixa imagem', async () => {
    mock.available.mockReturnValue(false)
    const response = await POST(new NextRequest('http://localhost/api/video', {
      method: 'POST', body: JSON.stringify({ sourceKey: 'source.jpg', duration: '5' }),
    }))
    expect(response.status).toBe(503)
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.download).not.toHaveBeenCalled()
  })
})
