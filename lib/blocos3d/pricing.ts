// A cobrança do Blocos 3D parte do menor valor de node ainda possível no
// catálogo (Office anual legado). Atualizar o custo do provider e a taxa de
// desperdício a partir das faturas reais antes de mudar o motor.
export const BLOCOS3D_PROVIDER_USD = 0.40 // Tripo H3.1, PBR + textura detailed
export const BLOCOS3D_FX_BRL_PER_USD = 6.00 // cenário de proteção, não cotação do dia
export const BLOCOS3D_NODE_FLOOR_BRL = 0.0729
export const BLOCOS3D_WASTAGE_FACTOR = 1.12 // falhas estornadas e uso variável
export const BLOCOS3D_STORAGE_BRL = 0.05 // reserva por download/rehost/storage
export const BLOCOS3D_TARGET_MARGIN = 0.80

export function nodesForBlocos3D(): number {
  const costBrl = BLOCOS3D_PROVIDER_USD * BLOCOS3D_FX_BRL_PER_USD * BLOCOS3D_WASTAGE_FACTOR
    + BLOCOS3D_STORAGE_BRL
  return Math.ceil(costBrl / ((1 - BLOCOS3D_TARGET_MARGIN) * BLOCOS3D_NODE_FLOOR_BRL) / 5) * 5
}

export const BLOCOS3D_NODES = nodesForBlocos3D()

export function estimatedMargin(nodes: number, nodeValueBrl = BLOCOS3D_NODE_FLOOR_BRL): number {
  const revenue = nodes * nodeValueBrl
  const cost = BLOCOS3D_PROVIDER_USD * BLOCOS3D_FX_BRL_PER_USD * BLOCOS3D_WASTAGE_FACTOR
    + BLOCOS3D_STORAGE_BRL
  return 1 - cost / revenue
}
