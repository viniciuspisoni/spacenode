// fal-ai/nano-banana/edit — endpoint padrão barato (~US$0.039/image) do
// editRouter para edições "médias" (área 15–40%) simples.
//
// Família Nano Banana (Gemini Flash Image): NÃO aceita mask_url pixel-level.
// Passamos image_urls = [imagem, máscara] e descrevemos a máscara no prompt
// (WHITE = editar, BLACK = preservar), igual aos wrappers NB2/NB Pro existentes.
//
// NOTE: confirmar schema contra a doc da Fal.ai antes de produção.

import { fal } from '@fal-ai/client'
import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'
import { buildTwoImageMaskPrompt } from './mask-prompt'

export const NANO_BANANA_EDIT_ENDPOINT = 'fal-ai/nano-banana/edit'
const TIMEOUT_MS = 120_000

interface FalNBOutput {
  images?: { url?: string }[]
}

export const callNanoBananaEdit: RetouchEngine = async (
  input: RetouchInput,
): Promise<RetouchOutput> => {
  const refUrls = (input.references ?? []).map(r => r.url)
  const result = await Promise.race([
    fal.subscribe(NANO_BANANA_EDIT_ENDPOINT, {
      input: {
        prompt:        buildTwoImageMaskPrompt(input.prompt, input.references),
        image_urls:    [input.imageUrl, input.maskUrl, ...refUrls],
        num_images:    1,
        output_format: 'png',
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      } as unknown as never,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new RetouchTimeoutError(NANO_BANANA_EDIT_ENDPOINT)), TIMEOUT_MS),
    ),
  ])

  const data = result.data as FalNBOutput
  const url  = data.images?.[0]?.url
  if (!url) throw new RetouchNoOutputError(NANO_BANANA_EDIT_ENDPOINT)

  return { imageUrl: url, endpoint: NANO_BANANA_EDIT_ENDPOINT, requestId: (result as { requestId?: string }).requestId ?? null }
}
