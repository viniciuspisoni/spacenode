// fal-ai/nano-banana-pro/edit — Gemini 3 Pro Image (Nano Banana Pro).
//
// Motor PREMIUM do Editar Google-first ("Edição premium", 5–6 nodes, só com
// opt-in explícito do usuário). Mesmos dois modos do Nano Banana 2:
// mascarado (máscara como 2ª imagem + recompose + gate) e instrução
// (edição conversacional da imagem inteira).
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
import { buildTwoImageMaskPrompt, buildInstructPrompt } from './mask-prompt'
import {
  generateImage,
  ImageProviderNoOutputError,
  ImageProviderTimeoutError,
} from '@/lib/ai/image-provider'

// fal-ai/nano-banana-pro/edit é o ID interno do router; o endpoint FAL real é
// fal-ai/gemini-3-pro-image-preview/edit (Gemini 3 Pro Image).
export const NANO_BANANA_PRO_EDIT_ENDPOINT = 'fal-ai/nano-banana-pro/edit'
const FAL_NB_PRO_ENDPOINT = 'fal-ai/gemini-3-pro-image-preview/edit'
const TIMEOUT_MS = 150_000

const QUALITY_RESOLUTION: Record<Quality, string> = {
  hd:   '1K',
  '2k': '2K',
  '4k': '4K',
}

async function callNBPro(input: RetouchInput, withMask: boolean): Promise<RetouchOutput> {
  const refUrls = (input.references ?? []).map(r => r.url)
  const imageUrls = withMask
    ? [input.imageUrl, input.maskUrl, ...refUrls]
    : [input.imageUrl, ...refUrls]
  const prompt = withMask
    ? buildTwoImageMaskPrompt(input.prompt, input.references)
    : buildInstructPrompt(input.prompt, input.references)

  const falInput = {
    prompt,
    image_urls:    imageUrls,
    resolution:    QUALITY_RESOLUTION[input.quality],
    num_images:    1,
    output_format: 'png',
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  }

  let gen
  try {
    gen = await generateImage({
      falEndpoint: FAL_NB_PRO_ENDPOINT,
      falInput,
      timeoutMs:   TIMEOUT_MS,
      context:     withMask ? 'editar/nbpro-masked' : 'editar/nbpro-instruct',
      deliver:     { kind: 'dataUrl' },
    })
  } catch (err) {
    if (err instanceof ImageProviderTimeoutError) throw new RetouchTimeoutError(NANO_BANANA_PRO_EDIT_ENDPOINT)
    if (err instanceof ImageProviderNoOutputError) throw new RetouchNoOutputError(NANO_BANANA_PRO_EDIT_ENDPOINT)
    throw err
  }

  const url = gen.images[0]?.url
  if (!url) throw new RetouchNoOutputError(NANO_BANANA_PRO_EDIT_ENDPOINT)

  return {
    imageUrl:      url,
    endpoint:      NANO_BANANA_PRO_EDIT_ENDPOINT,
    requestId:     gen.requestId,
    provider:      gen.provider,
    providerModel: gen.providerModel,
    fallbackUsed:  gen.fallbackUsed,
    latencyMs:     gen.latencyMs,
  }
}

export const callNanoBananaProMasked: RetouchEngine = (input) => callNBPro(input, true)

export const callNanoBananaProInstruct: RetouchEngine = (input) => callNBPro(input, false)
