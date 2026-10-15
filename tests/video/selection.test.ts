import { describe, expect, it } from 'vitest'
import { animateReducer, initialAnimateState } from '@/app/app/video/_hooks/useAnimateState'

describe('seleção de vídeo', () => {
  it('começa em Orbit, 5s e câmera suave', () => {
    expect(initialAnimateState(2500)).toMatchObject({
      modelId: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
      duration: '5', motionChoice: 'dolly-in-soft', fidelityMode: 'max', intensity: 'subtle',
    })
  })

  it('trocar motor não seleciona a duração mais cara', () => {
    const original = { ...initialAnimateState(2500), duration: '8', aspectRatio: '9:16' }
    const switched = animateReducer(original, { type: 'setModel', modelId: original.modelId })
    expect(switched.duration).toBe('5')
    expect(switched.aspectRatio).toBe('auto')
  })

  it('ignora durações, formatos e motores indisponíveis', () => {
    const original = initialAnimateState(2500)
    expect(animateReducer(original, { type: 'setDuration', duration: '4' })).toBe(original)
    expect(animateReducer(original, { type: 'setAspectRatio', aspectRatio: '4:3' })).toBe(original)
    expect(animateReducer(original, { type: 'setModel', modelId: 'luma/ray-3.2/720p' })).toBe(original)
  })

  it('retira frame final ao trocar para uma variante que não o entrega', () => {
    const original = { ...initialAnimateState(2500), endImageFile: {} as File, endImagePreview: 'frame' }
    expect(animateReducer(original, { type: 'setModel', modelId: 'fal-ai/veo3.1/image-to-video' }))
      .toMatchObject({ endImageFile: null, endImagePreview: null, duration: '8' })
  })
})
