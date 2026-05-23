// Wrapper Flux Fill (inpainting) via FAL.
//
// Vega/Quasar/Pulsar não suportam mask nativo — escolhido Flux Pro Fill
// como motor exclusivo da Retocar. Mantém Vega como motor padrão dos
// outros módulos do produto.
//
// Endpoint padrão: fal-ai/flux-pro/v1/fill (Flux Pro Fill).
// Se mudar de endpoint, ajustar só aqui — todas as rotas de Retocar
// passam por esta lib.

import { fal } from '@fal-ai/client'

fal.config({ credentials: process.env.FAL_KEY })

export const FLUX_FILL_ENDPOINT = 'fal-ai/flux-pro/v1/fill'
const FLUX_TIMEOUT_MS = 90_000

export interface FluxFillInput {
  imageUrl:    string
  maskUrl:     string
  prompt:      string
  numImages?:  number
  seed?:       number
}

export interface FluxFillOutput {
  imageUrl: string
}

export async function callFluxFill(input: FluxFillInput): Promise<FluxFillOutput> {
  const result = await Promise.race([
    fal.subscribe(FLUX_FILL_ENDPOINT, {
      input: {
        image_url:     input.imageUrl,
        mask_url:      input.maskUrl,
        prompt:        input.prompt,
        num_images:    input.numImages ?? 1,
        seed:          input.seed,
        output_format: 'jpeg',
      } as unknown as never,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('FLUX_FILL_TIMEOUT'), { isFalTimeout: true })), FLUX_TIMEOUT_MS),
    ),
  ])

  const data = result.data as { images?: { url?: string }[]; image?: { url?: string } }
  const url  = data.images?.[0]?.url ?? data.image?.url
  if (!url) throw new Error('flux_fill_no_output')
  return { imageUrl: url }
}
