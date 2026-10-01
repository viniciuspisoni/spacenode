import { describe, expect, it } from 'vitest'
import { listAvailableVideoModels, getNodeCost } from '@/lib/video/models'
import { VIDEO_TYPE_ORDER, VIDEO_TYPE_PRESETS, resolvePresetDefaults } from '@/lib/video/videoPresets'
import { buildFalInput, falEndpointForModel } from '@/lib/video/adapters/falAdapter'
import { hasSafeVideoMargin, videoEconomics, VIDEO_MARGIN_TARGET } from '@/lib/video/videoPricing'

const PRESENTATION = 'fal-ai/veo3.1/lite/image-to-video'
const REELS = 'spacenode/veo3.1-lite-720/image-to-video'

describe('Animar V1', () => {
  it('expõe somente dois destinos, com preço fixo e resolução compatível', () => {
    expect(VIDEO_TYPE_ORDER).toEqual(['cinematic', 'reels'])
    expect(resolvePresetDefaults(VIDEO_TYPE_PRESETS.cinematic)).toMatchObject({ modelId: PRESENTATION, duration: '8' })
    expect(resolvePresetDefaults(VIDEO_TYPE_PRESETS.reels)).toMatchObject({ modelId: REELS, duration: '8', aspectRatio: '9:16' })
    expect(getNodeCost(PRESENTATION, '8')).toBe(250)
    expect(getNodeCost(REELS, '8')).toBe(160)
  })

  it('mantém todos os motores disponíveis acima da meta no pior plano, incluindo legados', () => {
    for (const model of listAvailableVideoModels()) {
      for (const duration of model.supportedDurations) {
        const quote = videoEconomics(model.id, duration, 5.40)
        expect(quote, `${model.id}/${duration}`).not.toBeNull()
        expect(quote!.margin, `${model.id}/${duration}`).toBeGreaterThan(VIDEO_MARGIN_TARGET)
      }
    }
  })

  it('bloqueia a modalidade se o câmbio superar a folga', () => {
    expect(hasSafeVideoMargin(PRESENTATION, '8', 5.40)).toBe(true)
    expect(hasSafeVideoMargin(PRESENTATION, '8', 7.00)).toBe(false)
    expect(videoEconomics('google/flow/v1', '5', 5.40)).toBeNull()
  })

  it('fixa 720p vertical no adapter mesmo diante de parâmetros adulterados', () => {
    const req = {
      modelId: REELS,
      imageUrl: 'https://example.com/input.png',
      prompt: 'Slow architectural motion',
      duration: '8',
      resolution: '1080p',
      aspectRatio: '16:9',
      generateAudio: false,
    }
    expect(falEndpointForModel(REELS)).toBe(PRESENTATION)
    expect(buildFalInput(req)).toMatchObject({
      resolution: '720p', aspect_ratio: '9:16', duration: '8s', generate_audio: false,
    })
  })
})
