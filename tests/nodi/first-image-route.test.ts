import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { POST } from '@/app/api/nodi/first-image/route'
import { POST as observe } from '@/app/api/nodi/first-image/observe/route'
import { sealUpload } from '@/lib/nodi/v2/uploads'
import { sealPilotReceipt } from '@/lib/nodi/first-image/receipt'
import { pilotPreparation } from '@/lib/nodi/first-image/contract'
import { PilotRunError } from '@/lib/nodi/first-image/failure'

const mock = vi.hoisted(() => ({
  user: { id: 'owner' } as { id: string } | null, enabled: true, budget: 'allowed', private: true,
  list: vi.fn(), download: vi.fn(), agent: vi.fn(), log: vi.fn(), render: vi.fn(), renderOwner: vi.fn(), checkBudget: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mock.user } }) },
  from: () => ({ select: () => ({ eq: () => ({ eq: (key: string, value: string) => { mock.renderOwner(key, value); return { maybeSingle: mock.render } } }) }) }),
}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: {
  getBucket: async () => ({ data: { public: !mock.private }, error: null }), from: () => ({ list: mock.list, download: mock.download }),
} }) }))
vi.mock('@/lib/nodi/first-image/access', () => ({ canUseFirstImagePilot: async () => mock.enabled }))
vi.mock('@/lib/nodi/first-image/budget', () => ({ checkPilotBudget: (...args: unknown[]) => { mock.checkBudget(...args); return mock.budget } }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/nodi/telemetry', () => ({ logNodiEvent: mock.log }))
vi.mock('@/lib/nodi/first-image/agent', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/nodi/first-image/agent')>(), runFirstImagePilot: mock.agent }))
const caseId = '00000000-0000-4000-8000-000000000001', requestId = '00000000-0000-4000-8000-000000000002'
const key = 'owner/nodi/source/' + 'a'.repeat(32) + '.png'
const context = { projectType: 'exterior' as const, goal: 'presentation' as const, referenceKind: 'model' as const, qa: true }
const request = (body: unknown) => new Request('https://spacenode.app/api/nodi/first-image', { method: 'POST', headers: { Origin: 'https://spacenode.app', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const input = () => ({ variant: 'grok', caseId, message: 'Apresentar ao cliente', attachmentId: sealUpload('owner', key), context, history: [] })
const receipt = (owner = 'owner') => sealPilotReceipt({ userId: owner, caseId, requestId, variant: 'grok', qa: true })
beforeEach(async () => {
  vi.stubEnv('NODI_ACTION_SECRET', 'pilot-route-test')
  Object.assign(mock, { user: { id: 'owner' }, enabled: true, budget: 'allowed', private: true })
  vi.clearAllMocks()
  const image = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#ddd' } }).png().toBuffer()
  mock.list.mockResolvedValue({ data: [{ name: 'a'.repeat(32) + '.png', metadata: { size: image.length, mimetype: 'image/png' } }], error: null })
  mock.download.mockResolvedValue({ data: new Blob([new Uint8Array(image)], { type: 'image/png' }), error: null })
  mock.agent.mockResolvedValue({ text: 'Revise a configuração.', recommendation: pilotPreparation({ goal: 'presentation' }, context), usage: { inputTokens: 100, outputTokens: 20, durationMs: 10, nominalUsd: .001 } })
  mock.log.mockResolvedValue(undefined)
  mock.render.mockResolvedValue({ data: { id: requestId, status: 'completed', created_at: new Date().toISOString() }, error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('authenticated first-image API', () => {
  it('routes finished renders away from AI before upload lookup or quota reservation', async () => {
    const response = await POST(request({ ...input(), context: { ...context, referenceKind: 'render' } }))
    expect(response.status).toBe(409)
    expect(await response.text()).toContain('Continuar em Editar')
    expect(mock.checkBudget).not.toHaveBeenCalled()
    expect(mock.download).not.toHaveBeenCalled()
    expect(mock.agent).not.toHaveBeenCalled()
    expect(mock.log).not.toHaveBeenCalled()
  })
  it('requires another reservation for every recovery attempt', async () => {
    await POST(request(input()))
    expect(mock.checkBudget).toHaveBeenCalledTimes(1)
    const reserveRetry = mock.agent.mock.calls[0][4]
    mock.budget = 'limited'
    expect(await reserveRetry()).toBe('limited')
    expect(mock.checkBudget).toHaveBeenCalledTimes(2)
  })
  it('records safe SDK diagnostics and known usage on failed analyses', async () => {
    mock.agent.mockRejectedValue(new PilotRunError('output-truncated', { attempts: 1, inputTokens: 100, outputTokens: 1200, durationMs: 7000, nominalUsd: .003, steps: 0, costComplete: true }, 'limited'))
    expect((await POST(request(input()))).status).toBe(503)
    expect(mock.log.mock.calls[0][1].meta).toMatchObject({ issue: 'model-output-truncated', attempts: 1, tokens_out: 1200, retry_budget: 'limited', cost_estimate_complete: true })
  })
  it('rejects cross-origin, non-JSON and oversized requests before spending', async () => {
    const foreign = request(input()); foreign.headers.set('Origin', 'https://other.invalid')
    expect((await POST(foreign)).status).toBe(403)
    const plain = request(input()); plain.headers.set('Content-Type', 'text/plain')
    expect((await POST(plain)).status).toBe(415)
    expect((await POST(request({ ...input(), ignored: 'x'.repeat(24000) }))).status).toBe(413)
    expect(mock.agent).not.toHaveBeenCalled()
  })
  it('requires authentication, staff gate, valid ownership and spend budget before reading an image', async () => {
    mock.user = null; expect((await POST(request(input()))).status).toBe(401)
    mock.user = { id: 'owner' }; mock.enabled = false; expect((await POST(request(input()))).status).toBe(404)
    mock.enabled = true; expect((await POST(request({ ...input(), attachmentId: sealUpload('other', key.replace('owner/', 'other/')) }))).status).toBe(400)
    mock.budget = 'limited'; expect((await POST(request(input()))).status).toBe(429)
    mock.budget = 'unavailable'; expect((await POST(request(input()))).status).toBe(503)
    expect(mock.download).not.toHaveBeenCalled(); expect(mock.agent).not.toHaveBeenCalled()
  })
  it('bounds image metadata before download and refuses a public bucket', async () => {
    mock.private = false; expect((await POST(request(input()))).status).toBe(503)
    mock.private = true
    mock.list.mockResolvedValue({ data: [{ name: 'a'.repeat(32) + '.png', metadata: { size: 9000000, mimetype: 'image/png' } }], error: null })
    expect((await POST(request(input()))).status).toBe(503)
    expect(mock.download).not.toHaveBeenCalled(); expect(mock.agent).not.toHaveBeenCalled()
  })
  it('analyzes decoded private bytes with a metadata-free vision derivative and returns a reviewable answer', async () => {
    const response = await POST(request(input()))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const payload = await response.json()
    expect(payload.answer).toMatchObject({ variant: 'grok', modelLabel: 'Grok 4.7', recommendation: { nodeCost: 20 } })
    const derivative = await sharp(mock.agent.mock.calls[0][1]).metadata()
    expect(derivative).toMatchObject({ width: 1600, height: 800, format: 'jpeg' })
    expect(derivative.exif).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain(key)
    const event = mock.log.mock.calls[0][1]
    expect(event.meta).toMatchObject({ qa: true, stage: 'answered', proposal: true, tokens_in: 100 })
    expect(JSON.stringify(event)).not.toContain('Apresentar ao cliente')
    expect(JSON.stringify(event)).not.toContain(payload.answer.receipt)
  })
  it('contains provider failure and never echoes prompts, response data or credentials', async () => {
    mock.agent.mockRejectedValue(Object.assign(new Error('SECRET private prompt image bytes'), { statusCode: 402 }))
    const response = await POST(request(input()))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('SECRET')
    expect(mock.log.mock.calls[0][1]).toMatchObject({ event: 'v2_fallback', meta: { stage: 'failed', issue: 'model-http-402' } })
  })
})
describe('signed pilot attribution', () => {
  it('refuses forged and foreign receipts', async () => {
    for (const token of ['fake', receipt('other')]) expect((await observe(request({ receipt: token, stage: 'applied' }))).status).toBe(400)
    expect(mock.log).not.toHaveBeenCalled()
  })
  it('separates guidance helpfulness from generated result utility', async () => {
    expect((await observe(request({ receipt: receipt(), stage: 'feedback', helpful: true }))).status).toBe(204)
    expect(mock.log.mock.calls[0][1]).toMatchObject({ event: 'answer_feedback', meta: { stage: 'feedback', helpful: true, qa: true } })
    expect(mock.log.mock.calls[0][1].meta).not.toHaveProperty('useful')
    expect((await observe(request({ receipt: receipt(), stage: 'generated', renderId: requestId, modified: true }))).status).toBe(204)
    expect(mock.renderOwner).toHaveBeenCalledWith('user_id', 'owner')
    expect(mock.log.mock.calls[1][1].meta).toMatchObject({ render_id: requestId, config_changed: true })
  })
  it.each([null, { status: 'failed', created_at: new Date().toISOString() }, { status: 'completed', created_at: 'bad' }, { status: 'completed', created_at: '2000-01-01' }])('refuses unavailable, incomplete and old renders %j', async data => {
    mock.render.mockResolvedValue({ data: data ? { id: requestId, ...data } : null, error: null })
    expect((await observe(request({ receipt: receipt(), stage: 'generated', renderId: requestId }))).status).toBe(404)
    expect(mock.log).not.toHaveBeenCalled()
  })
})
