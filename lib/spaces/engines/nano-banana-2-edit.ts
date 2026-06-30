// fal-ai/nano-banana-2/edit — Gemini 3.1 Flash Image (Nano Banana 2).
//
// Motor PADRÃO do Editar Google-first ("Edição rápida"). Dois modos:
//
//   callNanoBanana2Masked   — máscara como 2ª imagem (família NB não aceita
//                             mask_url pixel-level); o pipeline recompõe sobre a
//                             original e o quality gate valida fora da máscara.
//   callNanoBanana2Instruct — edição CONVERSACIONAL da imagem inteira (sem
//                             máscara nenhuma): image_urls = [imagem, ...refs].
//
// Referências entram como imagens extras com descrição por papel no prompt.
// output_format png: o resultado entra no recompose lossless sem re-encode JPEG.

import { fal } from '@fal-ai/client'
import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'
import { buildTwoImageMaskPrompt, buildInstructPrompt } from './mask-prompt'

// fal-ai/nano-banana-2/edit é o ID interno do router; o endpoint FAL real é
// fal-ai/nano-banana/edit (Gemini Flash Image, mesma família, públicamente acessível).
export const NANO_BANANA_2_EDIT_ENDPOINT = 'fal-ai/nano-banana-2/edit'
const FAL_NB2_ENDPOINT = 'fal-ai/nano-banana/edit'
const TIMEOUT_MS = 120_000

interface FalNBOutput {
  images?: { url?: string }[]
}

async function callNB2(input: RetouchInput, withMask: boolean): Promise<RetouchOutput> {
  const refUrls = (input.references ?? []).map(r => r.url)
  const imageUrls = withMask
    ? [input.imageUrl, input.maskUrl, ...refUrls]
    : [input.imageUrl, ...refUrls]
  const prompt = withMask
    ? buildTwoImageMaskPrompt(input.prompt, input.references)
    : buildInstructPrompt(input.prompt, input.references)

  const result = await Promise.race([
    fal.subscribe(FAL_NB2_ENDPOINT, {
      input: {
        prompt,
        image_urls:    imageUrls,
        num_images:    1,
        output_format: 'png',
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      } as unknown as never,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new RetouchTimeoutError(NANO_BANANA_2_EDIT_ENDPOINT)), TIMEOUT_MS),
    ),
  ])

  const data = result.data as FalNBOutput
  const url  = data.images?.[0]?.url
  if (!url) throw new RetouchNoOutputError(NANO_BANANA_2_EDIT_ENDPOINT)

  return { imageUrl: url, endpoint: NANO_BANANA_2_EDIT_ENDPOINT, requestId: (result as { requestId?: string }).requestId ?? null }
}

export const callNanoBanana2Masked: RetouchEngine = (input) => callNB2(input, true)

export const callNanoBanana2Instruct: RetouchEngine = (input) => callNB2(input, false)
