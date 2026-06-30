// fal-ai/flux-general/inpainting — Flux.1 [dev] with ControlNet/LoRA/IP-Adapter.
//
// Used for two Retocar tabs:
//
//   "Substituir" — supplies a referenceUrl that's wired into ip_adapters.
//                  The model uses the reference image to guide what the
//                  replacement should look like (chair, lamp, plant, etc.)
//                  while honoring the mask boundaries.
//
//   "Adicionar"  — no reference, prompt-only generation inside the mask.
//                  Stronger strength so the model fills the mask boldly.
//
// Why not Flux Pro Fill: Flux Pro Fill does not accept IP-Adapter, so it
// cannot use a reference image for "Substituir". For "Adicionar" we picked
// flux-general/inpainting too for consistency (single engine for both modes
// reduces surface area and the strength parameter gives us more control over
// how aggressively to fill).
//
// Reference: https://fal.ai/models/fal-ai/flux-general/inpainting/api

import { fal } from '@fal-ai/client'
import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'

export const FLUX_INPAINT_ENDPOINT = 'fal-ai/flux-general/inpainting'
// Flux dev inpaint with ip_adapter / control_loras can be slower than the
// Pro variant. 120s buffer in case the user's image is large.
const TIMEOUT_MS = 120_000

// Strength controls preservation vs regeneration inside the mask (0-1).
// - replace: lower (0.85) — keep some structural cues from the original area
// - add:     higher (0.95) — fill the mask boldly, less anchored to source
const STRENGTH_REPLACE = 0.85
const STRENGTH_ADD     = 0.95

interface FalFluxInpaintOutput {
  images?: { url?: string }[]
  image?:  { url?: string }
}

/**
 * Call Flux.1 [dev] inpainting. When referenceUrl is provided, the reference
 * image is wired into ip_adapters[0] so the result mimics its style/object;
 * without it, the call is prompt-only.
 */
export const callFluxInpaint: RetouchEngine = async (
  input: RetouchInput,
): Promise<RetouchOutput> => {
  const hasReference = !!input.referenceUrl
  const strength     = hasReference ? STRENGTH_REPLACE : STRENGTH_ADD

  const falInput: Record<string, unknown> = {
    prompt:              input.prompt,
    image_url:           input.imageUrl,
    mask_url:            input.maskUrl,
    strength,
    num_inference_steps: 28,
    guidance_scale:      3.5,
    num_images:          1,
    output_format:       'jpeg',
  }
  if (input.seed !== undefined) falInput.seed = input.seed
  if (hasReference) {
    falInput.ip_adapters = [{ image_url: input.referenceUrl }]
  }

  const result = await Promise.race([
    fal.subscribe(FLUX_INPAINT_ENDPOINT, { input: falInput as unknown as never }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new RetouchTimeoutError(FLUX_INPAINT_ENDPOINT)), TIMEOUT_MS),
    ),
  ])

  const data = result.data as FalFluxInpaintOutput
  const url  = data.images?.[0]?.url ?? data.image?.url
  if (!url) throw new RetouchNoOutputError(FLUX_INPAINT_ENDPOINT)

  return { imageUrl: url, endpoint: FLUX_INPAINT_ENDPOINT, requestId: (result as { requestId?: string }).requestId ?? null }
}
