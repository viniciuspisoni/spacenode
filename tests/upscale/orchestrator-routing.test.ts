// tests/upscale/orchestrator-routing.test.ts
//
// O roteamento por classe tem uma regra de segurança que precisa ficar
// pinada: o modelo especializado (Text Refine) só entra para 'line-art', e se
// ele falhar o primário roda DE NOVO com os params padrão antes de cair no
// fallback generativo. Sem isso, um Text Refine indisponível degradaria o
// desenho técnico para o Clarity — pior que não ter classificado.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const subscribe = vi.fn()
vi.mock('@fal-ai/client', () => ({
  fal: { config: vi.fn(), subscribe: (...args: unknown[]) => subscribe(...args) },
}))

const OK = { data: { image: { url: 'https://v3.fal.media/out.png' } }, requestId: 'r' }
const modelsSent = () => subscribe.mock.calls.map(c => (c[1] as { input: Record<string, unknown> }).input.model ?? '(sem model)')
const endpointsSent = () => subscribe.mock.calls.map(c => c[0])

describe('roteamento por classe da origem', () => {
  beforeEach(() => subscribe.mockReset())

  it("'line-art' manda o Topaz rodar no Text Refine", async () => {
    subscribe.mockResolvedValue(OK)
    const { runUpscalePipeline } = await import('@/lib/upscale/orchestrator')
    const res = await runUpscalePipeline({
      tab: 'resolution', modeId: 'fidelity', scale: '2x',
      imageUrl: 'https://v3.fal.media/in.png', inputDimensions: { width: 1200, height: 900 },
      sourceKind: 'line-art',
    })
    expect(modelsSent()).toEqual(['Text Refine'])
    expect(res.steps).toHaveLength(1)
    expect(res.steps[0].params.model).toBe('Text Refine')
  })

  it("'image' (e ausência de classe) ficam no High Fidelity V2", async () => {
    subscribe.mockResolvedValue(OK)
    const { runUpscalePipeline } = await import('@/lib/upscale/orchestrator')
    await runUpscalePipeline({
      tab: 'resolution', modeId: 'fidelity', scale: '2x',
      imageUrl: 'https://v3.fal.media/in.png', sourceKind: 'image',
    })
    await runUpscalePipeline({
      tab: 'resolution', modeId: 'recover', scale: '2x',
      imageUrl: 'https://v3.fal.media/in.png',
    })
    expect(modelsSent()).toEqual(['High Fidelity V2', 'High Fidelity V2'])
  })

  it('o override vale para os três modos que ampliam, não para os que só limpam', async () => {
    subscribe.mockResolvedValue(OK)
    const { runUpscalePipeline } = await import('@/lib/upscale/orchestrator')
    for (const modeId of ['fidelity', 'recover', 'smart'] as const) {
      await runUpscalePipeline({ tab: 'resolution', modeId, scale: '2x', imageUrl: 'https://v3.fal.media/in.png', sourceKind: 'line-art' })
    }
    await runUpscalePipeline({ tab: 'enhance', modeId: 'denoise', scale: 'none', imageUrl: 'https://v3.fal.media/in.png', sourceKind: 'line-art' })
    expect(modelsSent()).toEqual(['Text Refine', 'Text Refine', 'Text Refine', '(sem model)'])
    expect(endpointsSent()[3]).toBe('fal-ai/nafnet/denoise')
  })

  it('Text Refine indisponível → repete com o padrão ANTES de cair no Clarity', async () => {
    subscribe
      .mockRejectedValueOnce(new Error('model unavailable'))   // Text Refine
      .mockResolvedValueOnce(OK)                               // High Fidelity V2
    const { runUpscalePipeline, finalProvider } = await import('@/lib/upscale/orchestrator')
    const res = await runUpscalePipeline({
      tab: 'resolution', modeId: 'fidelity', scale: '2x',
      imageUrl: 'https://v3.fal.media/in.png', sourceKind: 'line-art',
    })
    expect(modelsSent()).toEqual(['Text Refine', 'High Fidelity V2'])
    expect(endpointsSent()).toEqual(['fal-ai/topaz/upscale/image', 'fal-ai/topaz/upscale/image'])
    expect(finalProvider(res)).toBe('topaz')
    // O log guarda a tentativa que falhou: telemetria de quando o especializado cai.
    expect(res.steps.map(s => s.status)).toEqual(['failed', 'completed'])
    expect(res.steps[1].fallbackOf).toBeNull()   // não foi fallback de provider, foi retry
  })

  it('se o padrão também falhar, aí sim o fallback Clarity entra', async () => {
    subscribe
      .mockRejectedValueOnce(new Error('down'))   // Text Refine
      .mockRejectedValueOnce(new Error('down'))   // High Fidelity V2
      .mockResolvedValueOnce(OK)                  // Clarity
    const { runUpscalePipeline, finalProvider } = await import('@/lib/upscale/orchestrator')
    const res = await runUpscalePipeline({
      tab: 'resolution', modeId: 'fidelity', scale: '2x',
      imageUrl: 'https://v3.fal.media/in.png', sourceKind: 'line-art',
    })
    expect(endpointsSent()).toEqual(['fal-ai/topaz/upscale/image', 'fal-ai/topaz/upscale/image', 'fal-ai/clarity-upscaler'])
    expect(finalProvider(res)).toBe('clarity')
    expect(res.steps.some(s => s.status === 'completed' && s.fallbackOf === 'topaz')).toBe(true)
  })
})
