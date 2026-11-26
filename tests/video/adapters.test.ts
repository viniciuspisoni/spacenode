import { describe, expect, it } from 'vitest'
import { buildFalInput } from '@/lib/video/adapters/falAdapter'
import { vertexModelFor } from '@/lib/video/adapters/vertexVeoAdapter'

const base = { imageUrl: 'https://reference.invalid/start.jpg', endImageUrl: 'https://reference.invalid/end.jpg',
  prompt: 'Slow camera move', negativePrompt: 'distortion', duration: '5', generateAudio: false }

describe('contratos dos adapters de vídeo', () => {
  it('frame final usa o parâmetro correto de cada Kling', () => {
    expect(buildFalInput({ ...base, modelId: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video' }))
      .toHaveProperty('tail_image_url', base.endImageUrl)
    const lite = buildFalInput({ ...base, modelId: 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video' })
    expect(lite).not.toHaveProperty('tail_image_url')
    expect(buildFalInput({ ...base, modelId: 'fal-ai/kling-video/o3/pro/image-to-video' }))
      .toMatchObject({ end_image_url: base.endImageUrl, generate_audio: false })
  })

  it('Nebula Lite força resolução e áudio compatíveis com o preço', () => {
    const input = buildFalInput({ ...base, modelId: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video' })
    expect(input).toMatchObject({ resolution: '720p', generate_audio: false, end_image_url: base.endImageUrl })
    expect(input).not.toHaveProperty('negative_prompt')
  })

  it('as variantes Lyra mantêm a identidade e rejeitam modelo desconhecido', () => {
    expect(vertexModelFor('vertex/veo-3.1-lite-generate-001')).toBe('veo-3.1-lite-generate-001')
    expect(vertexModelFor('vertex/veo-3.1-fast-generate-001')).toBe('veo-3.1-fast-generate-001')
    expect(vertexModelFor('fal-ai/veo3.1/image-to-video')).toBe('veo-3.1-generate-001')
    expect(() => vertexModelFor('constructor')).toThrow()
  })
})
