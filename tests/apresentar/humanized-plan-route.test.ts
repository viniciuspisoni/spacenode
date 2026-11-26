import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getRequestUser: vi.fn(), createAdminClient: vi.fn(), downloadDirectUpload: vi.fn(),
  upload: vi.fn(), getPayerId: vi.fn(), refundNodes: vi.fn(),
  generateImage: vi.fn(), seedreamRoute: vi.fn(), readHumanizedPlan: vi.fn(),
  composePlanLabels: vi.fn(), measurePlanLineRecall: vi.fn(), fetchStorageBuffer: vi.fn(),
}))

vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), storage: { upload: mocks.upload } } }))
vi.mock('@/lib/auth/request-user', () => ({ getRequestUser: mocks.getRequestUser }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/storage/direct-upload', () => ({ DIRECT_UPLOAD_AREAS: { 'render-source': {} }, downloadDirectUpload: mocks.downloadDirectUpload }))
vi.mock('@/lib/workspaces/context', () => ({ getPayerId: mocks.getPayerId }))
vi.mock('@/lib/billing/refund-nodes', () => ({ refundNodes: mocks.refundNodes }))
vi.mock('@/lib/ai/image-provider', () => ({ generateImage: mocks.generateImage, seedreamRoute: mocks.seedreamRoute }))
vi.mock('@/lib/apresentar/plan-reader', () => ({ readHumanizedPlan: mocks.readHumanizedPlan, composePlanLabels: mocks.composePlanLabels }))
vi.mock('@/lib/apresentar/plan-line-score', () => ({ measurePlanLineRecall: mocks.measurePlanLineRecall }))
vi.mock('@/lib/storage/fetch', () => ({ fetchStorageBuffer: mocks.fetchStorageBuffer }))

import { POST } from '@/app/api/apresentar/humanized-plan/route'

const sourceUrl = 'https://example.test/source.png'
const generatedUrl = 'https://example.test/generated.png'
const labeledUrl = 'https://example.test/labeled.png'
const previousV2 = process.env.HUMANIZED_PLAN_V2
const previousArkKey = process.env.ARK_API_KEY
const previousGate = process.env.HUMANIZED_PLAN_FIDELITY_GATE

function request() {
  return new NextRequest('https://example.test/api/apresentar/humanized-plan', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceKey: 'owned-source-key', level: 'equilibrado' }),
  })
}

