// editRouter — roteamento inteligente de edições da Retocar.
//
// Decide TRÊS coisas a partir do contexto da edição, ANTES de consumir
// qualquer node:
//   1. endpoint  → qual provider/modelo atende melhor essa edição
//   2. costNodes → quanto cobrar (0 a 6), diferenciando correção, edição
//                  localizada, média, ampla e premium
//   3. isFreeFix → se a edição entra na cota de correção grátis
//
// Princípios (ver pedido de produto):
//   - Correção barata e justa: corrigir o que a IA errou não deve doer.
//   - Premium nunca é automático: só quando o usuário liga explicitamente
//     (userSelectedPremium). Prompt complexo sem premium usa o melhor modelo
//     NÃO-premium e sugere o upgrade — nunca escala sozinho.
//   - Função PURA e sem efeitos colaterais: não toca em saldo, banco ou rede.
//     Quem chama é responsável por consumir nodes e registrar a tentativa.
//
// Este arquivo é deliberadamente SEM imports (autocontido) para ser fácil de
// testar e portar. As pontes para o vocabulário do código existente
// (EditMode 'fix'/'landscape', Quality 'hd'/'2k'/'4k', PlanId 'starter'/'office')
// ficam em edit-router-adapters.ts.

// ── Vocabulário público (conforme spec de produto) ─────────────────────────────

export type EditTool =
  | 'remove'
  | 'material'
  | 'replace'
  | 'add'
  | 'fix_detail'
  | 'lighting'
  | 'landscaping'
  | 'style'
  | 'variation'

export type PreservationMode = 'max' | 'balanced' | 'creative'

export type OutputResolution = 'current' | '2K' | '4K'

export type UserPlan = 'free' | 'start' | 'pro' | 'studio' | 'beta'

export type EditEndpoint =
  | 'vertex/imagen-edit'
  | 'fal-ai/flux-kontext-lora/inpaint'
  | 'fal-ai/flux-pro/v1/fill'
  | 'fal-ai/nano-banana/edit'
  | 'fal-ai/flux-pro/kontext'
  | 'fal-ai/gemini-3-pro-image-preview/edit'
  // Google-first: Nano Banana 2 (Gemini 3.1 Flash Image) e Nano Banana Pro
  // (Gemini 3 Pro Image) MASCARADOS (máscara como 2ª imagem + recompose).
  | 'fal-ai/nano-banana-2/edit'
  | 'fal-ai/nano-banana-pro/edit'
  // Modo INSTRUÇÃO (edição conversacional, SEM máscara) dos mesmos modelos —
  // ids internos; chamam os endpoints FAL acima sem enviar a máscara.
  | 'google/gemini-3.1-flash-image'
  | 'google/gemini-3-pro-image'

export type EditProvider = 'fal' | 'vertex' | 'google'

// ── Referências visuais da edição ───────────────────────────────────────────────

export type EditReferenceRole =
  | 'material_texture'
  | 'object_reference'
  | 'person_reference'
  | 'style_reference'
  | 'lighting_reference'
  | 'landscape_reference'
  | 'original_image'
  | 'project_render'
  | 'consistency_reference'
  | 'restore_reference'
  | 'custom'

export type EditReferenceSource = 'upload' | 'project' | 'original'

export interface EditReferenceImage {
  id:      string
  url:     string
  role:    EditReferenceRole
  source:  EditReferenceSource
  note?:   string
}

export const VALID_EDIT_REFERENCE_ROLES: EditReferenceRole[] = [
  'material_texture', 'object_reference', 'person_reference', 'style_reference',
  'lighting_reference', 'landscape_reference', 'original_image', 'project_render',
  'consistency_reference', 'restore_reference', 'custom',
]

export function isEditReferenceRole(v: unknown): v is EditReferenceRole {
  return typeof v === 'string' && (VALID_EDIT_REFERENCE_ROLES as string[]).includes(v)
}

/** Máximo de referências por edição (spec). */
export const MAX_EDIT_REFERENCES = 3

export interface EditRoutingInput {
  tool:                  EditTool
  prompt:                string
  hasMask:               boolean
  /** Fração 0–1 da imagem coberta pela máscara. */
  maskAreaRatio:         number
  /** Megapixels da imagem de origem (largura*altura/1e6). */
  imageMegapixels:       number
  outputResolution:      OutputResolution
  preservationMode:      PreservationMode
  isGeneratedBySpacenode: boolean
  /** Quantas correções grátis ESTA imagem já consumiu. */
  freeFixesUsedForImage: number
  /** Correções grátis que o usuário já usou no mês. */
  monthlyFreeFixesUsed:  number
  /** Teto mensal de correções grátis do usuário (definido pelo plano). */
  monthlyFreeFixesLimit: number
  userPlan:              UserPlan
  /** Usuário ligou explicitamente o modo premium. */
  userSelectedPremium?:  boolean
  /** Referências visuais anexadas (texturas, objetos, imagens do projeto). */
  references?:           EditReferenceImage[]
}

