// Catálogo de Nodes extras — créditos avulsos SEM validade.
//
// O conceito "Lumens" foi aposentado em 2026-08-31: todo crédito é "Node".
// Nodes MENSAIS renovam com o plano (profiles.credits, não acumulam);
// Nodes EXTRAS são comprados avulsos e não expiram (tabela lumen_packs —
// nome interno preservado; ver migration 20260831190000). O consumo usa
// primeiro os mensais, depois os extras na ordem de compra
// (consume_nodes_v2).
//
// Restrição de venda: qualquer plano PAGO (Starter incluso desde
// 2026-08-31, junto com a aposentadoria do plano Office). A checagem fica
// na rota de checkout, não aqui — esta lib é fonte de verdade só do
// catálogo.

export type ExtraPackSize = 500 | 1500 | 4000

export interface ExtraNodePack {
  id: ExtraPackSize
  name: string
  nodes: number
  price: number
  pricePerNode: number
}

export const EXTRA_NODE_PACKS: ExtraNodePack[] = [
  { id:  500, name: 'Pack 500',   nodes:  500, price:  89, pricePerNode: 0.178 },
  { id: 1500, name: 'Pack 1.500', nodes: 1500, price: 219, pricePerNode: 0.146 },
  { id: 4000, name: 'Pack 4.000', nodes: 4000, price: 499, pricePerNode: 0.125 },
]

export function getExtraPackById(id: ExtraPackSize): ExtraNodePack | undefined {
  return EXTRA_NODE_PACKS.find(p => p.id === id)
}

export function isExtraPackSize(value: unknown): value is ExtraPackSize {
  return value === 500 || value === 1500 || value === 4000
}

/**
 * Server-side only. Lê o Stripe price ID a partir das envs no padrão
 * STRIPE_PRICE_ID_LUMEN_{SIZE} (ex.: STRIPE_PRICE_ID_LUMEN_1500).
 * O nome da env preserva o legado "Lumen" de propósito — os prices do
 * Stripe e as envs da Vercel já existem com esse nome; renomear seria
 * churn de configuração sem ganho (o usuário nunca vê env).
 */
export function getExtraPackStripePriceId(id: ExtraPackSize): string | undefined {
  return process.env[`STRIPE_PRICE_ID_LUMEN_${id}`]
}
