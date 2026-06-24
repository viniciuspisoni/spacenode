// lib/edit-v3/index.ts — superfície pública do motor Editar V3.

export * from './types'
export * from './flags'
export * from './pricing'
export * from './ssrf'
export { buildEditPrompt, BASE_EDIT_PROMPT, imageRolesContract, buildStrictRetryPrompt } from './buildEditPrompt'
export { runEditV3, gateThresholds, EditV3GenerationError } from './pipeline'
export type { EditV3RunInput, EditV3RunResult } from './pipeline'
export { insertJobResilient, updateJobResilient } from './persist'
