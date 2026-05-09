// Catálogo de Lumens — créditos avulsos com 90 dias de validade.
//
// Restrição de venda: apenas para usuários com plano ativo (≠ 'free')
// nos primeiros 6 meses pós-launch. A checagem fica na rota de
// checkout, não aqui — esta lib é fonte de verdade só do catálogo.

export type LumenPackSize = 500 | 1500 | 4000

export interface LumenPack {
  id: LumenPackSize
  name: string
  nodes: number
  price: number
  pricePerNode: number
}

export const LUMEN_PACKS: LumenPack[] = [
  { id:  500, name: 'Lumen 500',   nodes:  500, price:  89, pricePerNode: 0.178 },
  { id: 1500, name: 'Lumen 1.500', nodes: 1500, price: 219, pricePerNode: 0.146 },
  { id: 4000, name: 'Lumen 4.000', nodes: 4000, price: 499, pricePerNode: 0.125 },
]

export const LUMEN_VALIDITY_DAYS = 90

export function getLumenPackById(id: LumenPackSize): LumenPack | undefined {
  return LUMEN_PACKS.find(p => p.id === id)
}

export function isLumenPackSize(value: unknown): value is LumenPackSize {
  return value === 500 || value === 1500 || value === 4000
}

/**
 * Server-side only. Lê o Stripe price ID a partir das envs no padrão
 * STRIPE_PRICE_ID_LUMEN_{SIZE} (ex.: STRIPE_PRICE_ID_LUMEN_1500).
 */
export function getLumenStripePriceId(id: LumenPackSize): string | undefined {
  return process.env[`STRIPE_PRICE_ID_LUMEN_${id}`]
}
