// lib/edit-v2 — fundação do Editar v2 ("o novo editor arquitetônico da
// SpaceNode: mais simples na superfície, mais preciso no resultado e mais
// poderoso por trás"). Plano e norte: docs/PLANO-EDITAR-V2-2026-06-12.md.
//
// Fase atual: 1 (fundação). Nada aqui está ligado às rotas de produto — o
// Editar v1 segue intocado; a integração acontece nas Fases 2–4 atrás de
// EDIT_V2_ENABLED.

export * from './types'
export * from './flags'
export * from './pricing'
export * from './prompts'
export { routeEditV2, validateEditRequestV2, type RouteEditV2Opts } from './router'
export { normalizeInstruction, type NormalizeInstructionOpts } from './normalizer'
export {
  evaluateEditSemantics,
  type SemanticGateOpts,
  type SemanticGateReason,
} from './semantic-gate'
export {
  runEditV2,
  assertSafeImageUrl,
  EditV2InputError,
  type EditV2RunInput,
  type EditV2RunResult,
} from './pipeline'
export { vertexImagenEditV2, VERTEX_IMAGEN_MODEL_V2 } from './providers/vertex-imagen'
export {
  geminiImageEditV2,
  type GeminiImageEditOpts,
  type GeminiImageModel,
} from './providers/gemini-image'
