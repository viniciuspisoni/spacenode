// lib/edit-v2/types.ts
//
// Contrato do Editar v2 — "o novo editor arquitetônico da SpaceNode: mais
// simples na superfície, mais preciso no resultado e mais poderoso por trás."
//
// Norte do produto (docs/PLANO-EDITAR-V2-2026-06-12.md §0):
//   1. simplicidade p/ usuário  2. precisão  3. preservação do projeto
//   4. custo controlado         5. poder técnico oculto no backend
//
// O usuário vê APENAS: 5 tipos de edição, Preservação, Intensidade, Qualidade,
// custo em Nodes e Gerar. Todo o resto (provider, modelo, máscara em pixels vs
// prompt, normalização, gates, retry, fallback) vive nestes tipos e nunca na UI.

/** Os 5 tipos de edição do v2 — vocabulário fechado, sem classifier por
 *  keywords (a intenção vem da escolha explícita do usuário na UI). */
export type EditIntentV2 =
  | 'swap_material'      // Trocar material
  | 'remove_element'     // Remover elemento
  | 'insert_element'     // Inserir elemento
  | 'adjust_atmosphere'  // Ajustar atmosfera
  | 'fix_image'          // Corrigir imagem

export const EDIT_INTENTS_V2: readonly EditIntentV2[] = [
  'swap_material',
  'remove_element',
  'insert_element',
  'adjust_atmosphere',
  'fix_image',
] as const

/** Rótulos da UI (PT, linguagem arquitetônica — nunca jargão técnico). */
export const EDIT_INTENT_LABELS_V2: Record<EditIntentV2, string> = {
  swap_material: 'Trocar material',
  remove_element: 'Remover elemento',
  insert_element: 'Inserir elemento',
  adjust_atmosphere: 'Ajustar atmosfera',
  fix_image: 'Corrigir imagem',
}

/** Econômica (default) | Alta precisão — o único seletor de motor que o
 *  usuário vê, sempre em linguagem de produto. */
export type QualityModeV2 = 'economic' | 'high_precision'

/** Máxima (default) | Padrão — regula prompt + limiar do gate de drift.
 *  Geometria/câmera/escala são SEMPRE preservadas; isto só calibra o rigor. */
export type PreservationModeV2 = 'maximum' | 'standard'

/** Sutil | Padrão | Forte — só modula o prompt; nunca muda preço/modelo. */
export type IntensityModeV2 = 'subtle' | 'standard' | 'strong'

/** Resolução de saída. 'source' = preservar a resolução da imagem original
 *  (cap 2K na Econômica; 4K só em Alta precisão — ver pricing.ts). */
export type OutputResolutionV2 = 'source' | '1K' | '2K' | '4K'

/** Papéis de referência do v2 — separação estrita pedida pelo fundador:
 *  a referência NUNCA pode ser confundida com a imagem principal. */
export type ReferenceKindV2 =
  | 'material'  // materialReferenceImage — textura/acabamento a aplicar
  | 'object'    // objectReferenceImage — móvel/objeto a inserir/substituir
  | 'context'   // projectContextImages — outras vistas do projeto (coerência)

export interface EditReferenceV2 {
  kind: ReferenceKindV2
  url: string
  note?: string
}

/** Providers do v2. 'fal-fallback' existe APENAS como rota de emergência por
 *  flag (EDIT_V2_FAL_FALLBACK) — nunca na experiência principal. */
export type EditProviderIdV2 = 'vertex-imagen' | 'gemini-image' | 'fal-fallback'

export type EditModelIdV2 =
  | 'imagen-3.0-capability-001' // Vertex — inpaint com máscara real em pixels
  | 'gemini-3.1-flash-image'    // API Gemini direta — econômico, multi-imagem
  | 'gemini-3-pro-image'        // API Gemini direta — alta precisão

// ---------------------------------------------------------------------------
// Contrato do roteador (espelho do pedido do fundador)
// ---------------------------------------------------------------------------

export interface EditRouteInputV2 {
  editIntent: EditIntentV2
  qualityMode: QualityModeV2
  preservationMode: PreservationModeV2
  intensityMode: IntensityModeV2
  hasMask: boolean
  /** Fração 0–1 da imagem coberta pela seleção (medida no SERVIDOR). */
  maskAreaRatio?: number | null
  hasReferenceImage: boolean
  referenceKind?: ReferenceKindV2 | null
  hasProjectContextImages: boolean
  /** Sinal do normalizador (ou da origem Spaces) de que o pedido exige rigor
   *  geométrico extra — força comportamento de Preservação Máxima. */
  requiresStrictGeometry: boolean
  outputResolution: OutputResolutionV2
  /** Megapixels da imagem original (sanitizado no servidor). */
  imageMegapixels: number
  /** Plano do usuário — NÃO altera roteamento nem preço no v2 (sem edições
   *  gratuitas); mantido para telemetria e políticas futuras. */
  userPlan: string
  /** Custo estimado pré-calculado (ex.: vindo do preview) — opcional; o router
   *  sempre recalcula e loga divergência. */
  estimatedCost?: number | null
}

/** Política de retry/fallback — sempre invisível ao usuário.
 *  REGRA DE COBRANÇA (aprovada 2026-06-12): falha técnica, erro de provider,
 *  rejeição automática do gate e retry técnico NUNCA cobram. Não é edição
 *  gratuita — é garantia de qualidade. */
