import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mock = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), upload: vi.fn(), generate: vi.fn(), insert: vi.fn() }))
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: vi.fn() }))
vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), storage: { upload: mock.upload } } }))
vi.mock('@/lib/auth/request-user', () => ({ getRequestUser: vi.fn(async () => ({ user: { id: 'test-user' } })) }))
vi.mock('@/lib/workspaces/context', () => ({ getPayerId: vi.fn(async () => 'test-user') }))
vi.mock('@/lib/billing/refund-nodes', () => ({ refundNodes: vi.fn() }))
vi.mock('@/lib/analytics/activation', () => ({ trackSecondTool: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => {
  const query = {
    insert: mock.insert,
    select: () => query,
    eq: () => query,
    single: async () => ({ data: { id: 'render-id', plan_balance: 500, total_balance: 500 }, error: null }),
  }
  mock.insert.mockReturnValue(query)
  return { rpc: mock.rpc, from: () => query }
} }))
vi.mock('@/lib/storage/direct-upload', () => ({ DIRECT_UPLOAD_AREAS: { 'animar-source': {} }, downloadDirectUpload: mock.download }))
vi.mock('@/lib/video/adapters', () => ({ getAdapterForModel: () => ({ isAvailable: () => true, generate: mock.generate }) }))
import { POST } from '@/app/api/video/route'

const engine = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'
describe('harness no fluxo de geração e histórico', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.rpc.mockResolvedValue({ error: null })
    mock.download.mockResolvedValue({ ok: true, buffer: Buffer.from('image'), mime: 'image/png' })
    mock.upload.mockResolvedValue('https://reference.invalid/image.png')
    mock.generate.mockResolvedValue({ outputUrl: 'https://reference.invalid/video.mp4', requestId: 'request-id', provider: 'fal' })
  })

  async function run(configuration: Record<string, string>) {
    const response = await POST(new NextRequest('http://localhost/api/video', {
      method: 'POST', body: JSON.stringify({ sourceKey: 'source.png', engine, duration: '5', ...configuration }),
    }))
    expect(response.status).toBe(200)
    return await response.json()
  }

  it('câmera fixa chega fixa ao provider e registra versão do harness', async () => {
    const result = await run({ cameraMotion: 'static-ambient', intensity: 'pronounced' })
    expect(mock.generate.mock.calls[0][0].prompt).toContain('zero translation, rotation or zoom')
    expect(mock.insert.mock.calls[0][0].config_snapshot).toMatchObject({
      camera_motion: 'static-ambient', take_policy: { version: 'architectural-take-v1', framing_budget_pct: 0 },
    })
    expect(result).toMatchObject({ cameraMotion: 'static-ambient', takePolicy: 'architectural-take-v1' })
  })

  it.each([
    ['walkthrough-interior', 'dolly-in-soft'], ['enter-room', 'dolly-in-soft'], ['drone-soft', 'facade-reveal'],
  ])('movimento %s registra movimento efetivo %s sem trocar motor ou custo', async (cameraMotion, effective) => {
    const result = await run({ cameraMotion })
    expect(result.cameraMotion).toBe(effective)
    expect(mock.generate.mock.calls[0][0].modelId).toBe(engine)
    expect(mock.insert.mock.calls[0][0].config_snapshot).toMatchObject({
      camera_motion: effective, requested_camera_motion: cameraMotion,
    })
  })

  it('caminho antigo conserva duração, frame final e exclusão de pessoas', async () => {
    await run({ scene: 'kitchen', duration: '10', endKey: 'end.png', avoidPeople: '1' })
    const request = mock.generate.mock.calls[0][0]
    expect(request.prompt).toContain('full 10-second clip')
    expect(request.prompt).toContain('END FRAME:')
    expect(request.prompt).toContain('Keep the scene unpopulated')
    expect(request.endImageUrl).toBe('https://reference.invalid/image.png')
    expect(mock.insert.mock.calls[0][0].config_snapshot.take_policy.reference_mode).toBe('start-end')
  })

  it.each(['prompt', 'atmosphere'])('rejeita %s extenso antes de upload ou débito', async field => {
    const response = await POST(new NextRequest('http://localhost/api/video', {
      method: 'POST', body: JSON.stringify({ sourceKey: 'source.png', engine, [field]: 'x'.repeat(2500) }),
    }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('longa demais')
    expect(mock.download).not.toHaveBeenCalled()
    expect(mock.upload).not.toHaveBeenCalled()
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.generate).not.toHaveBeenCalled()
  })
})
