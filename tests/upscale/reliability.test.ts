import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { analyzeImage } from '@/lib/upscale/recommendations'
import { computeUpscaleCost } from '@/lib/upscale/costs'
import { normalizeSource } from '@/lib/upscale/normalize-source'
import { validateOutputDimensions } from '@/lib/upscale/output'
import { waitForUpscaleJob } from '@/lib/upscale/browser-job'

const { subscribe, cancel } = vi.hoisted(() => ({ subscribe: vi.fn(), cancel: vi.fn().mockResolvedValue({}) }))
vi.mock('@fal-ai/client', () => ({ fal: { subscribe, queue: { cancel } } }))

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('contrato de imagem e custo', () => {
  it('PNG sem perda e traço simples não é diagnosticado como compressão destrutiva', () => {
    const r = analyzeImage({ fileName: 'planta.png', mime: 'image/png', fileSize: 17_251, width: 1920, height: 1080 })
    expect(r.objectiveId).toBeNull()
    expect(r.reason).toBe('')
  })
  it('usa MIME real, mesmo quando o nome da imagem tem extensão errada', () => {
    expect(analyzeImage({ fileName: 'planta.jpg', mime: 'image/png', fileSize: 17_251, width: 1920, height: 1080 }).objectiveId).toBeNull()
  })
  it.each(['2x', '4x'] as const)('os modos Topaz têm a mesma tarifa em %s', scale => {
    const costs = ['fidelity', 'recover', 'smart'].map(modeId => computeUpscaleCost({ tab: 'resolution',
      modeId: modeId as 'fidelity' | 'recover' | 'smart', scale, megapixels: 2 }).total)
    expect(new Set(costs).size).toBe(1)
  })
  it('preserva Display P3 e remove orientação após girar', async () => {
    const input = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#db5327' } })
      .withMetadata({ orientation: 6 }).withIccProfile('p3').jpeg().toBuffer()
    const output = await normalizeSource(input, 'image/jpeg')
    const before = await sharp(input).metadata(), after = await sharp(output.buffer).metadata()
    expect(after.icc).toEqual(before.icc)
    expect(after.orientation).toBeUndefined()
    expect([output.width, output.height]).toEqual([40, 60])
  })
  it('confere largura E altura antes de aceitar o resultado', () => {
    expect(validateOutputDimensions({ width: 100, height: 60 }, { width: 400, height: 240 }, 4).factor).toBe(4)
    expect(() => validateOutputDimensions({ width: 100, height: 60 }, { width: 400, height: 200 }, 4)).toThrow('output_dimensions_mismatch')
    expect(() => validateOutputDimensions({ width: 100, height: 60 }, { width: 200, height: 120 }, 4)).toThrow('output_dimensions_mismatch')
  })
})

describe('prazo e recuperação', () => {
  beforeEach(() => { subscribe.mockReset(); cancel.mockClear() })
  it('limpa o timer após sucesso do provider', async () => {
    vi.useFakeTimers()
    subscribe.mockResolvedValue({ data: {}, requestId: 'ok' })
    const { subscribeBounded } = await import('@/lib/upscale/providers/subscribe')
    await subscribeBounded('fal-ai/topaz/upscale/image', {}, 5000)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('o orçamento compartilhado limita a espera e tenta cancelar a fila', async () => {
    vi.useFakeTimers()
    subscribe.mockImplementation((_endpoint, options) => { options.onEnqueue('request-1'); return new Promise(() => {}) })
    const { subscribeBounded } = await import('@/lib/upscale/providers/subscribe')
    const controller = new AbortController()
    const run = subscribeBounded('fal-ai/topaz/upscale/image', {}, 240_000, { signal: controller.signal })
    const rejection = expect(run).rejects.toThrow('timeout')
    controller.abort(new Error('timeout'))
    await rejection
    expect(cancel).toHaveBeenCalledWith('fal-ai/topaz/upscale/image', { requestId: 'request-1' })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('recupera por GET, sem reenviar o POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', url: 'https://test/output.png' })))
    vi.stubGlobal('fetch', fetchMock)
    expect((await waitForUpscaleJob('job-1'))?.status).toBe('completed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/upscale?jobId=job-1')
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined()
  })
  it('o checkpoint de persistência também respeita o orçamento', async () => {
    vi.useFakeTimers()
    subscribe.mockImplementation((_endpoint, options) => {
      options.onEnqueue('checkpoint-1')
      return Promise.resolve({ data: {}, requestId: 'checkpoint-1' })
    })
    const { subscribeBounded } = await import('@/lib/upscale/providers/subscribe')
    const controller = new AbortController()
    const run = subscribeBounded('fal-ai/topaz/upscale/image', {}, 240_000, {
      signal: controller.signal, onRequestId: () => new Promise(() => {}),
    })
    const rejection = expect(run).rejects.toThrow('timeout')
    await Promise.resolve()
    controller.abort(new Error('timeout'))
    await rejection
    expect(vi.getTimerCount()).toBe(0)
  })
})
