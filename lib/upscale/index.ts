// Public surface do módulo Ampliar.
//
// Consumidores devem importar SEMPRE daqui — nunca dos arquivos internos.
// Mantém o orchestrator como único ponto de despacho e permite trocar
// providers/preset sem mudar callers.

export type {
  UpscaleTab,
  ResolutionModeId,
  EnhanceModeId,
  ModeId,
  Scale,
  ObjectiveId,
  ProviderId,
  ProviderInput,
  ProviderOutput,
  UpscaleRunRequest,
  UpscaleRunResult,
  StepLog,
} from './types'

export {
  scaleToFactor,
  PROVIDER_ENDPOINTS,
  UpscaleProviderError,
  UpscalePipelineError,
} from './types'

export {
  computeUpscaleCost,
  getUpscaleCostNodes,
  megapixelsFromDimensions,
  MAX_OUTPUT_MP,
  type CostInput,
  type CostBreakdown,
} from './costs'

export {
  OBJECTIVE_PRESETS,
  analyzeFile,
  type ObjectivePreset,
  type FileRecommendation,
  type FileSignal,
} from './recommendations'

export {
  runUpscalePipeline,
  finalProvider,
} from './orchestrator'
