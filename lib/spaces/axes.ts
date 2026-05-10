// Eixos exploráveis do Spaces — variáveis que o usuário aplica preservando o DNA.
//
// Dois modos de operação:
//   - parametric    : usuário escolhe valor(es) de uma lista; motor varia o
//                     atributo mantendo a composição (Iluminação, Horário,
//                     Detalhe quando entrar).
//   - sketch_guided : usuário sobe sketches; motor aplica DNA da Vista Mestre
//                     sobre cada sketch (Ângulo).
//
// Bloco 1 entrega Iluminação completo. Sketch-guided estreia com Ângulo.

import type { Axis } from './types'

export type AxisMode = 'parametric' | 'sketch_guided'

export interface AxisOption {
  value:           string  // slug salvo em vistas.axis_value
  label:           string  // legenda na UI
  description:     string  // sub-texto curto
  color:           string  // cor representativa pro card
  promptModifier:  string  // texto que vai pro prompt FAL (em inglês — modelo entende melhor)
}

export interface AxisConfig {
  id:           Axis
  label:        string
  mode:         AxisMode
  isAvailable:  boolean
  // Sugestões de label pra eixos sketch-guided (chips na UI)
  labelSuggestions?: string[]
}

export const ILUMINACAO_OPTIONS: AxisOption[] = [
  {
    value:          'golden_hour',
    label:          'Golden hour',
    description:    'Luz dourada lateral, sombras longas',
    color:          '#E8943C',
    promptModifier: 'golden hour lighting: warm directional light from the side, soft long shadows, late afternoon atmosphere',
  },
  {
    value:          'meio_dia',
    label:          'Meio-dia',
    description:    'Sol pleno, sombras curtas',
    color:          '#F4C175',
    promptModifier: 'midday lighting: high overhead sun, short crisp shadows, bright neutral daylight',
  },
  {
    value:          'blue_hour',
    label:          'Blue hour',
    description:    'Crepúsculo azul, luzes acendendo',
    color:          '#2A4877',
    promptModifier: 'blue hour: deep blue twilight sky, interior warm lights starting to glow, dusk cinematic atmosphere',
  },
  {
    value:          'noite_interior',
    label:          'Noite interior',
    description:    'Iluminação artificial pontual',
    color:          '#1A1F2E',
    promptModifier: 'night scene: dark exterior, warm artificial lights from windows, lamps lit inside, cinematic night atmosphere',
  },
  {
    value:          'nublado',
    label:          'Nublado',
    description:    'Luz difusa, sem sombras duras',
    color:          '#B4B2A9',
    promptModifier: 'overcast lighting: soft diffuse light, no harsh shadows, neutral grey sky atmosphere',
  },
  {
    value:          'nascer_do_sol',
    label:          'Nascer do sol',
    description:    'Luz rosa-dourada, alvorada',
    color:          '#F4C0D1',
    promptModifier: 'sunrise lighting: soft pink-gold light, low angle warm sun, fresh dawn atmosphere',
  },
]

// Sugestões de nomes de ângulo para chips na UI
export const ANGULO_LABEL_SUGGESTIONS = [
  'Vista frontal',
  'Vista lateral',
  'Vista posterior',
  'Aérea',
  'Eye-level',
  'Detalhe arquitetônico',
]

export const ANGULO_OPTIONS:  AxisOption[] = []
export const HORARIO_OPTIONS: AxisOption[] = []
export const DETALHE_OPTIONS: AxisOption[] = []

export const AXIS_OPTIONS: Record<Axis, AxisOption[]> = {
  iluminacao: ILUMINACAO_OPTIONS,
  angulo:     ANGULO_OPTIONS,
  horario:    HORARIO_OPTIONS,
  detalhe:    DETALHE_OPTIONS,
}

export const AXIS_LABEL: Record<Axis, string> = {
  iluminacao: 'Iluminação',
  angulo:     'Ângulo',
  horario:    'Horário',
  detalhe:    'Detalhe',
}

export const AXIS_CONFIG: Record<Axis, AxisConfig> = {
  iluminacao: { id: 'iluminacao', label: 'Iluminação', mode: 'parametric',    isAvailable: true                                                  },
  angulo:     { id: 'angulo',     label: 'Ângulo',     mode: 'sketch_guided', isAvailable: true,  labelSuggestions: ANGULO_LABEL_SUGGESTIONS    },
  horario:    { id: 'horario',    label: 'Horário',    mode: 'parametric',    isAvailable: false                                                 },
  detalhe:    { id: 'detalhe',    label: 'Detalhe',    mode: 'parametric',    isAvailable: false                                                 },
}

export function findAxisOption(axis: Axis, value: string): AxisOption | undefined {
  return AXIS_OPTIONS[axis]?.find(o => o.value === value)
}

export function isAxisAvailable(axis: Axis): boolean {
  return AXIS_CONFIG[axis].isAvailable
}

export function getAxisMode(axis: Axis): AxisMode {
  return AXIS_CONFIG[axis].mode
}
