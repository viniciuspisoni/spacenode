// fal-ai/flux-pro/v1/fill — Flux Pro Fill, the current engine of Retocar.
//
// Used for the "Trocar textura" tab — it excels at swapping materials,
// colors and finishes inside a masked region. Less reliable for clean
// removal (tends to hallucinate new architectural elements) — for that we
// use object-removal.ts.
//
// This file is the engine-shaped wrapper. The legacy lib/spaces/flux-fill.ts
// still exists for backward compat with code that imports it directly; this
// new file standardises the signature for the router (RetouchEngine).

import { fal } from '@fal-ai/client'
import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'

export const FLUX_FILL_ENDPOINT = 'fal-ai/flux-pro/v1/fill'
const TIMEOUT_MS = 90_000

interface FalFluxFillOutput {
  images?: { url?: string }[]
  image?:  { url?: string }
}

export const callFluxFill: RetouchEngine = async (
  input: RetouchInput,
): Promise<RetouchOutput> => {
  const result = await Promise.race([
    fal.subscribe(FLUX_FILL_ENDPOINT, {
      input: {
        image_url:     input.imageUrl,
        mask_url:      input.maskUrl,
        prompt:        input.prompt,
        num_images:    1,
        seed:          input.seed,
        output_format: 'jpeg',
      } as unknown as never,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new RetouchTimeoutError(FLUX_FILL_ENDPOINT)), TIMEOUT_MS),
    ),
  ])

  const data = result.data as FalFluxFillOutput
  const url  = data.images?.[0]?.url ?? data.image?.url
  if (!url) throw new RetouchNoOutputError(FLUX_FILL_ENDPOINT)

  return { imageUrl: url, endpoint: FLUX_FILL_ENDPOINT }
}
