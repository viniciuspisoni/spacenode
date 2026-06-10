// Intenções de edição — a camada que o USUÁRIO vê no modo Editar reformulado.
//
// O fluxo é "intenção primeiro": ao entrar no Editar o usuário escolhe O QUE
// quer fazer (remover objeto, trocar material, …) e a interface se adapta
// (máscara obrigatória ou não, campos de referência, toggle de geometria,
// botões rápida/premium). Nenhum nome técnico de modelo é exposto.
//
// Compatibilidade: cada intenção mapeia para um EditMode existente (vocabulário
// da API/DB), então histórico, payloads antigos e o editRouter continuam
// funcionando. `edit_intent` vai junto no payload apenas para telemetria.

import type { EditMode } from './engines'
import type { EditReferenceRole } from './edit-router'

export type EditIntent =
  | 'remove_object'
  | 'swap_material'
  | 'insert_object'
  | 'adjust_lighting'
  | 'adjust_style'
  | 'fix_imperfection'
  | 'edit_with_reference'
  | 'controlled_variation'

export const VALID_EDIT_INTENTS: EditIntent[] = [
  'remove_object', 'swap_material', 'insert_object', 'adjust_lighting',
  'adjust_style', 'fix_imperfection', 'edit_with_reference', 'controlled_variation',
]

export function isEditIntent(v: unknown): v is EditIntent {
  return typeof v === 'string' && (VALID_EDIT_INTENTS as string[]).includes(v)
}

export type MaskRequirement = 'required' | 'optional' | 'none'

export interface EditIntentMeta {
  intent:            EditIntent
  /** Rótulo do cartão (PT, voz do produto). */
  label:             string
  /** Descrição curta no cartão. */
  description:       string
  /** Emoji/glyph do cartão (UI minimal, sem lib de ícones nova). */
  icon:              string
  /** EditMode interno correspondente (API/DB). */
  mode:              EditMode
  /** A intenção exige seleção (máscara)? */
  maskRequirement:   MaskRequirement
  /** Papel principal de referência sugerido (pré-seleciona o menu de refs). */
  primaryRefRole:    EditReferenceRole | null
  /** Layout de referência explícito (Editar com referência). */
  explicitReference: boolean
  /** Mostra o toggle "Preservar geometria, perspectiva e iluminação original". */
  geometryToggle:    boolean
  /** Placeholder do campo de prompt. */
  promptPlaceholder: string
  /** Dica curta exibida acima do canvas/prompt quando a intenção está ativa. */
  helper:            string
}

export const EDIT_INTENTS: Record<EditIntent, EditIntentMeta> = {
  remove_object: {
    intent:            'remove_object',
    label:             'Remover objeto',
    description:       'Apague móveis, pessoas, carros ou elementos indesejados.',
    icon:              '⌫',
    mode:              'remove',
    maskRequirement:   'required',
    primaryRefRole:    null,
    explicitReference: false,
    geometryToggle:    false,
    promptPlaceholder: 'Opcional: descreva o que remover (ex.: o carro à direita)',
    helper:            'Pinte o objeto inteiro, incluindo a sombra. O fundo é reconstruído automaticamente.',
  },
  swap_material: {
    intent:            'swap_material',
    label:             'Trocar material',
    description:       'Altere pisos, paredes, fachadas e acabamentos.',
    icon:              '▦',
    mode:              'material',
    maskRequirement:   'required',
    primaryRefRole:    'material_texture',
    explicitReference: false,
    geometryToggle:    true,
    promptPlaceholder: 'Ex.: madeira carvalho claro fosca, réguas largas',
    helper:            'Pinte a superfície e descreva (ou anexe) o material. A textura é aplicada só na área selecionada.',
  },
  insert_object: {
    intent:            'insert_object',
    label:             'Inserir objeto',
    description:       'Adicione móveis, vegetação ou elementos realistas.',
    icon:              '＋',
    mode:              'add',
    maskRequirement:   'required',
    primaryRefRole:    'object_reference',
    explicitReference: false,
    geometryToggle:    true,
    promptPlaceholder: 'Ex.: poltrona de couro caramelo ao lado da janela',
    helper:            'Pinte onde o novo elemento deve entrar. Escala e perspectiva seguem a cena.',
  },
  adjust_lighting: {
    intent:            'adjust_lighting',
    label:             'Alterar iluminação',
    description:       'Mude luz, sombras, temperatura e atmosfera.',
    icon:              '☀',
    mode:              'lighting',
    maskRequirement:   'optional',
    primaryRefRole:    'lighting_reference',
    explicitReference: false,
    geometryToggle:    true,
    promptPlaceholder: 'Ex.: fim de tarde, luz quente entrando pela janela',
    helper:            'Sem seleção, a cena inteira é reiluminada. Pinte uma área para limitar o efeito.',
  },
  adjust_style: {
    intent:            'adjust_style',
    label:             'Ajustar estilo',
    description:       'Refine acabamento e atmosfera sem mudar a arquitetura.',
    icon:              '✦',
    mode:              'style',
    maskRequirement:   'optional',
    primaryRefRole:    'style_reference',
    explicitReference: false,
    geometryToggle:    true,
    promptPlaceholder: 'Ex.: tornar o ambiente mais escandinavo, tons claros',
    helper:            'A geometria, a câmera e o layout são preservados — só o estilo muda.',
  },
  fix_imperfection: {
    intent:            'fix_imperfection',
    label:             'Corrigir imperfeição',
    description:       'Conserte artefatos, distorções ou falhas da imagem.',
    icon:              '✚',
    mode:              'fix',
    maskRequirement:   'required',
    primaryRefRole:    null,
    explicitReference: false,
    geometryToggle:    false,
    promptPlaceholder: 'Ex.: corrigir a deformação na borda da mesa',
    helper:            'Pinte só a falha. Pequenas correções em imagens do Spacenode podem ser grátis.',
  },
  edit_with_reference: {
    intent:            'edit_with_reference',
    label:             'Editar com referência',
    description:       'Use outra imagem como guia para a edição.',
    icon:              '⧉',
    mode:              'replace',
    maskRequirement:   'required',
    primaryRefRole:    'object_reference',
    explicitReference: true,
    geometryToggle:    true,
    promptPlaceholder: 'Ex.: substituir pela luminária da referência',
    helper:            'A referência NÃO será editada — ela apenas guia o resultado na área selecionada.',
  },
  controlled_variation: {
    intent:            'controlled_variation',
    label:             'Criar variação controlada',
    description:       'Gere uma variação fiel da imagem inteira.',
    icon:              '⎘',
    mode:              'variation',
    maskRequirement:   'none',
    primaryRefRole:    null,
    explicitReference: false,
    geometryToggle:    true,
    promptPlaceholder: 'Ex.: variar a decoração mantendo o layout e a paleta',
    helper:            'Geometria, câmera e proporções são preservadas; a variação segue o seu pedido.',
  },
}

/** Intenção → EditMode (API/DB). */
export function modeFromIntent(intent: EditIntent): EditMode {
  return EDIT_INTENTS[intent].mode
}

/** EditMode → intenção (para payloads antigos / histórico). Primeira que casa. */
export function intentFromMode(mode: EditMode): EditIntent {
  const found = VALID_EDIT_INTENTS.find(i => EDIT_INTENTS[i].mode === mode)
  return found ?? 'swap_material'
}
