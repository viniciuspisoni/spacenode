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
  VALID_EDIT_MODES,
  isEditMode,
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

// Server-side cold-start retry helper.
export { callWithTimeoutRetry } from './retry-on-timeout'

// Endpoint constants for telemetry / tests.
export { FLUX_FILL_ENDPOINT, FLUX_FILL_REMOVAL_ENDPOINT, FLUX_INPAINT_ENDPOINT } from './router'
export { NB2_ENDPOINT, NB_PRO_ENDPOINT } from './gemini-edit'

// editRouter v1 — dispatch de EditEndpoint → engine concreto + engines novos.
export type { EndpointEngine } from './endpoint-dispatch'
export { dispatchEndpoint } from './endpoint-dispatch'
export { FLUX_KONTEXT_LORA_INPAINT_ENDPOINT } from './flux-kontext-lora-inpaint'
export { NANO_BANANA_EDIT_ENDPOINT }          from './nano-banana-edit'
export { FLUX_PRO_KONTEXT_ENDPOINT }          from './flux-pro-kontext'
export { GEMINI_3_PRO_EDIT_ENDPOINT }         from './gemini-3-pro-edit'
export { VERTEX_IMAGEN_EDIT_ENDPOINT }        from './vertex-imagen-edit'

// Camada de SUPERFÍCIE (segmentação SAM2, Fase 1).
export { callSam2Segment, SAM2_IMAGE_ENDPOINT } from './sam2-segment'
export type { SamPoint, SamBox } from './sam2-segment'
