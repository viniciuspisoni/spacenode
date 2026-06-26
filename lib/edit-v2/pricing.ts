// lib/edit-v2/pricing.ts
//
// Configuração CENTRAL de custos e preços do Editar v2. Nenhum valor de custo
// ou preço pode existir hardcoded fora deste arquivo (norte §4 do plano).
//
// ⚠️ STATUS DA TABELA DE NODES: **HIPÓTESE INTERNA DE TESTE** — aprovada pelo
// fundador (2026-06-12) APENAS para desenvolvimento e smokes. NÃO é a tabela
// final e NÃO pode ser publicada/cobrada em produção antes de validar: custo
// real no GCP, tempo médio de geração, qualidade Vertex c/ máscara, qualidade
// Gemini p/ referência e atmosfera, margem real por plano, percepção de valor
// e comparação com o Renderizar.
//
// Custos USD por modelo — fontes oficiais (2026-06-11/12):
//   - Gemini API/Vertex pricing (cloud.google.com/vertex-ai/generative-ai/pricing
//     e ai.google.dev/gemini-api/docs/pricing): preços IGUAIS nas duas vias.
//   - Vertex Imagen edit (~US$0,02/img): apontado em buscas oficiais mas NÃO
//     localizado na página de pricing — CONFIRMAR NA PRIMEIRA FATURA GCP.
//   - Valor do node: piso = Office anual R$0,0729/node @ FX R$5,40 (política
//     de margem do projeto, mesma do módulo de vídeo); mediana ≈ R$0,10/node.

import type {
  EditIntentV2,
  EditModelIdV2,
  OutputResolutionV2,
  QualityModeV2,
} from './types'

// ---------------------------------------------------------------------------
// Valor do node (R$ → US$)
// ---------------------------------------------------------------------------

export const FX_BRL_PER_USD = 5.4
/** Piso: Office anual (R$583/mês ÷ 8000 nodes) = R$0,0729/node. */
export const NODE_FLOOR_USD = 0.0729 / FX_BRL_PER_USD // ≈ 0.0135
/** Mediana aproximada entre os planos (Pro/Studio) ≈ R$0,10/node. */
export const NODE_MEDIAN_USD = 0.1 / FX_BRL_PER_USD // ≈ 0.0185

// ---------------------------------------------------------------------------
// Custo USD por modelo × resolução (oficial Google, salvo nota)
// ---------------------------------------------------------------------------

type ResolvedResolution = '1K' | '2K' | '4K'

export const MODEL_COST_USD: Record<EditModelIdV2, Record<ResolvedResolution, number>> = {
  // CONFIRMAR NA FATURA: edição Imagen ~$0,02/img independente de resolução
  // (saída do capability é ~1K; o pipeline recompõe a região no original).
  'imagen-3.0-capability-001': { '1K': 0.02, '2K': 0.02, '4K': 0.02 },
  // gemini-3.1-flash-image: $60/1M tokens de imagem → 1120/1680/2520 tokens.
  'gemini-3.1-flash-image': { '1K': 0.067, '2K': 0.101, '4K': 0.15 },
  // gemini-3-pro-image: $120/1M tokens → 1120 (1K e 2K) / 2000 (4K).
  'gemini-3-pro-image': { '1K': 0.134, '2K': 0.134, '4K': 0.24 },
}

/** Camadas invisíveis (gemini-2.5-flash) — medidas separadamente por pedido do
 *  fundador; estes são tetos estimados p/ telemetria até termos médias reais. */
export const NORMALIZER_COST_USD = 0.0005
export const SEMANTIC_GATE_COST_USD = 0.0015

/** Taxa média esperada de retry automático (1 retry grátis após reprovação do
 *  gate) — entra no custo esperado. Recalibrar com telemetria real. */
export const EXPECTED_RETRY_RATE = 0.2

// ---------------------------------------------------------------------------
// Tabela de Nodes — HIPÓTESE INTERNA DE TESTE (não publicar)
// ---------------------------------------------------------------------------

const ECONOMIC_NODES: Record<EditIntentV2, number> = {
  fix_image: 3,
  remove_element: 4,
  swap_material: 5, // sem referência (Vertex); com referência vira 6 (abaixo)
  insert_element: 6,
  adjust_atmosphere: 10,
}

const ECONOMIC_SWAP_MATERIAL_WITH_REFERENCE_NODES = 6

const HIGH_PRECISION_NODES = 16      // 1K/2K (gemini-3-pro-image)
const HIGH_PRECISION_4K_NODES = 30   // 4K

/** Sem edições gratuitas no v2 (decisão do fundador, 2026-06-12). As garantias
 *  de não-cobrança (falha técnica, erro de provider, rejeição do gate, retry
 *  técnico) são implementadas no fluxo de cobrança, não como preço 0 aqui. */
export function nodesFor(opts: {
  editIntent: EditIntentV2
  qualityMode: QualityModeV2
  hasReferenceImage: boolean
  resolvedResolution: ResolvedResolution
}): number {
  if (opts.qualityMode === 'high_precision') {
    return opts.resolvedResolution === '4K' ? HIGH_PRECISION_4K_NODES : HIGH_PRECISION_NODES
  }
  if (opts.editIntent === 'swap_material' && opts.hasReferenceImage) {
    return ECONOMIC_SWAP_MATERIAL_WITH_REFERENCE_NODES
  }
  return ECONOMIC_NODES[opts.editIntent]
}

// ---------------------------------------------------------------------------
// Resolução efetiva
// ---------------------------------------------------------------------------

/** Resolve 'source' pela imagem real e aplica o teto da Econômica (2K).
 *  4K só existe em Alta precisão — na Econômica, pedido 4K vira 2K (a UI nem
 *  oferece 4K fora de Alta precisão; isto é defesa em profundidade). */
export function resolveOutputResolution(opts: {
  outputResolution: OutputResolutionV2
  imageMegapixels: number
  qualityMode: QualityModeV2
}): ResolvedResolution {
  const fromSource: ResolvedResolution =
    opts.imageMegapixels <= 1.4 ? '1K' : opts.imageMegapixels <= 5 ? '2K' : '4K'
  const requested: ResolvedResolution =
    opts.outputResolution === 'source' ? fromSource : opts.outputResolution
  if (opts.qualityMode === 'economic' && requested === '4K') return '2K'
  return requested
}

// ---------------------------------------------------------------------------
// Custo esperado e margem (telemetria de negócio por tentativa)
// ---------------------------------------------------------------------------

export function expectedProviderCostUsd(
  model: EditModelIdV2,
  resolution: ResolvedResolution,
  retryRate: number = EXPECTED_RETRY_RATE,
): number {
  const base = MODEL_COST_USD[model][resolution]
  return round4(base * (1 + retryRate))
}

export function expectedOverheadCostUsd(opts: { normalizer: boolean; semanticGate: boolean }): number {
  return round4(
    (opts.normalizer ? NORMALIZER_COST_USD : 0) +
    // gate roda no resultado e no retry (quando houver) — teto de 2 execuções
    (opts.semanticGate ? SEMANTIC_GATE_COST_USD * (1 + EXPECTED_RETRY_RATE) : 0),
  )
}

export function marginAt(nodeValueUsd: number, nodes: number, costUsd: number): number {
  const revenue = nodes * nodeValueUsd
  if (revenue <= 0) return -1
  return round4((revenue - costUsd) / revenue)
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
