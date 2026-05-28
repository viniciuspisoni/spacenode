// Ampliar (upscale + enhance) — tipos compartilhados.
//
// User-facing concepts:
//   - UpscaleTab: "Resolução" (aumentar tamanho) ou "Aprimorar" (limpar/restaurar).
//   - ResolutionModeId / EnhanceModeId: o que o usuário escolhe na UI.
//   - Scale: tamanho final desejado. Em Aprimorar pode ser 'none'.
//
// Internal concepts:
//   - ProviderId: o modelo real que roda no FAL (nunca exposto na UI principal).
//   - UpscaleStep: uma execução de provider. Pipeline = lista de steps (1+).
//
// Adicionar um novo modo? Estender ResolutionModeId/EnhanceModeId aqui, mapear
// para um provider em orchestrator.ts e registrar label em renderLabels.ts.

// ── Abas e modos (UI) ─────────────────────────────────────────────────────────

export type UpscaleTab = 'resolution' | 'enhance'

export type ResolutionModeId = 'fidelity' | 'recover'
export type EnhanceModeId    = 'denoise'  | 'deblur' | 'restore' | 'smart'
export type ModeId           = ResolutionModeId | EnhanceModeId

export type Scale = 'none' | '2x' | '4x' | '8x' | 'ultra'

export type ObjectiveId =
  | 'client'
  | 'portfolio'
  | 'print'
  | 'recover'
  | 'final'

// Numeric scale factor used by providers. 'ultra' is reserved/blocked until
// we wire a tile-based pipeline that can push past 8×.
export function scaleToFactor(scale: Scale): number {
  switch (scale) {
    case 'none':  return 1
    case '2x':    return 2
    case '4x':    return 4
    case '8x':    return 8
    case 'ultra': return 8 // safety cap until a true 16× pipeline lands
  }
}

// ── Providers (interno) ───────────────────────────────────────────────────────

export type ProviderId =
  | 'topaz'
  | 'clarity'
  | 'nafnet-denoise'
  | 'nafnet-deblur'
  | 'photo-restoration'

export interface ProviderEndpoints {
  topaz:               'fal-ai/topaz/upscale/image'
  clarity:             'fal-ai/clarity-upscaler'
  'nafnet-denoise':    'fal-ai/nafnet/denoise'
  'nafnet-deblur':     'fal-ai/nafnet/deblur'
  'photo-restoration': 'fal-ai/image-apps-v2/photo-restoration'
}

export const PROVIDER_ENDPOINTS: ProviderEndpoints = {
  'topaz':             'fal-ai/topaz/upscale/image',
  'clarity':           'fal-ai/clarity-upscaler',
  'nafnet-denoise':    'fal-ai/nafnet/denoise',
  'nafnet-deblur':     'fal-ai/nafnet/deblur',
  'photo-restoration': 'fal-ai/image-apps-v2/photo-restoration',
} as const

// ── Provider call interface ───────────────────────────────────────────────────

export interface ProviderInput {
  imageUrl:   string
  scale?:     number          // numeric factor; ignored by providers that don't upscale
  params?:    Record<string, unknown> // provider-specific overrides (e.g. clarity preset)
}

export interface ProviderOutput {
  imageUrl:    string
  endpoint:    string
  requestId:   string | null
  durationMs:  number
  rawParams:   Record<string, unknown>
}

export type ProviderCall = (input: ProviderInput) => Promise<ProviderOutput>

// ── Pipeline (orchestrator) ───────────────────────────────────────────────────

export interface UpscaleRunRequest {
  tab:            UpscaleTab
  modeId:         ModeId
  scale:          Scale
  objectiveId?:   ObjectiveId | null
  imageUrl:       string                       // FAL-hosted source URL
  inputDimensions?: { width: number; height: number } | null
}

export interface StepLog {
  provider:    ProviderId
  endpoint:    string
  params:      Record<string, unknown>
  requestId:   string | null
  durationMs:  number
  status:      'completed' | 'failed'
  error:       string | null
  fallbackOf:  ProviderId | null  // when this step replaced a failed primary
}

export interface UpscaleRunResult {
  outputUrl:        string
  steps:            StepLog[]
  totalDurationMs:  number
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class UpscaleProviderError extends Error {
  constructor(public readonly provider: ProviderId, message: string, public readonly cause?: unknown) {
    super(`[${provider}] ${message}`)
    this.name = 'UpscaleProviderError'
  }
}

export class UpscalePipelineError extends Error {
  constructor(message: string, public readonly steps: StepLog[]) {
    super(message)
    this.name = 'UpscalePipelineError'
  }
}
