import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mock = vi.hoisted(() => ({ auth: vi.fn(), download: vi.fn(), normalize: vi.fn(), classify: vi.fn(),
  run: vi.fn(), output: vi.fn(), refund: vi.fn(), rpc: vi.fn(),
  rows: new Map<string, Record<string, unknown>>(), events: [] as string[],
  insertError: false, completionError: false }))

vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), storage: { upload: vi.fn().mockResolvedValue('https://fal.media/source.png') } } }))
vi.mock('@/lib/auth/request-user', () => ({ getRequestUser: mock.auth }))
vi.mock('@/lib/billing/refund-nodes', () => ({ refundNodes: mock.refund }))
vi.mock('@/lib/storage/direct-upload', () => ({ DIRECT_UPLOAD_AREAS: { 'upscale-source': {} }, downloadDirectUpload: mock.download }))
vi.mock('@/lib/storage/signed', () => ({ signStorageUrls: async (_admin: unknown, urls: unknown[]) => urls }))
vi.mock('@/lib/upscale/normalize-source', () => ({ normalizeSource: mock.normalize }))
vi.mock('@/lib/upscale/classify-source', () => ({ classifySource: mock.classify }))
vi.mock('@/lib/upscale/output', () => ({ saveUpscaleOutput: mock.output }))
vi.mock('@/lib/upscale', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/upscale')>(), runUpscalePipeline: mock.run }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  rpc: mock.rpc,
  from() {
    let action = 'select', payload: Record<string, unknown> = {}
    const filters: Record<string, unknown> = {}
    const execute = () => {
      if (action === 'insert') {
        if (mock.insertError) return { data: null, error: { code: 'XX000' } }
        if (mock.rows.has(payload.id as string)) return { data: null, error: { code: '23505' } }
        mock.rows.set(payload.id as string, { error_message: null, output_url: null, ...payload })
        mock.events.push('registered')
        return { data: null, error: null }
      }
      const row = [...mock.rows.values()].find(r => Object.entries(filters).every(([key, value]) => r[key] === value))
      if (action === 'update') {
        if (mock.completionError && payload.status === 'completed') return { data: null, error: { code: 'XX000' } }
        if (row) Object.assign(row, payload)
        return { data: null, error: null }
      }
      return { data: row ?? null, error: null }
    }
    const builder = {
      select() { return builder },
      eq(key: string, value: unknown) { filters[key] = value; return builder },
      insert(data: Record<string, unknown>) { action = 'insert'; payload = data; return builder },
      update(data: Record<string, unknown>) { action = 'update'; payload = data; return builder },
      maybeSingle() { return Promise.resolve(execute()) },
      then(resolve: (result: ReturnType<typeof execute>) => unknown) { return Promise.resolve(execute()).then(resolve) },
    }
    return builder
  },
}) }))

import { GET, POST } from '@/app/api/upscale/route'
const id = '11223344-1122-3344-5566-112233445566'
const body = { requestId: id, sourceKey: 'source-key', tab: 'resolution', modeId: 'fidelity', scale: '2x' }
const request = (patch = {}) => new NextRequest('http://localhost/api/upscale', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...patch }),
})

beforeEach(() => {
  vi.clearAllMocks(); mock.rows.clear(); mock.events.length = 0; mock.insertError = false; mock.completionError = false
  mock.auth.mockResolvedValue({ user: { id: 'user-1' } })
  mock.download.mockResolvedValue({ ok: true, buffer: Buffer.from('image'), mime: 'image/png', url: 'https://storage/source.png' })
  mock.normalize.mockResolvedValue({ buffer: Buffer.from('image'), mime: 'image/png', width: 100, height: 60, note: null })
  mock.classify.mockResolvedValue({ kind: 'image', stats: {} })
  mock.rpc.mockImplementation(() => { mock.events.push('debited'); return Promise.resolve({ error: null }) })
  mock.refund.mockResolvedValue(true)
  mock.run.mockResolvedValue({ outputUrl: 'https://fal.media/result.png', totalDurationMs: 1000,
    steps: [{ provider: 'topaz', status: 'completed', requestId: 'fal-1', fallbackOf: null }] })
  mock.output.mockResolvedValue({ url: 'https://storage/result.png', key: 'output-key', width: 200, height: 120,
    factor: 2, bytes: 5000, format: 'png', previewUrl: 'https://storage/preview.webp', beforePreviewUrl: 'https://storage/before.webp' })
})