export interface EditRoutingResult {
  endpoint:           EditEndpoint
  costNodes:          number
  isFreeFix:          boolean
  shouldUseCrop:      boolean
  /** Teto de MP a enviar no crop (a imagem é reduzida se passar disso). */
  maxCropMegapixels?: number
  /** Explicação curta da decisão (telemetria / logs / debug). */
  reason:             string
  /** Política de retry automático do quality gate (sempre grátis). */
  retryPolicy:        EditRetryPolicy
}

/**
 * Retry automático quando o quality gate reprova (drift fora da máscara,
 * resultado sem alteração perceptível, ou avaliação semântica negativa):
 *   - 1 tentativa extra com prompt mais restritivo, SEM nova cobrança;
 *   - se `fallback` existe (Flux atrás de EDIT_FLUX_FALLBACK=1), o retry roda
 *     no engine fallback; senão, repete o mesmo endpoint.
 */
export interface EditRetryPolicy {
  maxAutoRetries: number
  /** Retry nunca debita nodes (cobrança única na primeira tentativa). */
  freeRetry:      true
  /** Rota completa do fallback (null = retry no mesmo endpoint). */
  fallback:       EditRoutingResult | null
}

// ── Tabela de custo dos nodes (regras de cobrança da spec) ─────────────────────

export const NODE_COST = {
  /** Correção grátis. */
  freeFix:      0,
  /** Correção rápida paga (cota grátis esgotada). */
  quickFix:     1,
  /** Edição localizada simples. */
  localized:    2,
  /** Edição de área média. */
  medium:       3,
  /** Edição global / avançada (contextual, iluminação, paisagismo). */
  global:       4,
  /** Edição premium (Gemini 3 Pro). */
  premium:      5,
  /** Premium em caso pesado (4K, área grande ou sem máscara). */
  premiumHeavy: 6,
} as const

/** Desconto de 1 node para edições roteadas ao Vertex Imagen (inpaint preciso,
 *  ~$0.02/img vs $0.045 do NB2). Repassamos parte da economia ao usuário.
 *  Não se aplica aos tiers freeFix/quickFix (já no piso de 0/1). */
export const VERTEX_NODE_DISCOUNT = 1

// ── Custo real estimado por endpoint (telemetria de margem) ────────────────────
// `per_image`: custo fixo por imagem. `per_mp`: custo por megapixel processado.
// Mantido aqui pra calcular provider_cost_usd ao registrar a tentativa e vigiar
// a margem (regra do projeto: margem-piso ≥ 50% — ver lib/video/models.ts).

export const ENDPOINT_COST_USD: Record<
  EditEndpoint,
  { kind: 'per_image' | 'per_mp'; usd: number }
> = {
  'vertex/imagen-edit':                     { kind: 'per_image', usd: 0.020 },
  'fal-ai/flux-kontext-lora/inpaint':       { kind: 'per_mp',    usd: 0.035 },
  // Flux Pro Fill — motor de remoção dedicado (limpa + reconstrói o fundo).
  'fal-ai/flux-pro/v1/fill':                { kind: 'per_image', usd: 0.040 },
  'fal-ai/nano-banana/edit':                { kind: 'per_image', usd: 0.039 },
  'fal-ai/flux-pro/kontext':                { kind: 'per_image', usd: 0.040 },
  'fal-ai/gemini-3-pro-image-preview/edit': { kind: 'per_image', usd: 0.150 },
  // Google-first: Nano Banana 2 (Gemini 3.1 Flash Image) — motor padrão da
  // edição rápida; estimativa conservadora, vigiar provider_cost_usd.
  'fal-ai/nano-banana-2/edit':              { kind: 'per_image', usd: 0.045 },
  // Nano Banana Pro (Gemini 3 Pro Image) — motor premium (5–6 nodes).
  'fal-ai/nano-banana-pro/edit':            { kind: 'per_image', usd: 0.150 },
  // Modo instrução (sem máscara) dos mesmos modelos — mesmo custo por imagem.
  'google/gemini-3.1-flash-image':          { kind: 'per_image', usd: 0.045 },
  'google/gemini-3-pro-image':              { kind: 'per_image', usd: 0.150 },
}

// ── Flags / limiares ───────────────────────────────────────────────────────────
// Lidas POR CHAMADA (funções, não consts) para permitir rollback sem rebuild de
// módulo e para o smoke test exercitar os dois caminhos no mesmo processo.

