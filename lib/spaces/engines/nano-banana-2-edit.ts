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
import { buildTwoImageMaskPrompt, buildInstructPrompt } from './mask-prompt'
import {
  generateImage,
  ImageProviderNoOutputError,
  ImageProviderTimeoutError,
} from '@/lib/ai/image-provider'

// fal-ai/nano-banana-2/edit é o ID interno do router; o endpoint FAL real é
// fal-ai/nano-banana/edit (Gemini Flash Image, mesma família, públicamente acessível).
export const NANO_BANANA_2_EDIT_ENDPOINT = 'fal-ai/nano-banana-2/edit'
const FAL_NB2_ENDPOINT = 'fal-ai/nano-banana/edit'
const TIMEOUT_MS = 120_000

async function callNB2(input: RetouchInput, withMask: boolean): Promise<RetouchOutput> {
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
    num_images:    1,
    output_format: 'png',
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  }

  let gen
  try {
    gen = await generateImage({
      falEndpoint: FAL_NB2_ENDPOINT,
      falInput,
      timeoutMs:   TIMEOUT_MS,
      context:     withMask ? 'editar/nb2-masked' : 'editar/nb2-instruct',
      deliver:     { kind: 'dataUrl' },
    })
  } catch (err) {
    if (err instanceof ImageProviderTimeoutError) throw new RetouchTimeoutError(NANO_BANANA_2_EDIT_ENDPOINT)
    if (err instanceof ImageProviderNoOutputError) throw new RetouchNoOutputError(NANO_BANANA_2_EDIT_ENDPOINT)
    throw err
  }

  const url = gen.images[0]?.url
  if (!url) throw new RetouchNoOutputError(NANO_BANANA_2_EDIT_ENDPOINT)

  return {
    imageUrl:      url,
    endpoint:      NANO_BANANA_2_EDIT_ENDPOINT,
    requestId:     gen.requestId,
    provider:      gen.provider,
    providerModel: gen.providerModel,
    fallbackUsed:  gen.fallbackUsed,
    latencyMs:     gen.latencyMs,
  }
}

export const callNanoBanana2Masked: RetouchEngine = (input) => callNB2(input, true)

export const callNanoBanana2Instruct: RetouchEngine = (input) => callNB2(input, false)
