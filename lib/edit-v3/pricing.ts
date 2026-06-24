// lib/edit-v3/pricing.ts
//
// Fonte ÚNICA de custos e preços do Editar V3. Nenhum valor de custo/preço pode
// existir hardcoded fora deste arquivo.
//
// ⚠️ TABELA DE NODES = HIPÓTESE INTERNA. O fundador autorizou cobrança REAL no
// sucesso (2026-06-23), mas a tabela em si ainda precisa ser fechada contra:
// custo real GCP por tipo, latência, margem por plano e comparação com o
// Renderizar. Os valores abaixo são o ponto de partida (alinhados ao v2); ajuste
// aqui e SOMENTE aqui. Custos USD por modelo = pricing oficial Google (2026-06).

import type {
  EditV3Action,
  EditV3Model,
  EditV3Quality,
  EditV3Resolution,
  EditV3ResolutionRequest,
} from './types'

// ── Valor do node (R$ → US$) ────────────────────────────────────────────────
export const FX_BRL_PER_USD = 5.4
/** Piso: Office anual R$0,0729/node. */
export const NODE_FLOOR_USD = 0.0729 / FX_BRL_PER_USD // ≈ 0,0135
/** Mediana ≈ R$0,10/node. */
export const NODE_MEDIAN_USD = 0.1 / FX_BRL_PER_USD // ≈ 0,0185

// ── Custo USD por modelo × resolução ────────────────────────────────────────
export const MODEL_COST_USD: Record<EditV3Model, Record<EditV3Resolution, number>> = {
  // gemini-3.1-flash-image (Nano Banana): $60/1M tokens de imagem.
  'gemini-3.1-flash-image': { '1K': 0.067, '2K': 0.101, '4K': 0.15 },
  // gemini-3-pro-image: $120/1M tokens.
  'gemini-3-pro-image': { '1K': 0.134, '2K': 0.134, '4K': 0.24 },
  // fallback FAL nano-banana/edit (per-image; a resolução segue a imagem).
  'nano-banana': { '1K': 0.039, '2K': 0.039, '4K': 0.039 },
}

/** Modelo Google por qualidade. */
export const MODEL_FOR_QUALITY: Record<EditV3Quality, EditV3Model> = {
  standard: 'gemini-3.1-flash-image',
  high: 'gemini-3-pro-image',
}

// ── Tabela de Nodes — HIPÓTESE (não publicar sem fechar a revisão) ──────────
const ECONOMIC_NODES: Record<EditV3Action, number> = {
  refine_area: 4,
  remove: 4,
  swap_material: 5,    // sem referência; com referência → 6 (abaixo)
  insert_element: 6,
}
const SWAP_MATERIAL_WITH_REFERENCE_NODES = 6
const HIGH_PRECISION_NODES = 16    // 1K/2K (gemini-3-pro-image)
const HIGH_PRECISION_4K_NODES = 30 // 4K

/** Custo em Nodes do pedido (o que o usuário paga; debitado só no sucesso). */
export function nodesForAction(opts: {
  action: EditV3Action
  quality: EditV3Quality
  hasReference: boolean
  resolution: EditV3Resolution
}): number {
  if (opts.quality === 'high') {
    return opts.resolution === '4K' ? HIGH_PRECISION_4K_NODES : HIGH_PRECISION_NODES
  }
  if (opts.action === 'swap_material' && opts.hasReference) {
    return SWAP_MATERIAL_WITH_REFERENCE_NODES
  }
  return ECONOMIC_NODES[opts.action]
}

// ── Resolução efetiva ───────────────────────────────────────────────────────
/** Resolve 'source' pela imagem real; Econômica tem teto 2K (4K só na Alta). */
export function resolveResolution(opts: {
  requested: EditV3ResolutionRequest
  imageMegapixels: number
  quality: EditV3Quality
}): EditV3Resolution {
  const fromSource: EditV3Resolution =
    opts.imageMegapixels <= 1.4 ? '1K' : opts.imageMegapixels <= 5 ? '2K' : '4K'
  const requested: EditV3Resolution =
    opts.requested === 'source' ? fromSource : opts.requested
  if (opts.quality === 'standard' && requested === '4K') return '2K'
  return requested
}

/** Custo USD estimado do provider (telemetria de margem). */
export function modelCostUsd(model: EditV3Model, resolution: EditV3Resolution): number {
  return MODEL_COST_USD[model][resolution]
}
