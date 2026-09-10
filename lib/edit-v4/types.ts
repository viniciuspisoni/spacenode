// lib/edit-v4/types.ts
//
// Contrato do Editar V4 — o editor construído em cima do Seedream 5.0 Pro Edit.
//
// O que muda em relação ao V3, e por quê:
//
//   1. UM motor só. O V3 nasceu Google-first e carregava `quality`
//      (Flash/Pro) porque havia dois modelos Gemini para escolher. O V4 tem um
//      motor (Seedream Pro) com duas rotas (ModelArk e fal) que são a MESMA
//      qualidade — rota é detalhe de infraestrutura, não escolha de produto.
//      Então `quality` sai do contrato.
//
//   2. Resolução sai do contrato. No V3 o usuário podia pedir 1K/2K/4K, o que
//      nunca fez sentido: o resultado é recomposto DENTRO da imagem original,
//      na resolução dela. O que importa é quantos pixels o modelo gasta na
//      região editada — e a resposta certa é sempre "o máximo que a região
//      aproveita", que o motor calcula a partir do crop (ver engine.ts).
//
//   3. Uma ação nova: `replace_object`. Trocar um objeto por outro é um pedido
//      diferente de "inserir" (que assume espaço vazio) e de "remover"; junta
//      as duas coisas numa instrução só e aproveita as até 10 referências do
//      Seedream.
//
//   4. `edgeSoftness` vira campo de produto. Já existia no V3 como consequência
//      da ação (material/inserção mesclavam, remoção/refino não). Vira escolha
//      porque em archviz a resposta certa depende do material: um piso novo
//      quer borda dura no rodapé; uma vegetação inserida quer borda macia.

/** As 5 ações do produto. */
export type EditV4Action =
  | 'remove'          // tirar um elemento da cena
  | 'swap_material'   // trocar material/acabamento de uma superfície
  | 'insert_element'  // acrescentar um elemento novo
  | 'refine_area'     // corrigir falhas/artefatos de uma região
  | 'replace_object'  // trocar um objeto existente por outro

export const EDIT_V4_ACTIONS: readonly EditV4Action[] = [
  'remove',
  'swap_material',
  'insert_element',
  'refine_area',
  'replace_object',
] as const

export function isEditV4Action(value: unknown): value is EditV4Action {
  return typeof value === 'string' && (EDIT_V4_ACTIONS as readonly string[]).includes(value)
}

/** Preservação fora da seleção. Com máscara é garantia de servidor (recompose);
 *  o campo controla o rigor do PROMPT e o limiar do gate. */
export type EditV4Preservation = 'maximum' | 'standard'

/** Intensidade da alteração DENTRO da seleção. */
export type EditV4Intensity = 'subtle' | 'standard' | 'strong'

/** Borda da recomposição. 'hard' = recorte exato da seleção (preservação
 *  pixel-perfeita); 'soft' = feather, o resultado se funde ao entorno. */
export type EditV4EdgeSoftness = 'hard' | 'soft'

/** Rota do motor. As duas rodam o MESMO modelo (Seedream 5.0 Pro Edit). */
export type EditV4Provider = 'ark' | 'fal'
export type EditV4Model = 'seedream-5-pro-edit'

/** Papel da referência aceita por ação (null = a ação não usa referência). */
export type EditV4ReferenceKind = 'material' | 'object'
export interface EditV4Reference {
  kind: EditV4ReferenceKind
  url: string
}

export type EditV4Status = 'processing' | 'completed' | 'failed' | 'rejected'

/** Pedido já validado no servidor (o cliente nunca é fonte de verdade). */
export interface EditV4Request {
  action: EditV4Action
  sourceImageUrl: string
  /** PNG P&B nas dims da origem: branco = editar. null = edição por instrução. */
  maskUrl: string | null
  instruction: string
  preservation: EditV4Preservation
  intensity: EditV4Intensity
  edgeSoftness: EditV4EdgeSoftness
  references: EditV4Reference[]
}

/** Quais ações EXIGEM seleção.
 *
 *  `insert_element` e `replace_object` exigem porque sem âncora não há ONDE
 *  inserir nem QUAL objeto trocar — o modelo escolheria por conta própria.
 *  As outras três aceitam edição por instrução pura ("tirar o tapete"): o
 *  modelo localiza o alvo pelo texto e o gate semântico cuida do resto. */
export const REQUIRES_MASK: Record<EditV4Action, boolean> = {
  remove: false,
  swap_material: false,
  insert_element: true,
  refine_area: false,
  replace_object: true,
}

export const REFERENCE_KIND_FOR: Record<EditV4Action, EditV4ReferenceKind | null> = {
  remove: null,
  swap_material: 'material',
  insert_element: 'object',
  refine_area: null,
  replace_object: 'object',
}

/** Borda padrão por ação — o que o V3 fazia implicitamente, agora explícito e
 *  sobrescrevível pelo usuário. Ações que ACRESCENTAM matéria à cena mesclam;
 *  as que REPARAM o que já existe cortam na seleção. */
export const DEFAULT_EDGE_SOFTNESS: Record<EditV4Action, EditV4EdgeSoftness> = {
  remove: 'hard',
  swap_material: 'soft',
  insert_element: 'soft',
  refine_area: 'hard',
  replace_object: 'soft',
}

/** Ações que ganham dilatação leve da máscara antes de gerar: o usuário raramente
 *  contorna sombra e contato do objeto, e sem essa folga sobra um halo. */
export const DILATES_MASK: Record<EditV4Action, boolean> = {
  remove: true,
  swap_material: false,
  insert_element: false,
  refine_area: true,
  replace_object: true,
}

/** Linha gravada em `edit_v3_jobs` (a tabela é compartilhada — ver persist.ts). */
export interface EditV4JobRecord {
  user_id: string
  action_type: EditV4Action
  status: EditV4Status
  source_image_url: string
  mask_url: string | null
  prompt: string
  instruction: string | null
  provider: EditV4Provider | null
  model: EditV4Model | null
  request_id: string | null
  result_image_url: string | null
  nodes_cost: number
  charged: boolean
  quality_mode: 'standard'
  preservation_mode: EditV4Preservation
  intensity_mode: EditV4Intensity
  reference_count: number
  out_of_mask_delta: number | null
  in_mask_delta: number | null
  mask_coverage: number | null
  error_message: string | null
}