/** Google-first (Gemini/Nano Banana como motor principal) — DEFAULT ON.
 *  `EDIT_GOOGLE_FIRST=0` volta o roteamento EXATAMENTE ao legado (Flux). */
export function googleFirstEnabled(): boolean {
  return process.env.EDIT_GOOGLE_FIRST !== '0'
}

/** Flux como fallback OCULTO do retry automático do quality gate.
 *  DEFAULT OFF — liga com EDIT_FLUX_FALLBACK=1. Nunca aparece na rota primária
 *  quando Google-first está ligado. */
export function fluxFallbackEnabled(): boolean {
  return process.env.EDIT_FLUX_FALLBACK === '1'
}

/** Vertex Imagen masked editing (inpaint preciso, ~US$0.020/img). DEFAULT OFF —
 *  liga com VERTEX_IMAGEN_ENABLED=1 após provisionar GOOGLE_VERTEX_PROJECT /
 *  GOOGLE_VERTEX_LOCATION / GOOGLE_VERTEX_CREDENTIALS_JSON. */
export function vertexImagenEnabled(): boolean {
  return process.env.VERTEX_IMAGEN_ENABLED === '1'
}

/** @deprecated compat — preferir vertexImagenEnabled() (env-driven). */
export const VERTEX_IMAGEN_ENABLED = process.env.VERTEX_IMAGEN_ENABLED === '1'

/** Camada de SUPERFÍCIE (segmentação SAM2, Fase 1) — atrás de flag, OFF por
 *  padrão. Liga com NEXT_PUBLIC_EDIT_SURFACE_SEGMENTATION=1 (lida no cliente pra
 *  decidir o pré-passo de segmentação E no servidor pra gatear o endpoint). */
export const SURFACE_SEGMENTATION_ENABLED =
  process.env.NEXT_PUBLIC_EDIT_SURFACE_SEGMENTATION === '1'

/** Ferramentas elegíveis à camada de superfície (V1 = só material, com e sem
 *  referência — escopo decidido pelo dono). 'replace' (instância de objeto) fica
 *  pra V1.1: lá a máscara é do OBJETO sob o seed, não da superfície/plano. */
export function surfaceSegmentationEligible(tool: EditTool): boolean {
  return tool === 'material'
}

/** Máscara "pequena": correção / edição localizada. Também é o teto da grátis. */
export const SMALL_MASK_MAX_RATIO = 0.15
/** Acima disso a edição é "ampla/global". 15–40% é "média". */
export const LARGE_MASK_MIN_RATIO = 0.40

// ── classifyPromptComplexity ───────────────────────────────────────────────────
// Heurística inicial (PT-BR + EN). Substituível por um classificador LLM depois
// (o projeto já usa Gemini direto para análise de texto — ver lib/gemini.ts).
//
// 'simple'   → ação única e local ("remover o carro", "limpar a mancha")
// 'moderate' → pedido com algum detalhe ou 1 conjunção
// 'complex'  → transformação de estilo/cena, múltiplas instruções, "nova proposta"

export type PromptComplexity = 'simple' | 'moderate' | 'complex'

// Sinais de transformação ampla de estilo/cena ou "recomeçar do zero".
const COMPLEX_KEYWORDS = [
  'estilo', 'style', 'transform', 'transforme', 'transformar', 'reimagin',
  'redesenh', 'reformul', 'reconfigur', 'nova proposta', 'do zero', 'reforma',
  'completament', 'inteir', 'toda a cena', 'todo o ambiente', 'ambiente inteiro',
  'mobiliar', 'mobíli', 'mobili', 'decorar', 'decoração', 'layout', 'planta',
  'dia para noite', 'noite para dia', 'day to night', 'redesign', 'restyle',
  'cena completa', 'render do zero',
]

// Conjunções / separadores que indicam múltiplas instruções no mesmo prompt.
const INSTRUCTION_SEPARATORS = [
  ' e ', ' and ', ' também ', ' além ', ' depois ', ' então ', ' then ',
  ' plus ', ';',
]

