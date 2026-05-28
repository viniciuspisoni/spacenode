// Quality guard policy — pure functions, no image processing here.
//
// "Drift" is the fraction of pixels OUTSIDE the user's mask that changed
// between the source image and the engine's output. The canvas component
// already knows how to measure this (validateOutsideMaskPreservation in
// RetocarCanvas.tsx). This module owns the *policy*: thresholds per edit
// mode, retry strategy, and prompt-tightening rules.
//
// Decision flow:
//
//   measured drift ─┐
//                   ├─ < THRESHOLD_OK[mode]      → 'ok'        (silent)
//                   ├─ < THRESHOLD_WARNING[mode] → 'warning'   (UI shows alert)
//                   ├─ < THRESHOLD_RETRY[mode]   → 'retry'     (try again, tighter)
//                   └─ ≥ THRESHOLD_RETRY[mode]   → 'degraded'  (return anyway, flag it)
//
// Thresholds are mode-specific because "remove" naturally bleeds into
// surrounding pixels (the engine has to blend with neighbours), while
// "texture" should be surgical — anything outside the mask is a bug.

import type { EditMode } from './types'

// ── Thresholds ────────────────────────────────────────────────────────────────
// Numbers are FRACTIONS of total non-masked pixels that changed beyond the
// per-component RGB DRIFT_THRESHOLD of 12 (see RetocarCanvas.validateOutside…).
// Tune these against real production runs once telemetry lands in Phase D.

export interface GuardThresholds {
  ok:      number   // below this → silent success
  warning: number   // below this → return + soft UI alert (current behaviour)
  retry:   number   // below this → return; above → trigger retry path
}

export const GUARD_THRESHOLDS: Record<EditMode, GuardThresholds> = {
  // Texture swap must be surgical — anything moving outside the mask is wrong.
  material: { ok: 0.02, warning: 0.05, retry: 0.05 },

  // Object removal naturally interpolates with neighbours (shadow fading,
  // gradient blending), so it tolerates slightly more drift.
  remove:  { ok: 0.03, warning: 0.08, retry: 0.08 },

  // Replace and add introduce new content with edges that bleed slightly
  // into the mask boundary — give them more headroom.
  replace: { ok: 0.04, warning: 0.10, retry: 0.10 },
  add:     { ok: 0.04, warning: 0.10, retry: 0.10 },

  // Fixing artifacts is surgical — the user wants tiny corrections only.
  fix:     { ok: 0.02, warning: 0.05, retry: 0.05 },

  // Lighting changes by definition radiate beyond the painted mask (shadows,
  // ambient bounce, color temperature shifts). Drift is expected and desired.
  lighting:  { ok: 0.15, warning: 0.30, retry: 0.40 },

  // Landscape edits add organic shapes whose edges blend with the surroundings.
  landscape: { ok: 0.05, warning: 0.12, retry: 0.15 },
}

// ── Verdict ───────────────────────────────────────────────────────────────────

export type GuardVerdict = 'ok' | 'warning' | 'retry' | 'degraded'

export function evaluateGuard(drift: number, mode: EditMode): GuardVerdict {
  const t = GUARD_THRESHOLDS[mode]
  if (drift < t.ok)       return 'ok'
  if (drift < t.warning)  return 'warning'
  if (drift < t.retry)    return 'retry'
  return 'degraded'
}

// ── Retry policy ──────────────────────────────────────────────────────────────
// Max number of automatic retries per call. Each retry tightens the prompt
// to coerce the model into staying inside the mask. We keep this low — too
// many retries burns nodes for no gain.

export const MAX_RETRIES_PER_MODE: Record<EditMode, number> = {
  material:  1,
  remove:    1,
  replace:   1,
  add:       1,
  fix:       1,
  lighting:  1,
  landscape: 1,
}

// ── Prompt tightening ────────────────────────────────────────────────────────
// Returns a stricter version of the user's prompt for the retry attempt.
// The original prompt is preserved verbatim — we only PREPEND constraints
// so the model still understands the user's intent.

const CONSTRAINT_PREFIX: Record<EditMode, string> = {
  material:
    'STRICT MASK CONSTRAINT: only modify pixels inside the painted mask. ' +
    'Do not alter the geometry, lighting, perspective, or any architectural ' +
    'element outside the mask. Preserve every surrounding surface exactly. ',

  remove:
    'STRICT MASK CONSTRAINT: only fill the masked area. ' +
    'Reconstruct using the surrounding context (grass, wall, floor, sky). ' +
    'Do not modify any pixel outside the mask. Do not introduce new objects. ',

  replace:
    'STRICT MASK CONSTRAINT: only replace content inside the painted mask. ' +
    'Do not alter the surrounding geometry, lighting, or architecture. ' +
    'Confine the new element fully within the mask boundary. ',

  add:
    'STRICT MASK CONSTRAINT: only insert content inside the painted mask. ' +
    'Do not alter the surrounding geometry, lighting, or architecture. ' +
    'The new element must fit fully within the mask, with edges blending ' +
    'into the surroundings without modifying them. ',

  fix:
    'STRICT MASK CONSTRAINT: only repair pixels inside the painted mask. ' +
    'Preserve the original architecture, geometry, and composition. ' +
    'Do not introduce new elements — only fix artifacts, distortions, or noise. ',

  lighting:
    'LIGHTING-FOCUSED EDIT: re-light the painted area while preserving all ' +
    'geometry, materials, and architectural elements. Sympathetic falloff into ' +
    'adjacent areas (shadows, ambient bounce) is allowed and expected, but do ' +
    'not move, recolor, or replace any solid surface outside the mask. ',

  landscape:
    'STRICT MASK CONSTRAINT: only add vegetation or landscape elements inside ' +
    'the painted mask. Do not alter the building, architecture, or any ' +
    'man-made structure outside the mask. New plants should fit the scale, ' +
    'perspective, and lighting of the surrounding context. ',
}

export function buildRetryPrompt(originalPrompt: string, mode: EditMode): string {
  const prefix = CONSTRAINT_PREFIX[mode]
  // If the user's prompt is empty (object-removal accepts empty prompts),
  // the prefix alone is enough.
  return originalPrompt.trim().length === 0
    ? prefix.trim()
    : `${prefix}USER INTENT: ${originalPrompt.trim()}`
}
