// ─────────────────────────────────────────────────────────────────────────────
// TECH DEBT — Engine v1 dead code
//
// ModePreset fields (strength, reference_weight, guidance_scale,
// num_inference_steps, model) are defined here but NEVER passed to FAL.
// The actual engine (lib/spaces/falAdapter.ts) calls fal-ai/nano-banana-pro/edit
// (Gemini 3 Flash Image Edit) which does not accept these parameters.
//
// Geometry lock is currently expressed as a text prefix in the prompt only
// (see lib/spaces/buildVistaPrompt.ts → buildGeometryPrefix).
//
// This file is a placeholder for SPACES Engine v2, which will wire these
// parameters to a proper img2img model once the model router is implemented.
// Do NOT remove — the interface is part of the planned Engine v2 contract.
// ─────────────────────────────────────────────────────────────────────────────
import type { GenerationMode } from './types'

export interface ModePreset {
  geometry_lock_default:  number    // 0–100
  strength:               number    // 0.0–1.0 (Fal.ai)
  reference_weight:       number    // 0.0–1.0
  guidance_scale:         number    // Flux: 3.0–4.5
  num_inference_steps:    number
  model:                  string    // ID Fal.ai
  /** Quando true, vistaType destrava DNA traits automaticamente */
  auto_unlock_aggressive: boolean
}

export const MODE_PRESETS: Record<GenerationMode, ModePreset> = {
  coerente: {
    geometry_lock_default:  90,
    strength:               0.35,
    reference_weight:       0.85,
    guidance_scale:         3.5,
    num_inference_steps:    32,
    model:                  'fal-ai/flux/dev/image-to-image',
    auto_unlock_aggressive: false,
  },
  explorar: {
    geometry_lock_default:  50,
    strength:               0.65,
    reference_weight:       0.55,
    guidance_scale:         4.5,
    num_inference_steps:    28,
    model:                  'fal-ai/flux/dev/image-to-image',
    auto_unlock_aggressive: true,
  },
}

export function getModePreset(m: GenerationMode): ModePreset {
  return MODE_PRESETS[m]
}