describe('humanized plan route cost and failure behavior', () => {
  let insert: ReturnType<typeof vi.fn>
  let rpc: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.HUMANIZED_PLAN_V2 = '1'
    process.env.ARK_API_KEY = 'test-key'
    delete process.env.HUMANIZED_PLAN_FIDELITY_GATE
    const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: 'white' } }).png().toBuffer()
    rpc = vi.fn().mockResolvedValue({ error: null })
    insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'render-1' }, error: null }) }) })
    const admin = {
      rpc,
      from: vi.fn((table: string) => table === 'renders'
        ? { insert }
        : { select: () => ({ eq: () => ({ single: async () => ({ data: { total_balance: 80, plan_balance: 80, lumen_balance: 0 } }) }) }) }),
    }
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.getRequestUser.mockResolvedValue({ user: { id: 'user-1' } })
    mocks.downloadDirectUpload.mockResolvedValue({ ok: true, buffer: png, mime: 'image/png' })
    mocks.upload.mockResolvedValue(sourceUrl)
    mocks.seedreamRoute.mockReturnValue('ark')
    mocks.getPayerId.mockResolvedValue('user-1')
    mocks.readHumanizedPlan.mockResolvedValue({ projectType: 'casa', existingLabels: false, rooms: [{ name: 'Sala', x: 0.5, y: 0.5, confidence: 0.9 }] })
    mocks.generateImage.mockResolvedValue({ images: [{ url: generatedUrl }], provider: 'ark', providerModel: 'seedream', requestId: 'provider-1', fallbackUsed: false, latencyMs: 100, errorMessage: null })
    mocks.fetchStorageBuffer.mockResolvedValue(png)
    mocks.measurePlanLineRecall.mockResolvedValue({ recall: 0.8, structuralPixels: 100 })
    mocks.composePlanLabels.mockResolvedValue(labeledUrl)
  })

  afterEach(() => {
    if (previousV2 === undefined) delete process.env.HUMANIZED_PLAN_V2
    else process.env.HUMANIZED_PLAN_V2 = previousV2
    if (previousArkKey === undefined) delete process.env.ARK_API_KEY
    else process.env.ARK_API_KEY = previousArkKey
    if (previousGate === undefined) delete process.env.HUMANIZED_PLAN_FIDELITY_GATE
    else process.env.HUMANIZED_PLAN_FIDELITY_GATE = previousGate
  })

  it('charges 20 nodes, generates once in the low tier without fallback and saves labeled output', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ url: labeledUrl, nodesCharged: 20, format: 'png', renderId: 'render-1' })
    expect(rpc).toHaveBeenCalledWith('consume_workspace_nodes', { user_id_input: 'user-1', amount: 20 })
    expect(mocks.generateImage).toHaveBeenCalledTimes(1)
    const args = mocks.generateImage.mock.calls[0][0]
    expect(args).toMatchObject({ falEndpoint: 'bytedance/seedream/v5/pro/edit', allowFallback: false, falInput: { image_urls: [sourceUrl], num_images: 1, output_format: 'png' } })
    expect(args.falInput.image_size.width * args.falInput.image_size.height).toBeLessThanOrEqual(1536 * 1536)
    expect(args.falInput.image_size.width * args.falInput.image_size.height).toBeGreaterThanOrEqual(1024 * 1024)
    expect(mocks.composePlanLabels).toHaveBeenCalledWith(generatedUrl, 400, 300, expect.anything(), 'user-1')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ engine: 'quasar', nodes_charged: 20, output_url: labeledUrl, config_snapshot: expect.objectContaining({ harness: 'v2_ark_low_tier' }) }))
    expect(mocks.refundNodes).not.toHaveBeenCalled()
  })

  it('refunds all nodes when the single provider attempt fails', async () => {
    mocks.generateImage.mockRejectedValueOnce(new Error('provider unavailable'))
    const response = await POST(request())
    expect(response.status).toBe(500)
    expect(mocks.generateImage).toHaveBeenCalledTimes(1)
    expect(mocks.refundNodes).toHaveBeenCalledWith(expect.anything(), 'user-1', 20, { module: 'apresentar/humanized-plan' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('continues with automatic defaults when the plan reader is unavailable', async () => {
    mocks.readHumanizedPlan.mockRejectedValueOnce(new Error('vision unavailable'))
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.generateImage).toHaveBeenCalledTimes(1)
    expect(mocks.composePlanLabels).not.toHaveBeenCalled()
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ config_snapshot: expect.objectContaining({ projectType: 'auto' }) }))
  })

  it('does not generate or refund when balance rejects the debit', async () => {
    rpc.mockResolvedValueOnce({ error: { code: 'P0001' } })
    const response = await POST(request())
    expect(response.status).toBe(402)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.generateImage).not.toHaveBeenCalled()
    expect(mocks.refundNodes).not.toHaveBeenCalled()
  })

  it('retains the one-attempt legacy path when the pilot is off', async () => {
    delete process.env.HUMANIZED_PLAN_V2
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ nodesCharged: 20, format: 'jpg' })
    expect(mocks.generateImage).toHaveBeenCalledTimes(1)
    expect(mocks.generateImage.mock.calls[0][0]).toMatchObject({ falEndpoint: 'fal-ai/nano-banana-pro/edit', falInput: { resolution: '2K', output_format: 'jpeg' } })
    expect(mocks.composePlanLabels).not.toHaveBeenCalled()
  })
})
