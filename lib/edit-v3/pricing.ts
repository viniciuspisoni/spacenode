// lib/edit-v3/pricing.ts
//
// Fonte ÚNICA de custos e preços do Editar V3. Nenhum valor de custo/preço pode
// existir hardcoded fora deste arquivo.
//
// PREÇO DERIVADO DA MARGEM (2026-06-25): o preço em Nodes NÃO é tabela fixa — sai
// do CUSTO real do provider. REGRA do dono: editar custa MENOS que gerar uma
// imagem (a geração vai até 40 nodes em NB Pro 4K; padrão Vega 2K = 20) — por
// isso a margem-alvo é 50% (menor que os ~70% da geração), com teto de segurança
// MAX_EDIT_NODES. ⚠️ PENDENTE antes de ligar cobrança em produção: validar
// custo/latência reais. Custos USD por modelo = pricing oficial Google (2026-06).

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
  // gemini-3.1-flash-image (Nano Banana): $60/1M tokens de imagem de saída.
  //   2K = $0,12 MEDIDO (2 amostras reais 2026-06-25: ~1960 tokens de saída ≈
  //   $0,116–0,119 + entrada) → 18 nodes. 1K e 4K = ESTIMATIVAS (não amostradas)
  //   — calibrar com edições reais nessas resoluções (token-log).
  'gemini-3.1-flash-image': { '1K': 0.067, '2K': 0.12, '4K': 0.168 },
  // gemini-3-pro-image: $120/1M tokens (ESTIMATIVA, não amostrado).
  'gemini-3-pro-image': { '1K': 0.134, '2K': 0.134, '4K': 0.24 },
  // fallback FAL nano-banana/edit (per-image; a resolução segue a imagem).
  'nano-banana': { '1K': 0.039, '2K': 0.039, '4K': 0.039 },
}

/** Modelo Google por qualidade. */
export const MODEL_FOR_QUALITY: Record<EditV3Quality, EditV3Model> = {
  standard: 'gemini-3.1-flash-image',
  high: 'gemini-3-pro-image',
}

// ── Preço em Nodes — DERIVADO da margem-alvo ────────────────────────────────
// As 4 ações usam a MESMA chamada Gemini na mesma resolução → mesmo custo →
// mesmo preço. O preço depende só de qualidade × resolução, não da ação.

/** Margem-alvo do Editar V3. MENOR que a geração de propósito: editar tem que
 *  custar menos que gerar uma imagem (decisão do dono 2026-06-25), nem que a
 *  margem caia um pouco. 50% mantém todo o leque de edição abaixo da geração. */
export const TARGET_MARGIN = 0.50

/** Base do valor do node para a margem. Piso (Office anual) = pior caso →
 *  garante margem ≥ alvo para TODOS os planos. */
export const MARGIN_NODE_VALUE_USD = NODE_FLOOR_USD

/** Folga p/ gerações REJEITADAS pelo gate (pagas ao Google, não cobradas do
 *  usuário — garantia). 1.0 = sem folga; subir p/ ~1.15 quando houver taxa real
 *  de rejeição medida. */
export const WASTAGE_FACTOR = 1.0

/** TETO de segurança: editar NUNCA custa ≥ que gerar. A geração cobra no máx
 *  40 nodes (NB Pro 4K) → edição fica abaixo disso. Se o custo do provider subir,
 *  o preço para neste teto (a margem cede, como o dono aceitou). */
export const MAX_EDIT_NODES = 38

/** Nodes para a margem-alvo dado o custo USD do provider, com teto de segurança.
 *  Arredonda PRA CIMA (preserva a margem); piso 1, teto MAX_EDIT_NODES. */
export function nodesForCost(costUsd: number): number {
  const revenueNeeded = (costUsd * WASTAGE_FACTOR) / (1 - TARGET_MARGIN)
  const fromMargin = Math.max(1, Math.ceil(revenueNeeded / MARGIN_NODE_VALUE_USD))
  return Math.min(MAX_EDIT_NODES, fromMargin)
}

/** Custo em Nodes do pedido (o que o usuário paga; debitado só no sucesso). */
export function nodesForAction(opts: {
  action?: EditV3Action
  quality: EditV3Quality
  hasReference?: boolean
  resolution: EditV3Resolution
}): number {
  return nodesForCost(MODEL_COST_USD[MODEL_FOR_QUALITY[opts.quality]][opts.resolution])
}

/** Margem realizada dado nodes × custo (telemetria/verificação). */
export function marginAt(nodes: number, costUsd: number, nodeValueUsd: number = MARGIN_NODE_VALUE_USD): number {
  const revenue = nodes * nodeValueUsd
  return revenue > 0 ? (revenue - costUsd) / revenue : -1
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

/** Custo USD REAL dos tokens de imagem de SAÍDA (a parte dominante), a partir da
 *  contagem real de tokens da resposta. Flash $60/1M, Pro $120/1M. NÃO inclui os
 *  tokens de ENTRADA (texto + imagens enviadas) — o custo all-in do Google é um
 *  pouco maior; conferir no usage/fatura do Google. */
export function outputImageCostUsd(model: EditV3Model, outputTokens: number): number {
  const ratePerMillion = model === 'gemini-3-pro-image' ? 120 : 60
  return (outputTokens / 1_000_000) * ratePerMillion
}
