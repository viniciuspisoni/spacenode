// Adapter para os modelos via Fal.ai (Kling, Veo, Seedance).
// Encapsula o mapeamento de parâmetros por engine e a extração da URL
// de vídeo do payload de resposta. Mantém comportamento idêntico ao
// que estava inline em app/api/video/route.ts.

import { fal } from '@fal-ai/client'
import type { VideoAdapter, VideoGenerationRequest, VideoGenerationResult } from './types'

const KLING_25 = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'
const VEO_31   = 'fal-ai/veo3.1/image-to-video'
const VEO_LITE = 'fal-ai/veo3.1/lite/image-to-video'
const VEO_LITE_720 = 'spacenode/veo3.1-lite-720/image-to-video'
const SEEDANCE = 'bytedance/seedance-2.0/image-to-video'

export function buildFalInput(req: VideoGenerationRequest): Record<string, unknown> {
  const { modelId, imageUrl, prompt, negativePrompt, duration, aspectRatio, resolution, generateAudio } = req

  if (modelId === KLING_25) {
    return {
      image_url:       imageUrl,
      prompt,
      duration,
      negative_prompt: negativePrompt,
      cfg_scale:       0.75,
    }
  }

  if (modelId === VEO_31 || modelId === VEO_LITE || modelId === VEO_LITE_720) {
    return {
      image_url:       imageUrl,
      prompt,
      duration:        `${duration}s`,
      // SKU 720 e 1080 usam o mesmo endpoint; o catálogo determina o tier.
      resolution:      modelId === VEO_LITE_720 ? '720p' : (resolution ?? '1080p'),
      aspect_ratio:    modelId === VEO_LITE_720 ? '9:16' : (aspectRatio ?? 'auto'),
      generate_audio:  generateAudio ?? false,
      negative_prompt: negativePrompt,
    }
  }

  if (modelId === SEEDANCE) {
    // Seedance 2.0 não expõe negative_prompt nem camera_fixed.
    // generate_audio default é true; força false para evitar surpresa de billing.
    return {
      image_url:      imageUrl,
      prompt,
      duration,
      resolution:     resolution    ?? '1080p',
      aspect_ratio:   aspectRatio   ?? 'auto',
      generate_audio: generateAudio ?? false,
    }
  }

  throw new Error(`Modelo não suportado pelo falAdapter: ${modelId}`)
}

export function falEndpointForModel(modelId: string): string {
  return modelId === VEO_LITE_720 ? VEO_LITE : modelId
}

export function extractVideoUrl(data: unknown): string | null {
  const d = data as Record<string, unknown>
  // Kling, Veo, Seedance → { video: { url: string } }
  if (d?.video && typeof (d.video as Record<string, unknown>).url === 'string') {
    return (d.video as Record<string, unknown>).url as string
  }
  console.warn('[falAdapter] extractVideoUrl: estrutura desconhecida', JSON.stringify(data))
  return null
}

// Init lazy: só configura quando alguém chama. Permite import isomórfico.
let configured = false
function ensureConfigured() {
  if (configured) return
  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY não configurado.')
  }
  fal.config({ credentials: process.env.FAL_KEY })
  configured = true
}

export const falAdapter: VideoAdapter = {
  id:          'fal',
  isAvailable: () => !!process.env.FAL_KEY,

  async generate(req: VideoGenerationRequest): Promise<VideoGenerationResult> {
    ensureConfigured()

    const input = buildFalInput(req)

    console.log('[falAdapter] model :', req.modelId)
    console.log('[falAdapter] input :', JSON.stringify(input))

    const endpoint = falEndpointForModel(req.modelId)
    const result = await fal.subscribe(endpoint, { input })

    console.log('[falAdapter] output:', JSON.stringify(result.data))

    const outputUrl = extractVideoUrl(result.data)
    if (!outputUrl) throw new Error('Modelo não retornou vídeo')

    return {
      outputUrl,
      provider:  'fal',
      metadata:  result.data as Record<string, unknown>,
      requestId: (result as { requestId?: string }).requestId ?? null,
    }
  },
}
