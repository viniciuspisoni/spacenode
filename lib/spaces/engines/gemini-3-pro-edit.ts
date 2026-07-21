// fal-ai/gemini-3-pro-image-preview/edit — Gemini 3 Pro Image (premium).
//
// Endpoint premium/fallback do editRouter (~US$0.15/image, 5–6 nodes). Só é
// escolhido quando o usuário liga o modo premium explicitamente (nunca por
// fallback automático). Melhor qualidade para prompts complexos.
//
// Mask-based via duas imagens (image_urls = [imagem, máscara]), igual à família
// Nano Banana Pro (que é o mesmo Gemini 3 Pro). `resolution` mapeada da Quality.
//
// Geração via lib/ai/image-provider: GCP/Vertex primário (quando ligado por
// env) com fallback FAL byte-idêntico ao comportamento anterior.

import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'
import type { Quality } from '../types'
import { buildTwoImageMaskPrompt } from './mask-prompt'
import {
  generateImage,
  ImageProviderNoOutputError,
  ImageProviderTimeoutError,
} from '@/lib/ai/image-provider'

export const GEMINI_3_PRO_EDIT_ENDPOINT = 'fal-ai/gemini-3-pro-image-preview/edit'
const TIMEOUT_MS = 150_000

const QUALITY_RESOLUTION: Record<Quality, string> = {
  hd:  '1K',
  '2k': '2K',
  '4k': '4K',
}

export const callGemini3ProEdit: RetouchEngine = async (
  input: RetouchInput,
): Promise<RetouchOutput> => {
  const falInput = {
    prompt:        buildTwoImageMaskPrompt(input.prompt, input.references),
    image_urls:    [input.imageUrl, input.maskUrl, ...(input.references ?? []).map(r => r.url)],
    resolution:    QUALITY_RESOLUTION[input.quality],
    num_images:    1,
    output_format: 'jpeg',
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  }

  let gen
  try {
    gen = await generateImage({
      falEndpoint: GEMINI_3_PRO_EDIT_ENDPOINT,
      falInput,
      timeoutMs:   TIMEOUT_MS,
      context:     'editar/gemini-3-pro',
      deliver:     { kind: 'dataUrl' },
    })
  } catch (err) {
    if (err instanceof ImageProviderTimeoutError) throw new RetouchTimeoutError(GEMINI_3_PRO_EDIT_ENDPOINT)
    if (err instanceof ImageProviderNoOutputError) throw new RetouchNoOutputError(GEMINI_3_PRO_EDIT_ENDPOINT)
    throw err
  }

  const url = gen.images[0]?.url
  if (!url) throw new RetouchNoOutputError(GEMINI_3_PRO_EDIT_ENDPOINT)

  return {
    imageUrl:      url,
    endpoint:      GEMINI_3_PRO_EDIT_ENDPOINT,
    requestId:     gen.requestId,
    provider:      gen.provider,
    providerModel: gen.providerModel,
    fallbackUsed:  gen.fallbackUsed,
    latencyMs:     gen.latencyMs,
  }
}
