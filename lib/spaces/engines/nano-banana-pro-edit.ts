// fal-ai/nano-banana-pro/edit — Gemini 3 Pro Image (Nano Banana Pro).
//
// Motor PREMIUM do Editar Google-first ("Edição premium", 5–6 nodes, só com
// opt-in explícito do usuário). Mesmos dois modos do Nano Banana 2:
// mascarado (máscara como 2ª imagem + recompose + gate) e instrução
// (edição conversacional da imagem inteira).

import { fal } from '@fal-ai/client'
import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'
import type { Quality } from '../types'
import { buildTwoImageMaskPrompt, buildInstructPrompt } from './mask-prompt'

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

interface FalNBOutput {
  images?: { url?: string }[]
}

async function callNBPro(input: RetouchInput, withMask: boolean): Promise<RetouchOutput> {
  const refUrls = (input.references ?? []).map(r => r.url)
  const imageUrls = withMask
    ? [input.imageUrl, input.maskUrl, ...refUrls]
    : [input.imageUrl, ...refUrls]
  const prompt = withMask
    ? buildTwoImageMaskPrompt(input.prompt, input.references)
    : buildInstructPrompt(input.prompt, input.references)

  const result = await Promise.race([
    fal.subscribe(FAL_NB_PRO_ENDPOINT, {
      input: {
        prompt,
        image_urls:    imageUrls,
        resolution:    QUALITY_RESOLUTION[input.quality],
        num_images:    1,
        output_format: 'png',
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      } as unknown as never,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new RetouchTimeoutError(NANO_BANANA_PRO_EDIT_ENDPOINT)), TIMEOUT_MS),
    ),
  ])

  const data = result.data as FalNBOutput
  const url  = data.images?.[0]?.url
  if (!url) throw new RetouchNoOutputError(NANO_BANANA_PRO_EDIT_ENDPOINT)

  return { imageUrl: url, endpoint: NANO_BANANA_PRO_EDIT_ENDPOINT }
}

export const callNanoBananaProMasked: RetouchEngine = (input) => callNBPro(input, true)

export const callNanoBananaProInstruct: RetouchEngine = (input) => callNBPro(input, false)
