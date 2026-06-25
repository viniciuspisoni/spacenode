// lib/edit-v3/types.ts
//
// Contrato do Editar V3 — reconstrução limpa (Google/Gemini-first). Vocabulário
// PRÓPRIO do V3 (não herda os tokens do v1/v2): 4 ações de produto, controles
// simples, persistência completa do job. A UI fala português; nada deste
// contrato vaza para a tela (zero jargão de provider/modelo).

/** As 4 ações do produto (brief do fundador). */
export type EditV3Action =
  | 'remove'          // Remover objeto/elemento
  | 'swap_material'   // Trocar material/textura de uma superfície
  | 'insert_element'  // Inserir um novo elemento
  | 'refine_area'     // Refinar/corrigir uma área pequena

export const EDIT_V3_ACTIONS: readonly EditV3Action[] = [
  'remove',
  'swap_material',
  'insert_element',
  'refine_area',
] as const

/** Qualidade: padrão = Gemini Flash (Nano Banana); alta = Gemini Pro (gated). */
export type EditV3Quality = 'standard' | 'high'

/** Preservação fora da seleção. */
export type EditV3Preservation = 'maximum' | 'standard'

/** Intensidade da alteração dentro da seleção. */
export type EditV3Intensity = 'subtle' | 'standard' | 'strong'

/** Resolução de saída pedida (resolvida no servidor). */
export type EditV3ResolutionRequest = 'source' | '1K' | '2K' | '4K'
export type EditV3Resolution = '1K' | '2K' | '4K'

/** Papel da referência opcional (Trocar material → material; Inserir → object). */
export type EditV3ReferenceKind = 'material' | 'object'
export interface EditV3Reference {
  kind: EditV3ReferenceKind
  url: string
}

export type EditV3Provider = 'google' | 'fal'
export type EditV3Model =
  | 'gemini-3.1-flash-image'
  | 'gemini-3-pro-image'
  | 'nano-banana'

export type EditV3Status =
  | 'processing'
  | 'completed'
  | 'failed'
  | 'rejected'

/** Pedido já validado no servidor (nunca confiar no cliente). */
export interface EditV3Request {
  action: EditV3Action
  sourceImageUrl: string
  maskUrl: string | null
  instruction: string
  quality: EditV3Quality
  preservation: EditV3Preservation
  intensity: EditV3Intensity
  outputResolution: EditV3ResolutionRequest
  references: EditV3Reference[]
}

/** Quais ações EXIGEM seleção. remove/swap_material/refine_area aceitam edição
 *  por INSTRUÇÃO (sem máscara; ex.: "retirar o tapete"); insert_element exige
 *  âncora de POSIÇÃO (sem máscara não há onde inserir). O kill-switch
 *  EDIT_V3_NO_MASK=0 reverte tudo para "exige seleção" (ver flags). */
export const REQUIRES_MASK: Record<EditV3Action, boolean> = {
  remove: false,
  swap_material: false,
  insert_element: true,
  refine_area: false,
}

/** Papel de referência aceito por ação (null = ação não usa referência). */
export const REFERENCE_KIND_FOR: Record<EditV3Action, EditV3ReferenceKind | null> = {
  remove: null,
  swap_material: 'material',
  insert_element: 'object',
  refine_area: null,
}

/** Registro persistido em edit_v3_jobs (todos os campos do brief). */
export interface EditV3JobRecord {
  user_id: string
  action_type: EditV3Action
  status: EditV3Status
  source_image_url: string
  mask_url: string | null
  prompt: string
  instruction: string | null
  provider: EditV3Provider | null
  model: EditV3Model | null
  request_id: string | null
  result_image_url: string | null
  nodes_cost: number
  charged: boolean
  quality_mode: EditV3Quality
  preservation_mode: EditV3Preservation
  intensity_mode: EditV3Intensity
  reference_count: number
  out_of_mask_delta: number | null
  in_mask_delta: number | null
  mask_coverage: number | null
  error_message: string | null
}
