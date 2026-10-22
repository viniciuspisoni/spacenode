import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { POST } from '@/app/api/nodi/v2/upload/route'
import { openUpload } from '@/lib/nodi/v2/uploads'

const mock = vi.hoisted(() => ({
  user: { id: 'owner' } as { id: string } | null, enabled: true, allowed: true, multimodal: true,
  privateBucket: true, firstImage: false, limit: true, image: null as Buffer | null,
  sign: vi.fn(), download: vi.fn(), remove: vi.fn(), list: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mock.user } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: {
  getBucket: async () => ({ data: { public: !mock.privateBucket }, error: null }),
  from: () => ({ createSignedUploadUrl: mock.sign, download: mock.download, remove: mock.remove, list: mock.list }),
} }) }))
vi.mock('@/lib/nodi/flags', () => ({ isNodiEnabled: () => mock.enabled }))
vi.mock('@/lib/nodi/v2/flags', () => ({ isNodiV2EnabledFor: async () => mock.allowed, capabilitiesFor: () => ({ multimodal: mock.multimodal }) }))
vi.mock('@/lib/nodi/first-image/access', () => ({ canUseFirstImagePilot: async () => mock.firstImage }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: mock.limit }) }))
const key = 'owner/nodi/source/' + 'a'.repeat(32) + '.png'
const request = (body: unknown) => new Request('https://spacenode.app/api/nodi/v2/upload', { method: 'POST', headers: { Origin: 'https://spacenode.app', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(async () => {
  vi.stubEnv('NODI_ACTION_SECRET', 'test-upload-route')
  Object.assign(mock, { user: { id: 'owner' }, enabled: true, allowed: true, multimodal: true, firstImage: false, privateBucket: true, limit: true })
  vi.clearAllMocks()
  mock.image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#eee' } }).png().toBuffer()
  mock.sign.mockResolvedValue({ data: { token: 'signed-upload' }, error: null })
  mock.download.mockImplementation(async () => ({ data: new Blob([new Uint8Array(mock.image!)], { type: 'image/png' }), error: null }))
  mock.list.mockResolvedValue({ data: [{ name: 'a'.repeat(32) + '.png', metadata: { size: 1000, mimetype: 'image/png' } }], error: null })
  mock.remove.mockResolvedValue({ error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('private first-print API', () => {
  it('permits a first-image customer upload without V2 chat access and still binds the reference to its owner', async () => {
    mock.allowed = false; mock.firstImage = true
    expect((await POST(request({ step: 'sign', size: 1000, mime: 'image/png' }))).status).toBe(200)
    const confirmed = await POST(request({ step: 'confirm', key }))
    const body = await confirmed.json()
    expect(openUpload(body.attachment.id, 'owner')).toBe(key)
    expect(openUpload(body.attachment.id, 'other')).toBeNull()
  })
  it('rejects cross-origin, non-JSON and oversized payloads before touching storage', async () => {
    const foreign = request({ step: 'sign' }); foreign.headers.set('Origin', 'https://other.invalid')
    expect((await POST(foreign)).status).toBe(403)
    const plain = request({}); plain.headers.set('Content-Type', 'text/plain')
    expect((await POST(plain)).status).toBe(415)
    expect((await POST(request({ ignored: 'x'.repeat(3001) }))).status).toBe(413)
    expect(mock.sign).not.toHaveBeenCalled()
  })
  it('requires authentication and all capability gates', async () => {
    mock.user = null
    expect((await POST(request({ step: 'sign' }))).status).toBe(401)
    mock.user = { id: 'owner' }; mock.allowed = false
    expect((await POST(request({ step: 'sign' }))).status).toBe(404)
    mock.allowed = true; mock.multimodal = false
    expect((await POST(request({ step: 'sign' }))).status).toBe(404)
    expect(mock.sign).not.toHaveBeenCalled()
  })
  it('signs only bounded files in a private bucket and returns no download URL', async () => {
    const response = await POST(request({ step: 'sign', size: 1000, mime: 'image/png' }))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.bucket).toBe('spacenode-media')
    expect(payload.key).toMatch(/^owner\/nodi\/source\/[a-f0-9]{32}\.png$/)
    expect(payload.url).toBeUndefined()
    mock.privateBucket = false
    expect((await POST(request({ step: 'sign', size: 1000, mime: 'image/png' }))).status).toBe(503)
  })
  it('rejects unsupported, oversized and rate-limited uploads', async () => {
    expect((await POST(request({ step: 'sign', size: 9000000, mime: 'image/png' }))).status).toBe(400)
    expect((await POST(request({ step: 'sign', size: 1000, mime: 'image/svg+xml' }))).status).toBe(400)
    mock.limit = false
    expect((await POST(request({ step: 'sign', size: 1000, mime: 'image/png' }))).status).toBe(429)
    expect(mock.sign).not.toHaveBeenCalled()
  })
  it('refuses foreign keys before touching storage', async () => {
    expect((await POST(request({ step: 'confirm', key: key.replace('owner/', 'other/') }))).status).toBe(400)
    expect(mock.download).not.toHaveBeenCalled()
    expect(mock.list).not.toHaveBeenCalled()
  })
  it('decodes the real file and gives its owner a sealed reference', async () => {
    const response = await POST(request({ step: 'confirm', key }))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(openUpload(payload.attachment.id, 'owner')).toBe(key)
    expect(payload.url).toBeUndefined()
    expect(mock.remove).not.toHaveBeenCalled()
  })
  it('removes forged content and avoids downloading oversized objects', async () => {
    mock.image = Buffer.from('<svg>not a PNG</svg>')
    expect((await POST(request({ step: 'confirm', key }))).status).toBe(400)
    expect(mock.remove).toHaveBeenCalledWith([key])
    mock.download.mockClear()
    mock.list.mockResolvedValue({ data: [{ name: 'a'.repeat(32) + '.png', metadata: { size: 9000000, mimetype: 'image/png' } }], error: null })
    expect((await POST(request({ step: 'confirm', key }))).status).toBe(400)
    expect(mock.download).not.toHaveBeenCalled()
  })
})
