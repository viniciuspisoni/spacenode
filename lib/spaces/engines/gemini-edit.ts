// Google Gemini image-edit providers for Retocar.
//
// Two wrappers around the Nano Banana endpoints on Fal.ai:
//
//   callNanoBanana2  — fal-ai/nano-banana-2/edit   (Gemini 3.1 Flash Image)
//                      Used for 'hd' quality (Rápido). Faster, lower cost.
//
//   callNanoBanaPro  — fal-ai/nano-banana-pro/edit  (Gemini 3 Pro Image)
//                      Used for '2k' and '4k' quality (Premium / Ultra 4K).
//
// Masking approach: Nano Banana endpoints do not accept a pixel-level mask_url.
// Instead we pass image_urls = [sourceImage, maskImage] and describe the mask
// in the prompt. The mask PNG is the standard B/W output from RetocarCanvas:
// WHITE = area to edit, BLACK = area to preserve.
//
// NOTE: when Google Imagen inpainting ships on Fal.ai (or via Vertex AI
// direct integration), replace or augment these functions for the 'remove'
// and 'material' modes. The current Flux fallback acts as the safety net
// until the Imagen endpoint is validated for architectural photorealism.

import { fal } from '@fal-ai/client'
import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'
import type { Quality } from '../types'

export const NB2_ENDPOINT    = 'fal-ai/nano-banana-2/edit'
export const NB_PRO_ENDPOINT = 'fal-ai/nano-banana-pro/edit'

const TIMEOUT_MS = 120_000

const QUALITY_RESOLUTION: Record<Quality, string> = {
  hd:  '1K',
  '2k': '2K',
  '4k': '4K',
}

interface FalNBOutput {
  images?: { url?: string }[]
}

// ── Prompt builder ────────────────────────────────────────────────────────────
// Wraps the user's prompt with mask-context instructions. Since NB2/NB Pro
// receive the mask as a second image (not as a pixel param), we must describe
// how to interpret it in the prompt itself.

function buildMaskedPrompt(userPrompt: string): string {
  return [
    'Two-image edit request.',
    'Image 1: source architectural photo.',
    'Image 2: binary mask — WHITE area = edit here, BLACK area = do NOT touch.',
    '',
    `Apply the following change ONLY inside the white-masked area: ${userPrompt}`,
    '',
    'Mandatory preservation rules:',
    '- Do not change any pixel outside the white masked area.',
    '- Match the lighting, perspective, scale and photorealistic material quality of the surrounding context.',
    '- Maintain photorealistic architectural rendering quality throughout the entire image.',
    '- The output must be pixel-identical to the source image outside the mask boundaries.',
  ].join('\n')
}

// ── Shared call logic ─────────────────────────────────────────────────────────

async function callNB(
  endpoint: string,
  input:    RetouchInput,
): Promise<RetouchOutput> {
  const resolution = QUALITY_RESOLUTION[input.quality]

  const result = await Promise.race([
    fal.subscribe(endpoint, {
      input: {
        prompt:        buildMaskedPrompt(input.prompt),
        image_urls:    [input.imageUrl, input.maskUrl],
        resolution,
        num_images:    1,
        output_format: 'jpeg',
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      } as unknown as never,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new RetouchTimeoutError(endpoint)), TIMEOUT_MS)
    ),
  ])

  const data = result.data as FalNBOutput
  const url  = data.images?.[0]?.url
  if (!url) throw new RetouchNoOutputError(endpoint)

  return { imageUrl: url, endpoint }
}

// ── callNanoBanana2 ───────────────────────────────────────────────────────────
// Gemini 3.1 Flash Image Preview. Rápido / HD quality.

export const callNanoBanana2: RetouchEngine = (input) =>
  callNB(NB2_ENDPOINT, input)

// ── callNanoBananaPro ─────────────────────────────────────────────────────────
// Gemini 3 Pro Image Preview. Premium (2K) and Ultra 4K quality.

export const callNanoBananaPro: RetouchEngine = (input) =>
  callNB(NB_PRO_ENDPOINT, input)

// ── Engine selector by quality ────────────────────────────────────────────────
// Returns the appropriate Google engine based on the user's quality choice.
// The router calls this for non-removal modes before deciding the final engine.

export function selectGeminiEngine(quality: Quality): {
  endpoint: string
  call:     RetouchEngine
} {
  if (quality === 'hd') {
    return { endpoint: NB2_ENDPOINT, call: callNanoBanana2 }
  }
  return { endpoint: NB_PRO_ENDPOINT, call: callNanoBananaPro }
}
