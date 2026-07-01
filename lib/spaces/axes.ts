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

import type { Axis, BriefingArquitetonico } from './types'

export type AxisMode = 'parametric' | 'sketch_guided'

// Ícones (line-art) usados pelos cards de Detalhe — um recorte não tem "cor
// representativa" como a luz tem, então o card mostra um ícone neutro.
export type DetailIconKey =
  | 'layers' | 'bulb' | 'sofa' | 'frame' | 'focus' | 'grid'
  | 'counter' | 'bed' | 'door' | 'building' | 'plant'

export interface AxisOption {
  value:           string  // slug salvo em vistas.axis_value
  label:           string  // legenda na UI
  description:     string  // sub-texto curto
  color:           string  // cor representativa pro card (eixo Luz)
  promptModifier:  string  // texto que vai pro prompt FAL (em inglês — modelo entende melhor)
  icon?:           DetailIconKey  // quando presente, o card mostra ícone no lugar do swatch (Detalhe)
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
    description:    'Sol pleno, sombras curtas, leitura limpa',
    color:          '#F4C175',
    promptModifier: 'midday lighting: high overhead sun, short crisp shadows, bright neutral daylight',
  },
  {
    value:          'blue_hour',
    label:          'Blue hour',
    description:    'Crepúsculo azul, luzes internas acendendo',
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
    description:    'Luz difusa, sombras suaves',
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

// ── Detalhe ───────────────────────────────────────────────────
//
// Recortes aproximados do MESMO projeto (crop/zoom da Vista Mestre),
// preservando materiais, estilo, paleta e linguagem. NÃO é redesenho nem nova
// câmera — é um enquadramento mais fechado da cena existente (ver
// lib/spaces/preserve-prompt.ts, mode='detalhe').
//
// Os cards se adaptam ao contexto do projeto (default / corporativo /
// residencial / exterior). Como o slug é validado pela rota via
// findAxisOption('detalhe', slug), DETALHE_OPTIONS é a UNIÃO de todos os cards
// possíveis — a UI mostra só o subconjunto do contexto (detalheOptionsForContext).
//
// `promptModifier` (inglês) é o ALVO do recorte — entra como "Requested change"
// no userIntentBlock do preserve-prompt, depois do "closer architectural crop
// focused on …".

export type DetalheContext = 'default' | 'corporativo' | 'residencial' | 'exterior'

const DETAIL_CARD: Record<string, AxisOption> = {
  materialidade: {
    value: 'materialidade', label: 'Materialidade', icon: 'layers',
    description: 'Close nos encontros de materiais, texturas e acabamentos.',
    color: '#8A8276',
    promptModifier: 'a tight crop of the material meeting points, textures and finishes of the project',
  },
  iluminacao_detalhe: {
    value: 'iluminacao_detalhe', label: 'Iluminação', icon: 'bulb',
    description: 'Recorte de luminárias, luz indireta e pontos de destaque.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the lighting fixtures, indirect light and highlight points already present in the scene',
  },
  mobiliario: {
    value: 'mobiliario', label: 'Mobiliário', icon: 'sofa',
    description: 'Aproximação dos móveis principais e composição do ambiente.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the main furniture and the composition of the room',
  },
  parede_destaque: {
    value: 'parede_destaque', label: 'Parede de destaque', icon: 'frame',
    description: 'Recorte de painéis, arte, textura ou elemento focal.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the feature wall: panels, art, texture or focal element',
  },
  area_principal: {
    value: 'area_principal', label: 'Área principal', icon: 'focus',
    description: 'Detalhe do ponto mais importante da cena.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the most important focal area of the scene',
  },
  encontro_materiais: {
    value: 'encontro_materiais', label: 'Encontro de materiais', icon: 'layers',
    description: 'Transições entre madeira, pedra, vidro, metal ou tecido.',
    color: '#8A8276',
    promptModifier: 'a tight crop of the transitions between materials such as wood, stone, glass, metal and fabric',
  },
  // Corporativo
  mesa_executiva: {
    value: 'mesa_executiva', label: 'Mesa executiva', icon: 'focus',
    description: 'Aproximação da mesa principal e composição de trabalho.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the executive desk and the main work composition',
  },
  lounge: {
    value: 'lounge', label: 'Lounge', icon: 'sofa',
    description: 'Recorte da área de estar ou espera do ambiente.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the lounge / waiting seating area',
  },
  divisorias_vidro: {
    value: 'divisorias_vidro', label: 'Divisórias de vidro', icon: 'grid',
    description: 'Detalhe das divisórias, esquadrias e transparências.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the glass partitions, frames and transparencies',
  },
  // Residencial
  estar: {
    value: 'estar', label: 'Estar', icon: 'sofa',
    description: 'Aproximação da sala de estar e sua composição.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the living area and its composition',
  },
  cozinha_bancada: {
    value: 'cozinha_bancada', label: 'Cozinha / bancada', icon: 'counter',
    description: 'Recorte da bancada, cuba e marcenaria da cozinha.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the kitchen countertop, sink and cabinetry',
  },
  marcenaria: {
    value: 'marcenaria', label: 'Marcenaria', icon: 'counter',
    description: 'Detalhe dos móveis planejados e acabamentos de madeira.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the built-in joinery and wood finishes',
  },
  cabeceira: {
    value: 'cabeceira', label: 'Cabeceira', icon: 'bed',
    description: 'Recorte da cabeceira e composição do dormitório.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the headboard and the bedroom composition',
  },
  // Exterior
  acesso: {
    value: 'acesso', label: 'Acesso', icon: 'door',
    description: 'Recorte da entrada principal e do acesso ao projeto.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the main entrance and access of the project',
  },
  fachada: {
    value: 'fachada', label: 'Fachada', icon: 'building',
    description: 'Detalhe de um trecho da fachada e seus elementos.',
    color: '#8A8276',
    promptModifier: 'a closer crop of a section of the facade and its elements',
  },
  paisagismo: {
    value: 'paisagismo', label: 'Paisagismo', icon: 'plant',
    description: 'Recorte do paisagismo e da vegetação já presentes.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the existing landscaping and vegetation already present',
  },
  varanda: {
    value: 'varanda', label: 'Varanda', icon: 'building',
    description: 'Aproximação da varanda ou área externa coberta.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the balcony / covered outdoor area',
  },
  brises_esquadrias: {
    value: 'brises_esquadrias', label: 'Brises / esquadrias', icon: 'grid',
    description: 'Detalhe de brises, esquadrias e elementos de fachada.',
    color: '#8A8276',
    promptModifier: 'a tight crop of the brises/sunscreens, window frames and facade elements',
  },
  materialidade_externa: {
    value: 'materialidade_externa', label: 'Materialidade externa', icon: 'layers',
    description: 'Encontros de revestimentos e materiais da fachada.',
    color: '#8A8276',
    promptModifier: 'a tight crop of the external cladding and facade material meeting points',
  },
}

const DETALHE_BY_CONTEXT: Record<DetalheContext, string[]> = {
  default:     ['materialidade', 'iluminacao_detalhe', 'mobiliario', 'parede_destaque', 'area_principal', 'encontro_materiais'],
  corporativo: ['mesa_executiva', 'lounge', 'divisorias_vidro', 'materialidade', 'iluminacao_detalhe', 'parede_destaque'],
  residencial: ['estar', 'cozinha_bancada', 'marcenaria', 'cabeceira', 'iluminacao_detalhe', 'materialidade'],
  exterior:    ['acesso', 'fachada', 'paisagismo', 'varanda', 'brises_esquadrias', 'materialidade_externa'],
}

// União de todos os cards — usada pela rota pra validar qualquer slug de Detalhe.
export const DETALHE_OPTIONS: AxisOption[] = Object.values(DETAIL_CARD)

// Cards exibidos na UI conforme o contexto do projeto.
export function detalheOptionsForContext(ctx: DetalheContext): AxisOption[] {
  return DETALHE_BY_CONTEXT[ctx].map(slug => DETAIL_CARD[slug])
}

// Resolve o contexto a partir da categoria + briefing arquitetônico. Exterior
// (fachada/áreas externas/implantação) ganha prioridade sobre a categoria —
// mesma heurística do inferProjectType da rota de geração.
export function detalheContextFor(
  category: 'residencial' | 'comercial' | 'conceito',
  briefing?: BriefingArquitetonico | null,
): DetalheContext {
  const blob = (
    (briefing?.tipo_projeto ?? '') + ' ' + (briefing?.entorno ?? '')
  ).toLowerCase()
  if (/fachada|exterior|facade|terreno|rua|jardim|quintal|implanta|paisag|varanda/.test(blob)) {
    return 'exterior'
  }
  if (category === 'comercial')   return 'corporativo'
  if (category === 'residencial') return 'residencial'
  return 'default'
}

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
  detalhe:    { id: 'detalhe',    label: 'Detalhe',    mode: 'parametric',    isAvailable: true                                                  },
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