export function classifyPromptComplexity(prompt: string): PromptComplexity {
  const text = (prompt ?? '').trim().toLowerCase()
  if (text.length === 0) return 'simple'

  const wordCount = text.split(/\s+/).filter(Boolean).length

  let score = 0

  // 1) Tamanho do pedido.
  if (wordCount > 30) score += 2
  else if (wordCount > 16) score += 1

  // 2) Múltiplas instruções (conjunções + vírgulas).
  let separators = 0
  for (const sep of INSTRUCTION_SEPARATORS) {
    separators += countOccurrences(text, sep)
  }
  separators += countOccurrences(text, ',')
  if (separators >= 3) score += 2
  else if (separators >= 1) score += 1

  // 3) Palavras de transformação ampla de estilo/cena.
  if (COMPLEX_KEYWORDS.some(k => text.includes(k))) score += 2

  if (score >= 3) return 'complex'
  if (score >= 1) return 'moderate'
  return 'simple'
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let idx = haystack.indexOf(needle)
  while (idx !== -1) {
    count += 1
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return count
}

// ── routeEdit ───────────────────────────────────────────────────────────────────

/** Decisão de rota SEM a retryPolicy (anexada pelo routeEdit público). */
type RoutingDecision = Omit<EditRoutingResult, 'retryPolicy'>

export function routeEdit(input: EditRoutingInput): EditRoutingResult {
  const decision = googleFirstEnabled()
    ? decideGoogleFirst(input)
    : decideLegacy(input)
  return withRetryPolicy(decision, input)
}

// ── Google-first (Gemini/Nano Banana principal; Flux só fallback por flag) ─────
//
// Regras:
//   - Premium NUNCA é automático (igual ao legado): só com userSelectedPremium.
//   - COM máscara, o endpoint é SEMPRE mask-aware — a máscara nunca é descartada
//     por prompt "complexo" ou área grande (corrige o P0 da auditoria: o legado
//     mandava pro Flux Pro Kontext, que ignora a máscara e pula o quality gate).
//   - SEM máscara: edição conversacional por instrução (Gemini 3.1 Flash Image;
//     premium → Gemini 3 Pro Image).
//   - Vertex Imagen (inpaint com máscara REAL em pixels) entra quando ligado,
//     para ferramentas de inpaint SEM referência (referência → multi-imagem NB).
//   - Tiers de cobrança 0–6 idênticos ao legado (justos e já validados).

function decideGoogleFirst(input: EditRoutingInput): RoutingDecision {
  const complexity = classifyPromptComplexity(input.prompt)
  const isComplex = complexity === 'complex'
  const is4K = input.outputResolution === '4K'

  const area = clamp(input.maskAreaRatio, 0, 1)
  const hasMask = input.hasMask === true
  const smallMask = hasMask && area <= SMALL_MASK_MAX_RATIO
  const largeMask = hasMask && area >= LARGE_MASK_MIN_RATIO

  const isFixTool = input.tool === 'remove' || input.tool === 'fix_detail'
  const isGlobalTool =
    input.tool === 'lighting' || input.tool === 'landscaping' ||
    input.tool === 'style' || input.tool === 'variation'

  const refs = input.references ?? []
  const hasRefs = refs.length > 0

  // ── 1) PREMIUM — só com opt-in explícito. ──
  if (input.userSelectedPremium === true) {
    const heavy = is4K || largeMask || !hasMask
    return {
      endpoint:      hasMask ? 'fal-ai/nano-banana-pro/edit' : 'google/gemini-3-pro-image',
      costNodes:     heavy ? NODE_COST.premiumHeavy : NODE_COST.premium,
      isFreeFix:     false,
      shouldUseCrop: false,
      reason:        'Modo premium selecionado pelo usuário — Gemini 3 Pro Image (máxima qualidade).',
    }
  }

  // ── 2) SEM máscara → edição conversacional por instrução. ──
  if (!hasMask) {
    return {
      endpoint:      'google/gemini-3.1-flash-image',
      costNodes:     NODE_COST.global,
      isFreeFix:     false,
      shouldUseCrop: false,
      reason:        'Edição conversacional da imagem inteira — modelo padrão Google.',
    }
  }

  // COM máscara: endpoint mask-aware sempre.
  const endpoint = maskedGoogleEndpoint(input.tool, hasRefs)
  // Vertex Imagen custa ~$0.02/img vs $0.045 do NB2 — desconto de 1 node nos
  // tiers pagos (localized/medium/global). freeFix e quickFix já estão no piso.
  const vDisc = endpoint === 'vertex/imagen-edit' ? VERTEX_NODE_DISCOUNT : 0
  const decision = (costNodes: number, isFreeFix: boolean, reason: string): RoutingDecision => ({
    endpoint,
    costNodes,
    isFreeFix,
    shouldUseCrop:     cropEligible(endpoint),
    maxCropMegapixels: cropCap(endpoint, input),
    reason,
  })

  // ── 3) CORREÇÃO GRÁTIS — mesmas condições do legado. ──
  const freeEligible =
    input.isGeneratedBySpacenode === true &&
    isFixTool &&
    area <= SMALL_MASK_MAX_RATIO &&
    input.freeFixesUsedForImage <= 0 &&
    input.monthlyFreeFixesUsed < input.monthlyFreeFixesLimit &&
    !is4K &&
    !isComplex

  if (freeEligible) {
    return decision(NODE_COST.freeFix, true,
      'Pequena correção com máscara em imagem do Spacenode — dentro da cota grátis.')
  }

  // ── 4) AMPLA / CONTEXTUAL / COMPLEXA (máscara respeitada, modelo padrão). ──
  if (isGlobalTool || largeMask || isComplex) {
    return decision(Math.max(1, NODE_COST.global - vDisc), false,
      isComplex
        ? 'Pedido complexo — modelo avançado, mantendo a edição restrita à área selecionada.'
        : 'Edição ampla/contextual na área selecionada — modelo avançado.')
  }

  // ── 5) CORREÇÃO RÁPIDA PAGA (1 node). ──
  // Já no piso — desconto não se aplica (evita cobrar 0 node em edição paga).
  if (smallMask && isFixTool && input.isGeneratedBySpacenode === true && !is4K) {
    return decision(NODE_COST.quickFix, false,
      'Correção rápida com máscara (cota grátis já utilizada).')
  }

  // ── 6) LOCALIZADA (2→1 Vertex) / MÉDIA (3→2 Vertex). ──
  if (smallMask) {
    return decision(Math.max(1, NODE_COST.localized - vDisc), false, 'Edição localizada usando modo econômico.')
  }
  return decision(Math.max(1, NODE_COST.medium - vDisc), false, 'Edição de área média usando modelo padrão.')
}

/** Endpoint mask-aware Google-first por ferramenta.
 *  Vertex Imagen (inpaint com máscara REAL em pixels) é o motor padrão para
 *  todas as ferramentas de inpaint (remove/add/material/fix_detail), com ou sem
 *  referência — material_texture → REFERENCE_TYPE_STYLE, object_reference →
 *  REFERENCE_TYPE_SUBJECT (ver vertex-imagen-edit.ts). Nano Banana 2 fica como
 *  fallback quando Vertex está desligado ou para ferramentas fora do escopo. */
function maskedGoogleEndpoint(tool: EditTool, hasReferences: boolean): EditEndpoint {
  const vertexTool =
    tool === 'remove' || tool === 'add' || tool === 'material' || tool === 'fix_detail'
  // Com referências visuais → nano-banana (formato multi-imagem: source + mask + ref).
  // Sem referências → Vertex Imagen (inpaint preciso, US$0.020/img).
  if (vertexTool && vertexImagenEnabled() && !hasReferences) return 'vertex/imagen-edit'
  if (tool === 'material' || tool === 'add') return 'fal-ai/nano-banana/edit'
  return 'fal-ai/nano-banana-2/edit'
}

// ── Retry automático (quality gate) ────────────────────────────────────────────

/** Anexa a retryPolicy: 1 retry grátis com prompt mais restritivo; com
 *  EDIT_FLUX_FALLBACK=1 o retry roda no engine Flux equivalente. */
function withRetryPolicy(decision: RoutingDecision, input: EditRoutingInput): EditRoutingResult {
  const fallbackEndpoint = fluxFallbackEnabled() ? fluxFallbackFor(decision.endpoint, input) : null
  const fallback: EditRoutingResult | null = fallbackEndpoint
    ? {
        endpoint:          fallbackEndpoint,
        costNodes:         decision.costNodes,
        isFreeFix:         decision.isFreeFix,
        shouldUseCrop:     cropEligible(fallbackEndpoint),
        maxCropMegapixels: cropCap(fallbackEndpoint, input),
        reason:            'Fallback Flux do retry automático do quality gate (flag EDIT_FLUX_FALLBACK).',
        retryPolicy:       { maxAutoRetries: 0, freeRetry: true, fallback: null },
      }
    : null
  return { ...decision, retryPolicy: { maxAutoRetries: 1, freeRetry: true, fallback } }
}

/** Engine Flux equivalente para o retry (só usado atrás de flag). */
function fluxFallbackFor(endpoint: EditEndpoint, input: EditRoutingInput): EditEndpoint | null {
  // Já é Flux (caminho legado) → não há fallback distinto.
  if (endpoint.startsWith('fal-ai/flux')) return null
  // Instrução (sem máscara) → Kontext.
  if (endpoint === 'google/gemini-3.1-flash-image' || endpoint === 'google/gemini-3-pro-image') {
    return 'fal-ai/flux-pro/kontext'
  }
  // Mascarados → fill (remoção) ou inpaint ancorado.
  return input.tool === 'remove' ? 'fal-ai/flux-pro/v1/fill' : 'fal-ai/flux-kontext-lora/inpaint'
}

// ── Roteamento LEGADO (Flux) — preservado para rollback via EDIT_GOOGLE_FIRST=0 ──

function decideLegacy(input: EditRoutingInput): RoutingDecision {
  const complexity = classifyPromptComplexity(input.prompt)
  const isComplex = complexity === 'complex'

  const is4K = input.outputResolution === '4K'

  const area = clamp(input.maskAreaRatio, 0, 1)
  const hasMask = input.hasMask === true
  const smallMask = hasMask && area <= SMALL_MASK_MAX_RATIO
  const largeMask = hasMask && area >= LARGE_MASK_MIN_RATIO
  // (área média = hasMask && !smallMask && !largeMask — é o fall-through do tier 6)

  const isFixTool = input.tool === 'remove' || input.tool === 'fix_detail'
  const isGlobalTool =
    input.tool === 'lighting' || input.tool === 'landscaping' ||
    input.tool === 'style' || input.tool === 'variation'

  // Referências visuais → preferir editor multi-imagem (nano-banana/gemini).
  const refs = input.references ?? []
  const hasRefs = refs.length > 0

  // ── 1) PREMIUM — só com opt-in explícito. Nunca fallback automático. ──
  if (input.userSelectedPremium === true) {
    const heavy = is4K || largeMask || !hasMask
    return {
      endpoint:      'fal-ai/gemini-3-pro-image-preview/edit',
      costNodes:     heavy ? NODE_COST.premiumHeavy : NODE_COST.premium,
      isFreeFix:     false,
      shouldUseCrop: false,
      reason:        'Modo premium selecionado pelo usuário — Gemini 3 Pro (máxima qualidade).',
    }
  }

  // ── 2) CORREÇÃO GRÁTIS — todas as condições obrigatórias. ──
  // (gerada pelo Spacenode + remove/fix_detail + máscara ≤15% + ainda não usou
  //  grátis nesta imagem + dentro do teto mensal + não-4K + prompt não complexo)
  const freeEligible =
    input.isGeneratedBySpacenode === true &&
    isFixTool &&
    hasMask &&
    area <= SMALL_MASK_MAX_RATIO &&
    input.freeFixesUsedForImage <= 0 &&
    input.monthlyFreeFixesUsed < input.monthlyFreeFixesLimit &&
    !is4K &&
    !isComplex

  if (freeEligible) {
    const endpoint = maskedToolEndpoint(input.tool, refs)
    return {
      endpoint,
      costNodes:         NODE_COST.freeFix,
      isFreeFix:         true,
      shouldUseCrop:     cropEligible(endpoint),
      maxCropMegapixels: cropCap(endpoint, input),
      reason:            'Pequena correção com máscara em imagem do Spacenode — dentro da cota grátis.',
    }
  }

  // ── 3) EDIÇÃO AMPLA / CONTEXTUAL / SEM MÁSCARA / PROMPT COMPLEXO → avançada ──
  // Iluminação, paisagismo, máscara grande, sem máscara, ou prompt complexo
  // (mas SEM premium automático). Modelo contextual que preserva qualidade.
  if (isGlobalTool || largeMask || !hasMask || isComplex) {
    const reason = isComplex
      ? 'Prompt complexo — modelo avançado (Flux Pro Kontext). Para casos muito complexos, ative o modo premium.'
      : 'Edição ampla/contextual — modelo avançado para preservar qualidade.'
    // Com máscara + referências, usa o editor multi-imagem (Kontext é single-image
    // e ignoraria as referências).
    const endpoint: EditEndpoint = (hasMask && hasRefs) ? 'fal-ai/nano-banana/edit' : 'fal-ai/flux-pro/kontext'
    return {
      endpoint,
      costNodes:     NODE_COST.global,
      isFreeFix:     false,
      shouldUseCrop: false,
      reason,
    }
  }

  // Daqui pra frente: TEM máscara, área pequena ou média, ferramenta local,
  // prompt não complexo, sem premium.

  // ── 4) CORREÇÃO RÁPIDA PAGA (1 node) ──
  // Mesma natureza da grátis (remove/fix_detail + máscara pequena + imagem do
  // Spacenode + não-4K), mas a cota grátis acabou (já usou nesta imagem ou
  // estourou o teto mensal). Cobra simbólico de 1 node no endpoint barato.
  if (smallMask && isFixTool && input.isGeneratedBySpacenode === true && !is4K) {
    const endpoint = maskedToolEndpoint(input.tool, refs)
    return {
      endpoint,
      costNodes:         NODE_COST.quickFix,
      isFreeFix:         false,
      shouldUseCrop:     cropEligible(endpoint),
      maxCropMegapixels: cropCap(endpoint, input),
      reason:            'Correção rápida com máscara (cota grátis já utilizada).',
    }
  }

  // ── 5) EDIÇÃO LOCALIZADA SIMPLES (2 nodes) ──
  // Máscara pequena, qualquer ferramenta local (material/replace/add e também
  // remove/fix_detail em imagem não-Spacenode ou 4K). Inpaint com crop.
  if (smallMask) {
    const endpoint = maskedToolEndpoint(input.tool, refs)
    return {
      endpoint,
      costNodes:         NODE_COST.localized,
      isFreeFix:         false,
      shouldUseCrop:     cropEligible(endpoint),
      maxCropMegapixels: cropCap(endpoint, input),
      reason:            'Edição localizada usando modo econômico.',
    }
  }

  // ── 6) EDIÇÃO MÉDIA (3 nodes) ──
  // Máscara média (15–40%). MESMA decisão de endpoint que a localizada
  // (maskedToolEndpoint): material/add COM referência → inpaint ANCORADO na
  // máscara; remove → fill; resto → nano-banana. Antes cravava nano-banana e
  // ignorava as referências, então o surface-anchoring não aplicava nesse tier.
  const mediumEndpoint = maskedToolEndpoint(input.tool, refs)
  return {
    endpoint:          mediumEndpoint,
    costNodes:         NODE_COST.medium,
    isFreeFix:         false,
    shouldUseCrop:     cropEligible(mediumEndpoint),
    maxCropMegapixels: cropCap(mediumEndpoint, input),
    reason:            'Edição de área média usando modelo padrão.',
  }
}

// ── Helpers de endpoint / crop ──────────────────────────────────────────────────

/** Inpaint barato (por MP) para ferramentas de DETALHE/material pequeno com
 *  máscara (Vertex quando ligado). NÃO usado para remoção — ver maskedToolEndpoint. */
function quickFixEndpoint(): EditEndpoint {
  return vertexImagenEnabled()
    ? 'vertex/imagen-edit'
    : 'fal-ai/flux-kontext-lora/inpaint'
}

/** Motor de FILL dedicado para REMOÇÃO (limpa a área e reconstrói o fundo). */
const REMOVE_FILL_ENDPOINT: EditEndpoint = 'fal-ai/flux-pro/v1/fill'

/**
 * Endpoint para tiers COM máscara, por ferramenta (item #6).
 * flux-kontext-lora/inpaint é reference-guided (exige reference_image_url): ótimo
 * para correções sutis e 'replace' (que usa uma referência real), mas reproduzia
 * a origem em remoção e troca de material. Por isso:
 *   - 'remove'                       → motor de FILL dedicado (limpa + reconstrói);
 *   - 'material'/'add' COM referência → inpaint ANCORADO flux-kontext-lora: a
 *     máscara é restrição RÍGIDA de pixels (edita só ali, NUNCA outra superfície
 *     "parecida" — surface targeting), e a referência guia o material/objeto;
 *   - 'material'/'add' SEM referência → editor forte por instrução (nano-banana);
 *   - 'fix_detail' COM referência (consistência entre imagens) → nano-banana;
 *     sem referência → inpaint flux-kontext-lora. 'replace' usa a
 *     reference_image_url real do flux-kontext-lora, então fica no inpaint.
 * Fill e nano-banana são per-image (cropEligible=false) → mandam a imagem INTEIRA
 * (mais contexto) e o pipeline recompõe pra preservar tudo fora da máscara.
 */
function maskedToolEndpoint(tool: EditTool, references: EditReferenceImage[]): EditEndpoint {
  if (tool === 'remove') return REMOVE_FILL_ENDPOINT
  // Só referência de ANCORAGEM (textura de material / objeto) liga o inpaint
  // ancorado — outras referências (imagem original, estilo, consistência…)
  // viravam reference_image_url do flux-kontext-lora e o modelo REPRODUZIA a
  // superfície antiga (achado P1-4 da auditoria).
  const hasAnchorRef = references.some(
    r => r.role === 'material_texture' || r.role === 'object_reference',
  )
  // material/add COM referência de ancoragem → inpaint ANCORADO na máscara.
  // O nano-banana é solto e aplicava o material em OUTRA superfície parecida; o
  // flux-kontext-lora/inpaint edita SÓ os pixels da máscara (âncora espacial forte)
  // e usa a referência como reference_image_url.
  if ((tool === 'material' || tool === 'add') && hasAnchorRef) return quickFixEndpoint()
  if (tool === 'material' || tool === 'add') return 'fal-ai/nano-banana/edit'
  // fix_detail COM referência (consistência/restauração entre imagens) → editor
  // multi-imagem; sem referência → inpaint sutil. 'replace' usa a
  // reference_image_url real do flux-kontext-lora, então fica no inpaint.
  if (tool === 'fix_detail' && references.length > 0) return 'fal-ai/nano-banana/edit'
  return quickFixEndpoint()
}

/** Crop só compensa em endpoints sensíveis a área (custo por MP / por imagem pequena). */
function cropEligible(endpoint: EditEndpoint): boolean {
  return endpoint === 'fal-ai/flux-kontext-lora/inpaint'
    || endpoint === 'vertex/imagen-edit'
}

/**
 * Teto de MP a enviar no crop. O flux-kontext-lora cobra por MP, então limitar
 * a área enviada controla o custo direto. O crop real (bbox+padding) é reduzido
 * para no máximo esse valor antes de ir ao endpoint.
 */
function cropCap(endpoint: EditEndpoint, input: EditRoutingInput): number | undefined {
  if (!cropEligible(endpoint)) return undefined
  // material/replace querem mais DENSIDADE de pixel na superfície (realismo da
  // textura) → teto maior; demais ferramentas mantêm o teto econômico.
  const surfaceTool = input.tool === 'material' || input.tool === 'replace'
  const ceiling = input.outputResolution === '2K'
    ? (surfaceTool ? 3.0 : 2.5)
    : (surfaceTool ? 2.0 : 1.5)
  // Nunca pedimos mais MP do que a própria imagem tem.
  return round2(Math.min(ceiling, Math.max(0.25, input.imageMegapixels || ceiling)))
}

// ── Utilitários de apresentação (UI) ────────────────────────────────────────────
// Mantêm EditRoutingResult fiel à spec e ainda dão à UI o rótulo do botão e a
// microcópia da cobrança, derivados do resultado.

/** Endpoints do tier PREMIUM (Gemini 3 Pro Image / Nano Banana Pro). */
export function isPremiumEditEndpoint(endpoint: EditEndpoint): boolean {
  return endpoint === 'fal-ai/gemini-3-pro-image-preview/edit'
    || endpoint === 'fal-ai/nano-banana-pro/edit'
    || endpoint === 'google/gemini-3-pro-image'
}

/** Rótulo do botão de gerar. Não expõe endpoint técnico ao usuário. */
export function editButtonLabel(result: EditRoutingResult): string {
  if (result.isFreeFix) return 'Corrigir grátis'

  const n = result.costNodes
  const unit = n === 1 ? 'node' : 'nodes'

  if (isPremiumEditEndpoint(result.endpoint)) {
    return `Gerar premium — ${n} ${unit}`
  }
  if (n === 1) return `Corrigir — ${n} ${unit}`
  if (n >= 4) return `Gerar edição avançada — ${n} ${unit}`
  return `Gerar edição — ${n} ${unit}`
}

/** Microcópia explicando a cobrança (mensagens definidas no pedido de produto). */
export function editChargeExplanation(result: EditRoutingResult): string {
  if (result.isFreeFix) {
    return 'Pequena correção com máscara. Esta edição será gratuita.'
  }
  if (isPremiumEditEndpoint(result.endpoint)) {
    return 'Edição premium. Modelo de máxima qualidade para prompts complexos.'
  }
  if (result.costNodes >= 4) {
    return 'Edição ampla. Será usado um modelo avançado para preservar qualidade.'
  }
  if (result.costNodes === 1) {
    return 'Correção rápida com máscara.'
  }
  return 'Edição localizada usando modo econômico.'
}

// ── Utilitários para registrar a tentativa (image_edit_attempts) ────────────────

/** Provider derivado do endpoint, para a coluna `provider`. */
export function endpointProvider(endpoint: EditEndpoint): EditProvider {
  if (endpoint.startsWith('vertex/')) return 'vertex'
  if (endpoint.startsWith('google/')) return 'google'
  return 'fal'
}

/**
 * Ferramentas "criativas" (mudam conteúdo): recompor com borda SUAVE (feather),
 * pra o novo material/objeto se fundir ao entorno em vez de virar um recorte
 * literal da máscara pintada. remove/fix_detail preservam com borda DURA.
 */
export function isBlendTool(tool: EditTool): boolean {
  return tool === 'material' || tool === 'replace' || tool === 'add'
}

/** Custo USD estimado do provider, para `provider_cost_usd` / margem. */
export function estimateProviderCostUsd(
  endpoint: EditEndpoint,
  megapixels: number,
): number {
  const c = ENDPOINT_COST_USD[endpoint]
  const usd = c.kind === 'per_mp' ? c.usd * Math.max(1, megapixels || 1) : c.usd
  return round4(usd)
}

// ── Math helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000
}
