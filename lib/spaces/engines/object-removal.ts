// fal-ai/object-removal/mask — specialized inpainting for clean removal of
// masked objects (people, cars, furniture, signage…). Reconstructs the scene
// with contextually appropriate content (grass, wall, sky, etc.) without
// hallucinating new architectural elements.
//
// Used for the "Remover" tab of Retocar.
//
// Why not Flux Fill: Flux Fill is generative — it tends to invent new
// elements (windows, doors) when asked to "remove" something. Object-removal
// is specifically trained for clean inpainting and produces much cleaner
// results in our tests.
//
// Pricing (May 2026, from fal.ai docs):
//   - Low Quality:   $0.006
//   - Medium:        $0.012
//   - High:          $0.018
//   - Best:          $0.024

import { fal } from '@fal-ai/client'
import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'
import type { Quality } from '../types'

export const OBJECT_REMOVAL_ENDPOINT = 'fal-ai/object-removal/mask'
// Cold-start of this model can take >90s on FAL. 180s gives headroom
// without making the user wait forever in the bad case. Phase D will add
// automatic retry on RetouchTimeoutError so a single slow call doesn't
// surface as a hard error to the user.
const TIMEOUT_MS = 180_000

// FAL exposes a quality tier on this endpoint. Without it the call defaults
// to a lower tier, which downscales/recompresses the output noticeably.
// Mapping our user-facing Quality to the FAL tier:
//   HD  → high          (good detail at low cost)
//   2K  → best_quality  (architectural detail preserved)
//   4K  → best_quality  (FAL's top tier — no higher option)
//
// Pricing reference (May 2026):
//   low_quality   $0.006
//   medium        $0.012
//   high          $0.018
//   best_quality  $0.024
const QUALITY_TO_MODEL: Record<Quality, 'low_quality' | 'medium' | 'high' | 'best_quality'> = {
  hd:   'high',
  '2k': 'best_quality',
  '4k': 'best_quality',
}

// Soft-blend the edge of the mask so the seam isn't visible. 15px is the
// FAL default; explicit here for clarity.
const MASK_EXPANSION = 15

interface FalObjectRemovalOutput {
  images?: { url?: string }[]
  image?:  { url?: string }
}

export const callObjectRemoval: RetouchEngine = async (
  input: RetouchInput,
): Promise<RetouchOutput> => {
  const model = QUALITY_TO_MODEL[input.quality]
  const result = await Promise.race([
    fal.subscribe(OBJECT_REMOVAL_ENDPOINT, {
      input: {
        image_url:      input.imageUrl,
        mask_url:       input.maskUrl,
        model,
        mask_expansion: MASK_EXPANSION,
        // Object-removal ignores prompt — the model fills the masked area
        // with the surrounding context automatically. We still pass an
        // empty string for API consistency (see route handlers).
      } as unknown as never,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new RetouchTimeoutError(OBJECT_REMOVAL_ENDPOINT)), TIMEOUT_MS),
    ),
  ])

  const data = result.data as FalObjectRemovalOutput
  const url  = data.images?.[0]?.url ?? data.image?.url
  if (!url) throw new RetouchNoOutputError(OBJECT_REMOVAL_ENDPOINT)

  return { imageUrl: url, endpoint: OBJECT_REMOVAL_ENDPOINT }
}
