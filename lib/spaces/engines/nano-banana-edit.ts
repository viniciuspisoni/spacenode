// fal-ai/nano-banana/edit — endpoint padrão barato (~US$0.039/image) do
// editRouter para edições "médias" (área 15–40%) simples.
//
// Família Nano Banana (Gemini Flash Image): NÃO aceita mask_url pixel-level.
// Passamos image_urls = [imagem, máscara] e descrevemos a máscara no prompt
// (WHITE = editar, BLACK = preservar), igual aos wrappers NB2/NB Pro existentes.
//
// Geração via lib/ai/image-provider: GCP/Vertex primário (quando ligado por
// env) com fallback FAL — o input FAL continua byte-idêntico ao de antes.
// Resultado pode voltar como data: URL (GCP); o pipeline baixa via
// fetchImageBuffer e re-hospeda no Supabase, como já faz com o vertex-imagen.

import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'
import { buildTwoImageMaskPrompt } from './mask-prompt'
import {
  generateImage,
  ImageProviderNoOutputError,
  ImageProviderTimeoutError,
} from '@/lib/ai/image-provider'

export const NANO_BANANA_EDIT_ENDPOINT = 'fal-ai/nano-banana/edit'
const TIMEOUT_MS = 120_000

export const callNanoBananaEdit: RetouchEngine = async (
  input: RetouchInput,
): Promise<RetouchOutput> => {
  const refUrls = (input.references ?? []).map(r => r.url)
  const falInput = {
    prompt:        buildTwoImageMaskPrompt(input.prompt, input.references),
    image_urls:    [input.imageUrl, input.maskUrl, ...refUrls],
    num_images:    1,
    output_format: 'png',
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  }

  let gen
  try {
    gen = await generateImage({
      falEndpoint: NANO_BANANA_EDIT_ENDPOINT,
      falInput,
      timeoutMs:   TIMEOUT_MS,
      context:     'editar/nano-banana',
      deliver:     { kind: 'dataUrl' },
    })
  } catch (err) {
    if (err instanceof ImageProviderTimeoutError) throw new RetouchTimeoutError(NANO_BANANA_EDIT_ENDPOINT)
    if (err instanceof ImageProviderNoOutputError) throw new RetouchNoOutputError(NANO_BANANA_EDIT_ENDPOINT)
    throw err
  }

  const url = gen.images[0]?.url
  if (!url) throw new RetouchNoOutputError(NANO_BANANA_EDIT_ENDPOINT)

  return {
    imageUrl:      url,
    endpoint:      NANO_BANANA_EDIT_ENDPOINT,
    requestId:     gen.requestId,
    provider:      gen.provider,
    providerModel: gen.providerModel,
    fallbackUsed:  gen.fallbackUsed,
    latencyMs:     gen.latencyMs,
  }
}
