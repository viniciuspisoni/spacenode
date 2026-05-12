// Public surface of the Retocar engines module.
//
// Consumers should import from '@/lib/spaces/engines' and never reach into
// individual files — this keeps the router as the single dispatch point and
// lets us swap engines without touching callers.

export type {
  EditMode,
  EditModeMeta,
  RetouchEngine,
  RetouchInput,
  RetouchOutput,
  EngineDescriptor,
} from './types'

export {
  EDIT_MODE_LABELS,
  RetouchTimeoutError,
  RetouchNoOutputError,
} from './types'

export { selectEngine } from './router'

// Quality guard (Phase B) — pure policy + orchestration.
export type { GuardVerdict, GuardThresholds } from './guard-policy'
export {
  GUARD_THRESHOLDS,
  MAX_RETRIES_PER_MODE,
  evaluateGuard,
  buildRetryPrompt,
} from './guard-policy'

export type {
  OrchestratedResult,
  AttemptLogEntry,
  RunEngineFn,
  MeasureDriftFn,
} from './orchestrate'
export { runRetouchWithGuard } from './orchestrate'

// Re-export endpoint constants for telemetry / tests. Do NOT use these to
// dispatch — use selectEngine() instead.
export { OBJECT_REMOVAL_ENDPOINT } from './object-removal'
export { FLUX_FILL_ENDPOINT      } from './flux-fill'
export { FLUX_INPAINT_ENDPOINT   } from './flux-inpaint'