describe('Ampliar: cobrança e persistência pela rota', () => {
  it.each(['__proto__', 'constructor', 123])('recusa aba inválida %s antes de acessar cobrança', async tab => {
    expect((await POST(request({ tab }))).status).toBe(400)
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.rows.size).toBe(0)
  })
  it('registra o job antes de cobrar e entrega o arquivo persistido', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mock.events).toEqual(['registered', 'debited'])
    const data = await response.json()
    expect(data.url).toBe('https://storage/result.png')
    expect(data.previewUrl).toBe('https://storage/preview.webp')
    expect(data.effectiveFactor).toBe(2)
    expect(mock.rows.get(id)?.status).toBe('completed')
    expect(mock.rows.get(id)?.style).toBe('upscale:topaz')
  })
  it('pedido repetido não executa nem cobra novamente', async () => {
    await POST(request())
    expect((await POST(request())).status).toBe(200)
    expect(mock.rpc).toHaveBeenCalledTimes(1)
    expect(mock.run).toHaveBeenCalledTimes(1)
  })
  it('duas chamadas concorrentes compartilham um único débito', async () => {
    let finish!: (value: unknown) => void
    const result = mock.run.getMockImplementation()!()
    mock.run.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const first = POST(request()), second = POST(request())
    await vi.waitFor(() => expect(mock.run).toHaveBeenCalledTimes(1))
    finish(await result)
    const responses = await Promise.all([first, second])
    expect(responses.map(r => r.status)).toContain(200)
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
  it('rejeita o mesmo ID associado a outra imagem', async () => {
    await POST(request())
    expect((await POST(request({ sourceKey: 'different' }))).status).toBe(409)
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
  it('falha ao registrar não debita nem chama FAL', async () => {
    mock.insertError = true
    expect((await POST(request())).status).toBe(502)
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.run).not.toHaveBeenCalled()
  })
  it('não anuncia estorno quando o helper retorna false', async () => {
    mock.run.mockRejectedValueOnce(new Error('provider down'))
    mock.refund.mockResolvedValue(false)
    const data = await (await POST(request())).json()
    expect(data.refunded).toBe(false)
    expect(data.error).not.toContain('foram devolvidos')
    expect(data.error).toContain('confirmar o estorno')
    expect(mock.rows.get(id)?.nodes_charged).toBe(10)
  })
  it('falha na resolução entregue devolve os nodes e não grava sucesso', async () => {
    mock.output.mockRejectedValueOnce(new Error('output_dimensions_mismatch'))
    const data = await (await POST(request())).json()
    expect(data.code).toBe('output_dimensions_mismatch')
    expect(data.refunded).toBe(true)
    expect(mock.rows.get(id)?.status).toBe('failed')
    expect(mock.rows.get(id)?.nodes_charged).toBe(0)
  })
  it('não retorna sucesso quando o update final falha', async () => {
    mock.completionError = true
    const response = await POST(request())
    expect(response.status).toBe(502)
    expect((await response.json()).code).toBe('history_error')
    expect(mock.refund).toHaveBeenCalledWith(expect.anything(), 'user-1', 10,
      { module: 'upscale', jobTable: 'renders', jobId: id })
  })
  it('não usa dimensões declaradas pelo cliente quando o decode falha', async () => {
    mock.normalize.mockRejectedValueOnce(new Error('invalid image'))
    expect((await POST(request({ imageWidth: 1, imageHeight: 1 }))).status).toBe(502)
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it('consulta autenticada recupera resultado sem cobrança', async () => {
    await POST(request())
    const response = await GET(new NextRequest('http://localhost/api/upscale?jobId=' + id))
    expect(response.status).toBe(200)
    expect((await response.json()).url).toBe('https://storage/result.png')
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
  it('não revela o job de outro usuário', async () => {
    await POST(request())
    mock.auth.mockResolvedValue({ user: { id: 'other-user' } })
    expect((await GET(new NextRequest('http://localhost/api/upscale?jobId=' + id))).status).toBe(404)
  })
})
