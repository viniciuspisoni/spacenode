// Orchestrator — runs an engine, evaluates the quality guard, and retries
// when drift is too high. No image processing or HTTP here: this module is
// pure orchestration logic. The caller provides:
//
//   - runEngine:    function that actually calls FAL (or the API route)
//   - measureDrift: function that compares output vs source outside the mask
//
// This separation lets the same orchestrator be reused from the browser
// (where measureDrift uses Canvas API) or from a Node route (where it would
// use sharp or similar). For Phase B we don't wire it anywhere yet — Phase C
// will hook this into RetocarStandaloneFlow / RetocarOverlay.
//
// Decision flow:
//
//   attempt 1: original prompt
//      ├─ drift verdict in {ok, warning} → return success
//      ├─ drift verdict in {retry}       → attempt 2 with tighter prompt
//      └─ drift verdict in {degraded}    → return degraded (no retry, no point)
//
//   attempt 2: tightened prompt
//      └─ return whatever came back, with `degraded` flag if drift still high
//
// MAX_RETRIES_PER_MODE (in guard-policy.ts) caps the loop. We don't escalate
// to a different engine in Phase B — that's a future enhancement once we
// have telemetry to know which fallbacks help.

import {
  evaluateGuard,
  buildRetryPrompt,
  MAX_RETRIES_PER_MODE,
  type GuardVerdict,
} from './guard-policy'
import type { EditMode, RetouchInput, RetouchOutput } from './types'

// ── Caller-supplied callbacks ─────────────────────────────────────────────────

/** Run the engine once. Receives the (possibly tightened) input. */
export type RunEngineFn = (input: RetouchInput) => Promise<RetouchOutput>

/**
 * Measure drift on a freshly produced output. Returns the FRACTION (0-1) of
 * non-mask pixels that changed beyond the per-component threshold.
 * 0 = nothing changed outside the mask (ideal).
 */
export type MeasureDriftFn = (outputUrl: string) => Promise<number>

// ── Result ────────────────────────────────────────────────────────────────────

export interface OrchestratedResult {
  /** Final output image URL chosen by the orchestrator. */
  outputUrl:      string
  /** Endpoint that produced the final output (for telemetry). */
  endpoint:       string
  /** Verdict on the final output. */
  verdict:        GuardVerdict
  /** Drift fraction measured on the final output (0-1). */
  drift:          number
  /** Number of attempts made (1 = no retry, 2 = one retry, …). */
  attempts:       number
  /** True when the orchestrator gave up and returned a degraded result. */
  degraded:       boolean
  /** Per-attempt log — useful for telemetry (Phase D). */
  attemptLog:     AttemptLogEntry[]
}

export interface AttemptLogEntry {
  attempt:  number
  prompt:   string
  drift:    number
  verdict:  GuardVerdict
  endpoint: string
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runRetouchWithGuard(args: {
  mode:          EditMode
  input:         RetouchInput
  runEngine:     RunEngineFn
  measureDrift:  MeasureDriftFn
}): Promise<OrchestratedResult> {
  const { mode, input, runEngine, measureDrift } = args
  const maxRetries = MAX_RETRIES_PER_MODE[mode]
  const attemptLog: AttemptLogEntry[] = []

  let currentInput = input
  let lastOutput:  RetouchOutput | null = null
  let lastDrift  = 0
  let lastVerdict: GuardVerdict = 'ok'

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const output = await runEngine(currentInput)
    const drift  = await measureDrift(output.imageUrl)
    const verdict = evaluateGuard(drift, mode)

    attemptLog.push({
      attempt,
      prompt:   currentInput.prompt,
      drift,
      verdict,
      endpoint: output.endpoint,
    })

    lastOutput  = output
    lastDrift   = drift
    lastVerdict = verdict

    // Success or soft-warning: return immediately.
    if (verdict === 'ok' || verdict === 'warning') {
      return {
        outputUrl:  output.imageUrl,
        endpoint:   output.endpoint,
        verdict,
        drift,
        attempts:   attempt,
        degraded:   false,
        attemptLog,
      }
    }

    // 'degraded' means the result is too bad to be salvageable by tightening
    // the prompt — bail out rather than waste another node.
    if (verdict === 'degraded') break

    // 'retry' — tighten the prompt and loop, unless we've hit the limit.
    if (attempt > maxRetries) break
    currentInput = {
      ...currentInput,
      prompt: buildRetryPrompt(currentInput.prompt, mode),
    }
  }

  // Fell through: return the last attempt, flagged as degraded.
  return {
    outputUrl:  lastOutput!.imageUrl,
    endpoint:   lastOutput!.endpoint,
    verdict:    lastVerdict,
    drift:      lastDrift,
    attempts:   attemptLog.length,
    degraded:   true,
    attemptLog,
  }
}
