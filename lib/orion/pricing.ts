// ── Orion · tarifas e estimativa de custo ────────────────────────────────────
//
// O piloto NÃO cobra nodes do usuário — mas precisa saber quanto custou de
// verdade, porque a decisão de adotar (ou não) o GPT Image 2.5 depende disso.
//
// Regra dura deste módulo: DADO DESCONHECIDO NÃO VIRA ZERO. Se o fornecedor
// não devolveu usage (a fal.ai, por exemplo, não devolve tokens), a estimativa
// sai `null` com o motivo em `missing` — nunca 0,00.
//
// Tarifas conferidas em 2026-09-10 na doc oficial da OpenAI (mesma tabela para
// Sunburst e Flare). ATENÇÃO: a API direta e a fal.ai cobravam POR TOKEN nos
// mesmos valores publicados na investigação inicial — não presuma que a direta
// é mais barata; o piloto existe pra medir.

import type { OrionProvider, OrionVariant } from './config'

export const ORION_TARIFF_VERSION = '2026-09-10'
export const ORION_TARIFF_SOURCE =
  'https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst'

/** USD por 1.000.000 de tokens. */
export const ORION_USD_PER_MTOK = {
  textInput:        5,
  textInputCached:  1.25,
  imageInput:       8,
  imageInputCached: 2,
  imageOutput:      30,
} as const

/** Uso bruto informado pelo fornecedor. `null` = não informado. */
export interface OrionUsage {
  inputTokens:        number | null
  inputTextTokens:    number | null
  inputImageTokens:   number | null
  inputCachedTokens:  number | null
  outputTokens:       number | null
  outputImageTokens:  number | null
  totalTokens:        number | null
}

export const EMPTY_ORION_USAGE: OrionUsage = {
  inputTokens:       null,
  inputTextTokens:   null,
  inputImageTokens:  null,
  inputCachedTokens: null,
  outputTokens:      null,
  outputImageTokens: null,
  totalTokens:       null,
}

export interface OrionCostEstimate {
  /** USD estimado. `null` sempre que faltar algum componente — nunca 0 por
   *  desconhecimento (0 real só acontece com 0 token informado). */
  usd: number | null
  breakdown: {
    textInputUsd:   number | null
    imageInputUsd:  number | null
    cachedInputUsd: number | null
    imageOutputUsd: number | null
  }
  /** O que impediu a conta de fechar (fica no generation_log). */
  missing: string[]
  /** Premissas aplicadas — o número existe, mas com ressalva declarada. */
  assumptions: string[]
  tariffVersion: string
  tariffSource:  string
  /** 'provider' = o fornecedor informou a cobrança; 'estimate' = calculado
   *  aqui a partir dos tokens. Hoje nenhum dos dois informa cobrança em USD,
   *  então é sempre 'estimate' — o campo existe pra não confundir os dois. */
  kind: 'estimate' | 'provider'
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null

/** Normaliza o objeto `usage` da Image API da OpenAI. Campos ausentes viram
 *  null (nunca 0). Formato conferido em 2026-09-10: input_tokens,
 *  input_tokens_details{text_tokens,image_tokens,cached_tokens?},
 *  output_tokens, output_tokens_details{image_tokens?}, total_tokens. */
export function parseOpenAiUsage(raw: unknown): OrionUsage {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_ORION_USAGE }
  const u = raw as Record<string, unknown>
  const inDet = (u.input_tokens_details ?? {}) as Record<string, unknown>
  const outDet = (u.output_tokens_details ?? {}) as Record<string, unknown>
  return {
    inputTokens:       num(u.input_tokens),
    inputTextTokens:   num(inDet.text_tokens),
    inputImageTokens:  num(inDet.image_tokens),
    inputCachedTokens: num(inDet.cached_tokens),
    outputTokens:      num(u.output_tokens),
    outputImageTokens: num(outDet.image_tokens),
    totalTokens:       num(u.total_tokens),
  }
}

const usdFor = (tokens: number, perMtok: number) => (tokens / 1_000_000) * perMtok

/** Estimativa em USD a partir do uso de tokens. Só devolve número quando os
 *  componentes necessários existem — o resto vira `missing`. */
export function estimateOrionCostUsd(usage: OrionUsage): OrionCostEstimate {
  const missing: string[] = []
  const assumptions: string[] = []

  // Tokens de entrada em cache são cobrados mais barato, mas a API não diz se
  // são de texto ou de imagem. Numa edição a imagem domina a entrada, então
  // atribuímos ao bucket de IMAGEM e declaramos a premissa — o uso bruto fica
  // gravado do lado, pra quem quiser refazer a conta.
  const cached = usage.inputCachedTokens ?? 0
  if (cached > 0) assumptions.push('cached_tokens_atribuidos_a_entrada_de_imagem')

  let textInputUsd: number | null = null
  if (usage.inputTextTokens !== null) {
    textInputUsd = usdFor(usage.inputTextTokens, ORION_USD_PER_MTOK.textInput)
  } else {
    missing.push('input_text_tokens')
  }

  let imageInputUsd: number | null = null
  let cachedInputUsd: number | null = null
  if (usage.inputImageTokens !== null) {
    const billableCached = Math.min(cached, usage.inputImageTokens)
    const uncached = usage.inputImageTokens - billableCached
    imageInputUsd = usdFor(uncached, ORION_USD_PER_MTOK.imageInput)
    cachedInputUsd = usdFor(billableCached, ORION_USD_PER_MTOK.imageInputCached)
  } else {
    missing.push('input_image_tokens')
  }

  let imageOutputUsd: number | null = null
  const outTokens = usage.outputImageTokens ?? usage.outputTokens
  if (outTokens !== null) {
    imageOutputUsd = usdFor(outTokens, ORION_USD_PER_MTOK.imageOutput)
  } else {
    missing.push('output_tokens')
  }

  const complete =
    missing.length === 0 &&
    textInputUsd !== null && imageInputUsd !== null &&
    cachedInputUsd !== null && imageOutputUsd !== null

  return {
    usd: complete ? textInputUsd! + imageInputUsd! + cachedInputUsd! + imageOutputUsd! : null,
    breakdown: { textInputUsd, imageInputUsd, cachedInputUsd, imageOutputUsd },
    missing,
    assumptions,
    tariffVersion: ORION_TARIFF_VERSION,
    tariffSource:  ORION_TARIFF_SOURCE,
    kind: 'estimate',
  }
}

/** Linha de custo pro generation_log — inclui o uso bruto E o normalizado,
 *  pra que a comparação seja refeita depois sem depender desta versão de
 *  tarifa. `provider`/`variant` entram porque a tabela pode divergir por
 *  fornecedor no futuro (hoje é a mesma). */
export function buildOrionCostRecord(args: {
  provider: OrionProvider
  variant:  OrionVariant
  model:    string
  usage:    OrionUsage
  usageRaw: unknown
}) {
  const estimate = estimateOrionCostUsd(args.usage)
  return {
    provider:       args.provider,
    variant:        args.variant,
    model:          args.model,
    usage:          args.usage,
    usage_raw:      args.usageRaw ?? null,
    usage_reported: args.usageRaw != null,
    estimated_usd:  estimate.usd,
    cost_kind:      estimate.kind,
    breakdown_usd:  estimate.breakdown,
    missing:        estimate.missing,
    assumptions:    estimate.assumptions,
    tariff_version: estimate.tariffVersion,
    tariff_source:  estimate.tariffSource,
  }
}
