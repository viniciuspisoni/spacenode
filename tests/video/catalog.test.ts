import { describe, expect, it } from 'vitest'
import { PLANS } from '@/lib/plans'
import { VIDEO_ENGINES } from '@/lib/video/engines'
import { getNodeCost, getVideoModel, listAllVideoModels, listVideoVariants } from '@/lib/video/models'

describe('catálogo Animar', () => {
  it('organiza todas as variantes nas quatro famílias aprovadas', () => {
    expect(VIDEO_ENGINES.map(engine => engine.label)).toEqual(['Orbit', 'Lyra', 'Nebula', 'Astra'])
    expect(VIDEO_ENGINES.map(engine => listVideoVariants(engine.id).length)).toEqual([3, 3, 2, 2])
    expect(listAllVideoModels().every(model => !!model.engineId)).toBe(true)
  })

  it('mantém contribuição acima de 80% com as reservas em todos os planos', () => {
    const netPerNode = Math.min(...PLANS.flatMap(plan => [
      plan.monthlyPrice / plan.nodes, plan.annualTotal / 12 / plan.nodes,
    ])) * .9
    // API por segundo; Lyra Lite usa a tarifa conservadora Gemini.
    const usdPerSecond: Record<string, number> = {
      'Orbit Lite': .042, Orbit: .07, 'Orbit Pro': .112,
      'Lyra Lite': .05, 'Lyra Fast': .10, 'Lyra Pro': .20,
      'Nebula Lite': .02592, 'Nebula Pro': .232, Astra: .06, 'Astra 1080p': .24,
    }
    for (const model of listAllVideoModels()) {
      for (const duration of model.supportedDurations) {
        const cost = usdPerSecond[model.label] * Number(duration) * 6 * 1.2 * 1.25 + .5
        const nodes = getNodeCost(model.id, duration)
        expect(nodes % 100, model.label).toBe(0)
        expect(1 - cost / (nodes * netPerNode), `${model.label} ${duration}s`).toBeGreaterThan(.8)
      }
    }
  })

  it('não oferece duração curta em Veo Pro 1080p nem preços zero', () => {
    expect(() => getNodeCost('fal-ai/veo3.1/image-to-video', '4')).toThrow()
    expect(() => getNodeCost('fal-ai/kling-video/v2.5-turbo/pro/image-to-video', '0')).toThrow()
    expect(getVideoModel('constructor')).toBeUndefined()
  })

  it('integrações pendentes ficam indisponíveis mesmo no catálogo novo', () => {
    expect(listVideoVariants('astra').every(model => !model.isAvailable)).toBe(true)
    expect(getVideoModel('byteplus/seedance-2.5/image-to-video')?.isAvailable).toBe(false)
  })
})
