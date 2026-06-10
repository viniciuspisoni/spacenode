// Retocar engine router — Google-first with Flux fallback.
//
// Maps user intention (EditMode) to the best available engine for that mode
// and quality combination. The engine choice is invisible to the user —
// they pick a tab (Remover, Trocar material, Substituir, Adicionar) and a
// quality tier; the router picks the provider.
//
// Routing rules:
//
//   mode='remove'  → Flux Pro Fill with REMOVAL_PROMPT (all qualities)
//                    Best clean-removal model available. No Google equivalent yet.
//                    NOTE: swap to Imagen mask-inpainting when it ships on Fal.ai.
//
//   mode='material'  → NB2 (hd) | NB Pro (2k/4k)  → fallback: Flux Pro Fill
//   mode='replace' → NB2 (hd) | NB Pro (2k/4k)  → fallback: Flux general inpaint
//   mode='add'     → NB2 (hd) | NB Pro (2k/4k)  → fallback: Flux general inpaint
//
// Fallback behaviour: if the Google primary call throws any error (timeout,
// no-output, FAL 4xx), the router transparently retries with the Flux engine
// for that mode. The caller receives the output without knowing which engine
// ran. Fallback endpoint is logged for telemetry.
//
// Adding a new mode? Extend EditMode in types.ts, add an entry to
// EDIT_MODE_LABELS, and add a case here.

import { callFluxFill,           FLUX_FILL_ENDPOINT         } from './flux-fill'
import { callFluxInpaint,        FLUX_INPAINT_ENDPOINT      } from './flux-inpaint'
import { callFluxFillForRemoval, FLUX_FILL_REMOVAL_ENDPOINT } from './flux-fill-removal'
import { selectGeminiEngine }                                  from './gemini-edit'
import type { EditMode, EngineDescriptor, RetouchInput, RetouchOutput } from './types'
import type { Quality } from '../types'

// ── selectEngine ──────────────────────────────────────────────────────────────
// Returns the engine descriptor for a mode WITHOUT quality context.
// Used by legacy callers that haven't been updated to pass quality yet.
// Defaults to 'hd' for the Google path (NB2).

export function selectEngine(mode: EditMode, quality: Quality = 'hd'): EngineDescriptor {
  switch (mode) {
    case 'remove':
      return {
        mode,
        endpoint:    FLUX_FILL_REMOVAL_ENDPOINT,
        call:        callFluxFillForRemoval,
        description: 'Flux Pro Fill (removal) — clean mask fill, preserves source quality',
      }

    case 'material':
    case 'replace':
    case 'add':
    case 'fix':
    case 'lighting':
    case 'landscape':
    case 'style':
    case 'variation': {
      const google = selectGeminiEngine(quality)
      // Texture/material swap → Flux Pro Fill fallback (best at material work).
      // Everything else → Flux general inpaint as the safety net.
      const fluxFallback: RetouchEngine = mode === 'material' ? callFluxFill : callFluxInpaint

      return {
        mode,
        endpoint:    google.endpoint,
        call:        withGoogleFallback(google.call, google.endpoint, fluxFallback, mode),
        description: `Google ${google.endpoint} → Flux fallback`,
      }
    }
  }
}

// ── withGoogleFallback ────────────────────────────────────────────────────────
// Wraps a Google engine call so any failure transparently falls back to the
// Flux engine for that mode. Logs the fallback endpoint for telemetry.

type RetouchEngine = (input: RetouchInput) => Promise<RetouchOutput>

function withGoogleFallback(
  google:          RetouchEngine,
  googleEndpoint:  string,
  fluxFallback:    RetouchEngine,
  mode:            EditMode,
): RetouchEngine {
  return async (input: RetouchInput): Promise<RetouchOutput> => {
    try {
      return await google(input)
    } catch (err) {
      console.warn(
        '[router] Google primary failed (%s, mode=%s) — switching to Flux fallback: %s',
        googleEndpoint,
        mode,
        (err as Error).message,
      )
      return await fluxFallback(input)
    }
  }
}

// ── Flux endpoint constants (re-exported for telemetry) ───────────────────────
export { FLUX_FILL_ENDPOINT, FLUX_FILL_REMOVAL_ENDPOINT, FLUX_INPAINT_ENDPOINT }
