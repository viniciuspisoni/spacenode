// Estimativa conservadora por geração, usada como guarda antes do débito.
// Revisar as tarifas oficiais antes de cada alteração do catálogo. Não é uma
// medição da fatura real: retry e custo de entrega são reservas explícitas.
import { PLANS } from '@/lib/plans'
import { getNodeCost, requireVideoModel } from './models'

export const VIDEO_MARGIN_FLOOR = 0.80
export const VIDEO_MARGIN_TARGET = 0.83

const FX_FLOOR_BRL_PER_USD = 5.40
const NET_REVENUE_FACTOR = 0.90 // reserva de 10% sobre receita p/ tributos e cobrança
const GENERATION_RESERVE = 1.20 // até 20% de custo médio adicional em tentativas
const DELIVERY_RESERVE_BRL = 0.12 // análise, QA e armazenamento por vídeo

// Áudio desligado. Tarifas verificadas nas páginas oficiais da fal em 01/10/26.
// Lite: https://fal.ai/models/fal-ai/veo3.1/lite/image-to-video
// Veo: https://fal.ai/models/fal-ai/veo3.1/image-to-video
// Kling: https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video
const USD_PER_SECOND: Record<string, number> = {
  'fal-ai/veo3.1/lite/image-to-video':                 0.05, // 1080p
  'spacenode/veo3.1-lite-720/image-to-video':         0.03, // 720p
  'fal-ai/veo3.1/image-to-video':                      0.20,
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 0.07,
}

// Inclui os planos legados: ainda podem ter assinantes ativos. Usar o total
// anual exato em vez do preço mensal arredondado anunciado na vitrine.
export const MIN_NET_BRL_PER_NODE = Math.min(
  ...PLANS.flatMap(plan => [
    plan.monthlyPrice / plan.nodes,
    plan.annualTotal / 12 / plan.nodes,
  ]),
) * NET_REVENUE_FACTOR

export function videoFxBrlPerUsd(raw = process.env.ANIMAR_USD_BRL): number {
  if (raw === undefined || raw === '') return FX_FLOOR_BRL_PER_USD
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('ANIMAR_USD_BRL inválido')
  return Math.max(parsed, FX_FLOOR_BRL_PER_USD)
}

export function videoEconomics(modelId: string, duration: string, fx = videoFxBrlPerUsd()) {
  const model = requireVideoModel(modelId)
  const usdPerSecond = USD_PER_SECOND[modelId]
  if (!usdPerSecond || !model.isAvailable) return null // motor sem custo auditado é bloqueado
  const nodes = getNodeCost(modelId, duration)
  const estimatedCostBrl = Number(duration) * usdPerSecond * fx * GENERATION_RESERVE + DELIVERY_RESERVE_BRL
  const netRevenueBrl = nodes * MIN_NET_BRL_PER_NODE
  return {
    nodes,
    estimatedCostBrl,
    netRevenueBrl,
    margin: 1 - estimatedCostBrl / netRevenueBrl,
    resolution: model.supportedResolutions[0],
  }
}

export function hasSafeVideoMargin(modelId: string, duration: string, fx?: number): boolean {
  const quote = videoEconomics(modelId, duration, fx)
  return quote !== null && quote.margin > VIDEO_MARGIN_FLOOR
}
