// Retocar engine router — maps user intention (EditMode) to a concrete FAL
// endpoint. The user picks a tab (Remover, Trocar textura, Substituir,
// Adicionar); the router decides which engine actually runs. The endpoint
// chosen is invisible to the user by design — they think in architectural
// intent, not in model IDs.
//
// Adding a new mode? Extend EditMode in types.ts, add an entry to
// EDIT_MODE_LABELS, and add a case here.

import { callFluxFill,           FLUX_FILL_ENDPOINT         } from './flux-fill'
import { callFluxInpaint,        FLUX_INPAINT_ENDPOINT      } from './flux-inpaint'
import { callFluxFillForRemoval, FLUX_FILL_REMOVAL_ENDPOINT } from './flux-fill-removal'
import type { EditMode, EngineDescriptor } from './types'

// NOTE: object-removal.ts still lives in this folder for future fallback /
// debug, but it's no longer wired into the router — its output quality on
// photorealistic architectural renders is unusable. See flux-fill-removal.ts
// for the full rationale.

/**
 * Pick the engine descriptor for a given edit mode. The caller invokes
 * descriptor.call(input) to run the actual edit, and reads descriptor.endpoint
 * for telemetry/logging.
 */
export function selectEngine(mode: EditMode): EngineDescriptor {
  switch (mode) {
    case 'remove':
      return {
        mode,
        endpoint:    FLUX_FILL_REMOVAL_ENDPOINT,
        call:        callFluxFillForRemoval,
        description: 'Flux Pro Fill with strict removal prompt — preserves source quality',
      }

    case 'texture':
      return {
        mode,
        endpoint:    FLUX_FILL_ENDPOINT,
        call:        callFluxFill,
        description: 'Flux Pro Fill — material/color/finish swap',
      }

    case 'replace':
      return {
        mode,
        endpoint:    FLUX_INPAINT_ENDPOINT,
        call:        callFluxInpaint,
        description: 'Flux dev inpaint + IP-Adapter — replace element with reference',
      }

    case 'add':
      return {
        mode,
        endpoint:    FLUX_INPAINT_ENDPOINT,
        call:        callFluxInpaint,
        description: 'Flux dev inpaint — generative add from prompt',
      }
  }
}
