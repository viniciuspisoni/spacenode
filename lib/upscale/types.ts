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

// Classe visual da origem, decidida no servidor (classify-source.ts):
//   - 'line-art': desenho técnico puro (traço sobre fundo claro, sem meios-tons)
//                 → o Topaz roda no modelo Text Refine.
//   - 'image':    todo o resto (render, foto, prancha) → High Fidelity V2.
// Nunca vem do cliente: é medido nos pixels normalizados, antes do débito.
export type SourceKind = 'line-art' | 'image'

// Fator NOMINAL pedido pela escala. É o que o usuário escreveu, não o que o
// motor entrega — para isso use effectiveFactor().
export function scaleToFactor(scale: Scale): number {
  switch (scale) {
    case 'none':  return 1
    case '2x':    return 2
    case '4x':    return 4
    case '8x':    return 8
    case 'ultra': return 8 // safety cap until a true 16× pipeline lands
  }
}

// ── Teto real dos motores ────────────────────────────────────────────────────
//
// Topaz e Clarity declaram os DOIS `upscale_factor` com `maximum: 4` no schema
// FAL (conferido no OpenAPI de 2026-09-18). Isso não era respeitado: a UI
// oferecia 8×, o custo cobrava 5× a base (50 nodes na Alta Fidelidade) e o
// Topaz devolvia calado uma imagem 4× — enquanto o fallback Clarity, se
// chamado, nem chegava a rodar (8 > maximum derruba o request). Quem pedia 8×
// pagava 50 nodes por 20 nodes de trabalho.
//
// O teto agora é explícito e é a fonte única de: o que a UI oferece, o que o
// custo cobra e o que a rota valida. Um 8× que chegue de um cliente antigo
// (plugin não atualizado) roda a 4× e é COBRADO a 4×.
export const MAX_UPSCALE_FACTOR = 4

/** Fator que o motor do modo realmente entrega — nominal, limitado pelo teto.
 *  Base do custo e da promessa de resolução final mostrada na UI. */
export function effectiveFactor(scale: Scale): number {
  return Math.min(scaleToFactor(scale), MAX_UPSCALE_FACTOR)
}

/** true quando a escala pedida não cabe no motor (UI/rota avisam em vez de
 *  entregar menos caladas). */
export function isScaleClamped(scale: Scale): boolean {
  return scaleToFactor(scale) > MAX_UPSCALE_FACTOR
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
  /** Classe visual da origem; ausente = 'image' (comportamento padrão). */
  sourceKind?:      SourceKind
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
