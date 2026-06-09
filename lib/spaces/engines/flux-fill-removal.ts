// Specialized wrapper around Flux Pro Fill for the 'remove' mode.
//
// First attempt used fal-ai/object-removal/mask (specialized removal model)
// but it reprocesses the entire image at its own native resolution and
// downscales/recompresses photorealistic architectural renders to an
// unusable quality. Even at `best_quality` tier the output looked like
// a JPEG-compressed mobile screenshot vs the original 8K-style render.
//
// Switching to Flux Pro Fill — the same engine used by 'texture' — keeps
// the source image's resolution and quality intact and only repaints the
// masked region. The trade-off is hallucination risk: Flux Pro Fill is
// generative, so it can invent new elements (windows, doors, signs) when
// asked to "remove" something. We mitigate with REMOVAL_PROMPT below,
// which explicitly forbids new content and tells the model to continue
// the surrounding texture/pattern across the masked area.
//
// If the user still sees hallucinated elements, Phase D's quality guard +
// auto-retry will catch most of them (drift > threshold → retry with
// even tighter prompt).

import { callFluxFill, FLUX_FILL_ENDPOINT } from './flux-fill'
import type { RetouchEngine, RetouchInput } from './types'

export { FLUX_FILL_ENDPOINT as FLUX_FILL_REMOVAL_ENDPOINT }

/**
 * Removal-specialized prompt. Pinned in code (not user-editable) because
 * the user-facing UI for 'remove' mode has the textarea disabled.
 *
 * Strategy:
 *   - Tell the model what kind of content to synthesize (surrounding context).
 *   - List concrete examples of "context" so the model latches onto the right
 *     class of pixels (grass, wall, sky, foliage, ground, pavement).
 *   - Ban new objects categorically.
 *   - Demand pattern/line continuity across the mask edge (avoid visible seams).
 *   - Forbid changes outside the mask (reinforces what mask_url already says).
 */
const REMOVAL_PROMPT = [
  'Completely remove the selected object or artifact inside the masked area.',
  'Fill the removed area naturally using the surrounding architecture, materials, lighting, shadows, perspective and texture — grass, wall, sky, ground, foliage, pavement, glass, concrete, whatever is adjacent at each edge of the mask.',
  'Continue the patterns, lines and gradients that pass through the boundary of the mask so the seam is invisible.',
  'Do NOT add any new objects, people, vehicles, furniture, signs, plants, lamps or architectural elements.',
  'Do not leave traces, ghosting, blur, duplicated objects, or visible seams.',
  'Do NOT alter anything outside the mask. The output must be pixel-identical to the input outside the masked region.',
  'The result must look as if the masked area never contained anything — just the natural background continuing without interruption.',
  'Preserve the photorealistic quality of the source image.',
].join(' ')

export const callFluxFillForRemoval: RetouchEngine = (input: RetouchInput) =>
  callFluxFill({ ...input, prompt: REMOVAL_PROMPT })
