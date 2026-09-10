// lib/edit-v4/pricing.ts
//
// Fonte ÚNICA de custo e preço do Editar V4. Nenhum valor de dinheiro pode
// existir hardcoded fora daqui.
//
// O preço em Nodes NÃO é tabela fixa: ele é DERIVADO do custo real do provider
// e da margem-alvo. Isso é de propósito — quando o custo do fornecedor muda,
// o preço se corrige sozinho e a margem não escorrega sem ninguém notar (foi
// o que aconteceu no V3: a tabela ficou nos preços da fal enquanto o motor já
// rodava na ModelArk pela metade do preço).
//
// DUAS REGRAS DE NEGÓCIO, e elas podem brigar:
//   A. Margem-alvo de 80% (decisão do dono, 2026-09-10).
//   B. Editar custa MENOS que gerar (decisão do dono, 2026-06-25).
// Quando brigam, B ganha: o preço para no teto e a margem cede. O teto não é
// número escrito à mão — sai de lib/engines.ts, então se o render mudar de
// preço a edição acompanha e a inversão fica impossível por construção.

import { DEFAULT_ENGINE, DEFAULT_RESOLUTION, getNodesCost } from '@/lib/engines'
import type { EditV4Provider } from './types'

// ── Valor do node (R$ → US$) ────────────────────────────────────────────────

export const FX_BRL_PER_USD = 5.4

/** PISO do valor do node: o node mais barato que alguém pode ter em mãos.
 *  Hoje é o Office anual (R$ 0,0729/node) — plano aposentado em 2026-08-31 e
 *  com a venda anual pausada, mas mantido como base porque é o pior caso
 *  possível: se a margem fecha aqui, fecha para todo mundo. */
export const NODE_FLOOR_USD = 0.0729 / FX_BRL_PER_USD // ≈ 0,0135

/** Mediana real da base (≈ R$ 0,10/node). Só para telemetria — a margem-alvo
 *  nunca é calculada nela, senão o pior caso ficaria descoberto. */
export const NODE_MEDIAN_USD = 0.1 / FX_BRL_PER_USD // ≈ 0,0185

// ── Custo real por chamada ao Seedream 5.0 Pro Edit ─────────────────────────
//
// Os dois provedores cobram por ÁREA da imagem de SAÍDA, em duas faixas, mais
// um adicional por imagem de ENTRADA além da primeira (a referência).
// Conferido nas fontes em 2026-09-09/10.

export interface ProviderCost {
  /** Faixa barata (a que o V4 sempre mira — ver engine.ts). */
  low: number
  /** Faixa cara: o V4 nunca deveria cair aqui; existe pra telemetria acusar. */
  high: number
  /** Por imagem de entrada além da primeira. */
  extraInput: number
  /** Teto de pixels da faixa barata NESTE provedor. */
  lowTierMaxPixels: number
}

export const PROVIDER_COST: Record<EditV4Provider, ProviderCost> = {
  // ModelArk (BytePlus, direto): faixa barata até 2,61 MP.
  ark: { low: 0.045, high: 0.09, extraInput: 0.003, lowTierMaxPixels: 2_610_000 },
  // fal: faixa barata até 1536² = 2.359.296 px — o teto mais apertado dos dois,
  // e por isso o alvo do dimensionamento (serve aos dois provedores).
  fal: { low: 0.0675, high: 0.135, extraInput: 0.0045, lowTierMaxPixels: 1536 * 1536 },
}

/** Custo USD de uma chamada, dada a rota, os pixels de saída e quantas imagens
 *  foram enviadas. É a mesma conta que os adaptadores fazem no retorno real —
 *  esta versão serve para ESTIMAR antes de chamar. */
export function callCostUsd(opts: {
  provider: EditV4Provider
  outputPixels: number
  inputImages: number
}): number {
  const c = PROVIDER_COST[opts.provider]
  const tier = opts.outputPixels > 0 && opts.outputPixels <= c.lowTierMaxPixels ? c.low : c.high
  return tier + c.extraInput * Math.max(0, opts.inputImages - 1)
}

// ── Margem ───────────────────────────────────────────────────────────────────

