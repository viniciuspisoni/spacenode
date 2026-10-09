import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobRowWithMeta } from '@/lib/blocos3d/reconcile'

const provider = vi.hoisted(() => vi.fn())
const rehost = vi.hoisted(() => vi.fn())
const refund = vi.hoisted(() => vi.fn())
vi.mock('@/lib/blocos3d/provider', () => ({ getProviderTask: provider, TaskGoneError: class extends Error {} }))
vi.mock('@/lib/blocos3d/rehost', () => ({ rehostProviderOutputs: rehost, InvalidGlbError: class extends Error {} }))
vi.mock('@/lib/billing/refund-nodes', () => ({ refundNodes: refund }))

import { reconcileBlocos3DJob } from '@/lib/blocos3d/reconcile'

function job(ageMs = 3 * 60_000): JobRowWithMeta {
  return {
    id: '00000000-0000-0000-0000-000000000001', user_id: 'user',
    status: 'processing', provider: 'fal', engine: 'tripo3d/h3.1/image-to-3d',
    provider_task_id: 'request', charged: true, refunded: false, nodes_cost: 190,
    progress: 0, created_at: new Date(Date.now() - ageMs).toISOString(),
    options: {},
  } as JobRowWithMeta
}

function adminFor(initial: JobRowWithMeta) {
  const current = { ...initial }
  function query() {
    let patch: Record<string, unknown> | null = null
    let expectedStatus: string | null = null
    return {
      update(value: Record<string, unknown>) { patch = value; return this },
      select() { return this },
      eq(column: string, value: unknown) {
        if (column === 'status') expectedStatus = String(value)
        return this
      },
      async maybeSingle() { return { data: { ...current }, error: null } },
      async then(resolve: (value: unknown) => void) {
        const claimed = patch && (!expectedStatus || current.status === expectedStatus)
        if (claimed) Object.assign(current, patch)
        resolve({ data: claimed ? [{ ...current }] : [], error: null })
      },
    }
  }
  return { client: { from: () => query() } as never, current }
}

describe('reconciliação do Blocos 3D sem a tela aberta', () => {
  beforeEach(() => { vi.clearAllMocks(); refund.mockResolvedValue(true) })

  it('só conclui após persistir o GLB', async () => {
    const previous = job()
    const { client, current } = adminFor(previous)
    provider.mockResolvedValue({ status: 'succeeded', modelUrls: { glb: 'https://fal.media/model.glb' }, thumbnailUrl: null })
    rehost.mockResolvedValue({ modelKeys: { glb: 'user/blocos3d/modelo.glb' }, thumbnailKey: null, originalGlbKey: null })
    const result = await reconcileBlocos3DJob(client, previous)
    expect(result.status).toBe('completed')
    expect(current.model_glb_key).toBe('user/blocos3d/modelo.glb')
    expect(refund).not.toHaveBeenCalled()
  })

  it('mantém processamento quando o GLB ainda não foi salvo', async () => {
    const previous = job()
    const { client } = adminFor(previous)
    provider.mockResolvedValue({ status: 'succeeded', modelUrls: { glb: 'https://fal.media/model.glb' }, thumbnailUrl: null })
    rehost.mockResolvedValue({ modelKeys: {}, thumbnailKey: null, originalGlbKey: null })
    expect((await reconcileBlocos3DJob(client, previous)).status).toBe('processing')
    expect(refund).not.toHaveBeenCalled()
  })

  it('encerra job vencido e estorna uma única vez mesmo com polls repetidos', async () => {
    const previous = job(65 * 60_000)
    const { client, current } = adminFor(previous)
    provider.mockRejectedValue(new Error('fal 503'))
    const first = await reconcileBlocos3DJob(client, previous)
    await reconcileBlocos3DJob(client, previous)
    expect(first.status).toBe('failed')
    expect(current.refunded).toBe(true)
    expect(refund).toHaveBeenCalledTimes(1)
    expect(refund).toHaveBeenCalledWith(client, 'user', 190, expect.objectContaining({ jobId: previous.id }))
  })
})
