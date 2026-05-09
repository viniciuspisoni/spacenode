// Eixos exploráveis do Spaces — variáveis que o usuário aplica preservando o DNA.
//
// Bloco 1 entrega Iluminação completo (6 opções). Os outros 3 eixos
// (Ângulo, Horário, Detalhe) ficam como placeholder "em breve" — Sprint 7+.

import type { Axis } from './types'

export interface AxisOption {
  value:           string  // slug salvo em vistas.axis_value
  label:           string  // legenda na UI
  description:     string  // sub-texto curto
  color:           string  // cor representativa pro card
  promptModifier:  string  // texto que vai pro prompt FAL (em inglês — modelo entende melhor)
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

export function findAxisOption(axis: Axis, value: string): AxisOption | undefined {
  return AXIS_OPTIONS[axis]?.find(o => o.value === value)
}

export function isAxisAvailable(axis: Axis): boolean {
  return AXIS_OPTIONS[axis].length > 0
}
