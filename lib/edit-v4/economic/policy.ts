import { getNodesCost } from '@/lib/engines'
/** Frozen planning basis; release still requires measured costs and new-scene QA. */
export const ECONOMIC_NODES = 10
export const ECONOMIC_TARGET_MARGIN = 0.7389
export const ECONOMIC_NODE_BRL = 89 / 750 // Active Starter legacy; Office excluded.
export const ECONOMIC_FX = 6
export const ECONOMIC_VARIABLE_FEES = 0.08
export const FLASH_IMAGE_USD = 0.018
export const INFRA_RESERVE_USD = 0.0013333333333333333
export const EXTRA_VARIABLE_RESERVE_USD = 0.003459577777777778
export const ECONOMIC_REVENUE_USD = ECONOMIC_NODES * ECONOMIC_NODE_BRL / ECONOMIC_FX
export const MAX_USEFUL_PROCESSING_USD = ECONOMIC_REVENUE_USD * (1 - ECONOMIC_VARIABLE_FEES - ECONOMIC_TARGET_MARGIN)
export const MIN_PLANNING_YIELD = 0.9
export const MAX_ATTEMPT_PROCESSING_USD = MAX_USEFUL_PROCESSING_USD * MIN_PLANNING_YIELD
export const STAGE_CAPS = { reader: 0.004, editor: FLASH_IMAGE_USD, judge: 0.004 } as const
export const PALETTES = {
  navy: [20, 34, 58], sage: [112, 128, 106], olive: [100, 105, 60], forest: [31, 71, 49],
} as const
export type Palette = keyof typeof PALETTES
export function economicMargin(processingPerUsefulUsd: number): number {
  return 1 - ECONOMIC_VARIABLE_FEES - processingPerUsefulUsd / ECONOMIC_REVENUE_USD
}
export function economicEnabled(userId: string): boolean {
  const users = (process.env.EDIT_V4_ECONOMIC_USERS ?? '').split(',').map(x => x.trim()).filter(Boolean)
  return process.env.EDIT_V4_ECONOMIC === '1' && users.includes(userId)
}
export function economicPaidCallsEnabled(): boolean {
  return process.env.EDIT_V4_ECONOMIC_PAID_CALLS === '1'
}

/** Arithmetic guard only; equivalent full-scene quality/resolution is still a release gate. */
export function economicHalfPriceFits(): boolean { return ECONOMIC_NODES <= Math.floor(getNodesCost('quasar','2k') / 2) }