export interface EditRetryPolicyV2 {
  /** Retries automáticos após reprovação do gate (prompt restritivo). */
  maxAutoRetries: number
  /** Retry nunca debita Nodes adicionais. Sempre true no v2. */
  freeRetry: true
  /** Provider alternativo para o retry (ex.: vertex → gemini-image). */
  fallbackProvider?: EditProviderIdV2 | null
  fallbackModel?: EditModelIdV2 | null
}

/** Limiares do gate de pixels, decididos pelo router conforme Preservação.
 *  outOfMask: fração máxima de pixels alterados FORA da seleção.
 *  noChangeFloor: mudança mínima DENTRO da seleção (abaixo = no-op, não cobra). */
export interface EditGateThresholdsV2 {
  outOfMask: number
  noChangeFloor: number
}

/** Telemetria estruturada por decisão de rota — gravada em image_edit_attempts
 *  (custo e latência do normalizador e do gate são registrados SEPARADOS,
 *  conforme pedido do fundador, para decidirmos se ficam sempre ligados). */
export interface EditRouteLoggingV2 {
  reason: string
  intent: EditIntentV2
  qualityMode: QualityModeV2
  preservationMode: PreservationModeV2
  intensityMode: IntensityModeV2
  hasMask: boolean
  maskAreaRatio: number | null
  referenceKind: ReferenceKindV2 | null
  resolvedResolution: '1K' | '2K' | '4K'
  gateThresholds: EditGateThresholdsV2
  /** Custo USD esperado do provider (inclui taxa média de retry). */
  expectedProviderCostUsd: number
  /** Custo USD esperado das camadas invisíveis (normalizador + gate). */
  expectedOverheadCostUsd: number
}

export interface EditRouteResultV2 {
  selectedProvider: EditProviderIdV2
  selectedModel: EditModelIdV2
  /** Prompt interno final (EN técnico) — montado por prompts.ts a partir do
   *  spec normalizado. Nunca exibido ao usuário. */
  normalizedPrompt: string
  nodesCost: number
  retryPolicy: EditRetryPolicyV2
  loggingData: EditRouteLoggingV2
}

// ---------------------------------------------------------------------------
// Normalizador de instrução (camada invisível 1)
// ---------------------------------------------------------------------------

export interface NormalizedInstructionV2 {
  /** Instrução do usuário convertida em EN técnico seguro. */
  instructionEn: string
  /** O normalizador detectou pedido ambíguo/fora do tipo? (ex.: "muda o piso
   *  e a parede" num único Trocar material) — o sistema escolhe a leitura
   *  SEGURA e registra o aviso, sem perguntar jargão ao usuário. */
  ambiguous: boolean
  ambiguityNote?: string | null
  /** O pedido exige rigor geométrico extra (estrutura/esquadrias/perspectiva). */
  requiresStrictGeometry: boolean
  /** Papel sugerido para a referência anexada, se houver. */
  referenceKindHint?: ReferenceKindV2 | null
  /** Telemetria própria (pedido do fundador: medir separado). */
  used: boolean
  durationMs: number
  costUsdEstimated: number
}

// ---------------------------------------------------------------------------
// Gate semântico (camada invisível 3)
// ---------------------------------------------------------------------------

export interface SemanticGateResultV2 {
  pass: boolean
  /** Motivos de reprovação em vocabulário fechado (telemetria + retry prompt). */
  reasons: string[]
  /** true quando a flag está desligada ou o serviço falhou (pass-through —
   *  o gate semântico é best-effort; o gate de pixels é quem bloqueia). */
  skipped: boolean
  durationMs: number
  costUsdEstimated: number
}

// ---------------------------------------------------------------------------
// Providers (camada de execução)
// ---------------------------------------------------------------------------

export interface ProviderEditInputV2 {
  /** Imagem principal (http(s) ou data:). NUNCA uma referência. */
  imageUrl: string
  /** Máscara PNG P&B (BRANCO = editar), já validada/normalizada pelo pipeline. */
  maskUrl?: string | null
  /** Prompt final EN (inclui o contrato de ordem das imagens, ver prompts.ts). */
  prompt: string
  intent: EditIntentV2
  references?: EditReferenceV2[]
  /** Só gemini-image: resolução de saída (Vertex devolve ~1K e o pipeline
   *  recompõe a região no original — por isso o crop é essencial lá). */
  resolution?: '1K' | '2K' | '4K'
  seed?: number
}

export interface ProviderEditOutputV2 {
  /** data URL (base64) — o pipeline baixa e re-hospeda no Supabase Storage. */
  imageDataUrl: string
  provider: EditProviderIdV2
  model: EditModelIdV2
  durationMs: number
  costUsdEstimated: number
  /** Id de request do provider quando disponível (reconciliação de fatura). */
  requestId?: string | null
}

export class EditV2ProviderError extends Error {
  readonly provider: EditProviderIdV2
  readonly kind: 'timeout' | 'no_output' | 'config' | 'api'
  constructor(provider: EditProviderIdV2, kind: EditV2ProviderError['kind'], message: string) {
    super(message)
    this.name = 'EditV2ProviderError'
    this.provider = provider
    this.kind = kind
  }
}