/** Margem-alvo do Editar V4 (dono, 2026-09-10). O V3 mirava 50%. */
export const TARGET_MARGIN = 0.8

/** Base do valor do node para a conta de margem: o PISO, sempre. */
export const MARGIN_NODE_VALUE_USD = NODE_FLOOR_USD

/**
 * Folga sobre o custo nominal, para o que o usuário NÃO paga mas nós pagamos:
 *
 *   - geração reprovada pelo gate: o resultado é descartado, o node não é
 *     cobrado ("refazer é grátis") e a chamada ao provider já aconteceu;
 *   - queda pra rota secundária: quando a ModelArk erra, a fal atende — e
 *     custa 50% a mais.
 *
 * Calibragem (2026-09-10), assumindo ~5% de rejeição e ~5% de fallback:
 *   0,045 + 0,05 × 0,045 (rejeição)  + 0,05 × 0,027 (delta fal)  ≈ 0,0486
 *   → fator ≈ 1,08.
 * ⚠️ Revisar com taxa REAL medida assim que houver volume: a consulta é
 * `select status, provider, count(*) from edit_v3_jobs group by 1,2`.
 */
export const WASTAGE_FACTOR = 1.08

/** Tolerância do arredondamento. Sem ela, um custo que dá EXATAMENTE 18 nodes
 *  vira 19: em ponto flutuante `(0.045 × 1.08) / 0.2 / 0.0135` é
 *  18.000000000000007, e `Math.ceil` cobra o node a mais. */
const CEIL_EPSILON = 1e-9

/** Nodes necessários para a margem-alvo dado um custo USD, com o teto de
 *  segurança. Arredonda PRA CIMA (arredondar pra baixo comeria a margem). */
export function nodesForCost(costUsd: number): number {
  const revenueNeeded = (costUsd * WASTAGE_FACTOR) / (1 - TARGET_MARGIN)
  const fromMargin = Math.max(1, Math.ceil(revenueNeeded / MARGIN_NODE_VALUE_USD - CEIL_EPSILON))
  return Math.min(maxEditNodes(), fromMargin)
}

/** TETO: editar sempre custa menos que o render PADRÃO do catálogo. Derivado de
 *  lib/engines.ts — se o render mudar de preço, o teto muda junto e a regra
 *  "editar < gerar" não pode ser quebrada por esquecimento. */
export function maxEditNodes(): number {
  return Math.max(1, getNodesCost(DEFAULT_ENGINE, DEFAULT_RESOLUTION) - 1)
}

/**
 * Preço em Nodes de uma edição — VALOR FIXO, calculado da rota primária na
 * faixa barata.
 *
 * É insensível à ação e à resolução de propósito: as cinco ações são a mesma
 * chamada ao mesmo modelo, e o tamanho da saída é decidido pelo motor, não pelo
 * usuário. Também é insensível à referência: a imagem extra custa US$ 0,003
 * (1,2% da receita) e cobrar por ela deixaria o preço piscando na tela entre 18
 * e 19 conforme o usuário anexa ou remove um material. Absorver é mais barato
 * em confiança do que em dinheiro — com referência a margem ainda fecha 80,2%.
 *
 * Com os números de hoje pela ModelArk isto dá 18 nodes: o mesmo que o V3 já
 * cobrava, então a virada não é aumento de preço para ninguém.
 *
 * O que NÃO está coberto aqui é a queda pra rota secundária (fal custa 50% a
 * mais): nesses casos a margem do job cai para ~70%. É raro por construção —
 * só acontece quando a ModelArk erra — e está dentro do WASTAGE_FACTOR acima.
 */
export function nodesForEdit(opts: { provider: EditV4Provider }): number {
  return nodesForCost(PROVIDER_COST[opts.provider].low)
}

/** Margem realizada dado o preço cobrado e o custo que de fato pagamos. */
export function marginAt(
  nodes: number,
  costUsd: number,
  nodeValueUsd: number = MARGIN_NODE_VALUE_USD,
): number {
  const revenue = nodes * nodeValueUsd
  return revenue > 0 ? (revenue - costUsd) / revenue : -1
}
