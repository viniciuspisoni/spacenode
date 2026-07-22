// Catálogo de ações do Spaces — cards/direções que o usuário aplica sobre a
// referência escolhida, preservando o DNA do projeto.
//
// Fluxo Referência → Ação → Gerar (2026-07): o antigo conceito de "eixo" segue
// vivo no schema (vistas.axis) e nos filtros, mas a UI apresenta AÇÕES:
//   - Nova Vista       (axis 'angulo')     — novo print OU direção de câmera
//   - Alterar Luz      (axis 'iluminacao') — cards de iluminação
//   - Ajustar Materiais(axis 'material')   — instrução livre
//   - Criar Detalhe    (axis 'detalhe')    — recortes da referência
//
// `AxisMode` é legado (painel antigo) — mantido só pra tipagem de config.

import type { Axis, BriefingArquitetonico } from './types'

export type AxisMode = 'parametric' | 'sketch_guided'

// Ícones (line-art) usados pelos cards de Detalhe e pelas direções de Nova
// Vista — um recorte/direção não tem "cor representativa" como a luz tem,
// então o card mostra um ícone neutro.
export type DetailIconKey =
  | 'layers' | 'bulb' | 'sofa' | 'frame' | 'focus' | 'grid'
  | 'counter' | 'bed' | 'door' | 'building' | 'plant' | 'vase'
  | 'rooms' | 'orbit' | 'front' | 'aerial' | 'zoom'

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

// Sugestões de nomes pros prints enviados (chips na UI)
export const ANGULO_LABEL_SUGGESTIONS = [
  'Vista frontal',
  'Vista lateral',
  'Vista posterior',
  'Aérea',
  'Eye-level',
  'Detalhe arquitetônico',
]

// ── Nova Vista (direções) ─────────────────────────────────────
//
// Direções de câmera quando a referência geométrica é a Vista Mestre ou uma
// imagem do histórico (sem novo print): o motor produz um NOVO ponto de vista
// do MESMO projeto (ARCHITECTURAL_DNA_LOCK — arquitetura/materiais/DNA
// travados, só a câmera se move). Quando a referência é um novo print, a
// direção não se aplica: o próprio print É a nova vista (autoridade
// geométrica máxima).
//
// `promptModifier` (inglês) entra como "Requested change" no USER INTENT do
// prompt de camera (lib/spaces/reference-prompt.ts). A "direção personalizada"
// não é card — é texto livre do usuário (vistas.user_instruction).
export const ANGULO_OPTIONS: AxisOption[] = [
  {
    value: 'outro_ambiente', label: 'Outro ambiente', icon: 'rooms',
    description: 'Ambiente vizinho do mesmo projeto, coerente com o DNA.',
    color: '#8A8276',
    promptModifier: 'move the camera to an ADJACENT space of this same project — a different room or area that logically belongs to the same design — keeping the same architectural language, materials and finish quality',
  },
  {
    value: 'novo_angulo', label: 'Novo ângulo', icon: 'orbit',
    description: 'Outro ponto de vista do mesmo ambiente.',
    color: '#8A8276',
    promptModifier: 'a different camera angle of the SAME space shown in the reference, seen from another believable standing position',
  },
  {
    value: 'frontal', label: 'Vista frontal', icon: 'front',
    description: 'Enquadramento frontal, verticais alinhadas.',
    color: '#8A8276',
    promptModifier: 'a straight frontal one-point-perspective view of the main subject of the reference, camera at eye level, vertical lines straight',
  },
  {
    value: 'aerea', label: 'Vista aérea', icon: 'aerial',
    description: 'Câmera elevada revelando o layout.',
    color: '#8A8276',
    promptModifier: 'an elevated view of the same space, camera raised and angled down, revealing the layout of the project',
  },
  {
    value: 'close', label: 'Close', icon: 'zoom',
    description: 'Câmera mais próxima da área principal.',
    color: '#8A8276',
    promptModifier: 'a closer camera position on the main area of interest of the reference, tighter framing, same lens character',
  },
]

// Direção personalizada (texto livre) — slug reservado, validado à parte
// porque não é card: o conteúdo vem em user_instruction.
export const ANGULO_CUSTOM_VALUE = 'personalizada'

export const HORARIO_OPTIONS: AxisOption[] = []

// ── Ajustar Materiais ─────────────────────────────────────────
//
// Sem cards: a ação é uma instrução livre ("trocar o piso para tauari claro").
// O slug único marca axis_value; a instrução real vive em user_instruction.
export const MATERIAL_VALUE = 'ajuste_material'
export const MATERIAL_OPTIONS: AxisOption[] = [
  {
    value: MATERIAL_VALUE, label: 'Ajuste de material', icon: 'layers',
    description: 'Troca pontual de material descrita por você.',
    color: '#8A8276',
    promptModifier: '', // a instrução real vem do usuário (user_instruction)
  },
]

// ── Detalhe ───────────────────────────────────────────────────
//
// Recortes aproximados do MESMO projeto (crop/zoom da referência escolhida),
// preservando materiais, estilo, paleta e linguagem. NÃO é redesenho nem nova
// câmera — é um enquadramento mais fechado da cena existente (ver
// lib/spaces/reference-prompt.ts, action='detalhe').
//
// Os cards se adaptam ao contexto do projeto (default / corporativo /
// residencial / exterior). Como o slug é validado pela rota via
// findAxisOption('detalhe', slug), DETALHE_OPTIONS é a UNIÃO de todos os cards
// possíveis — a UI mostra só o subconjunto do contexto (detalheOptionsForContext).
//
// `promptModifier` (inglês) é o ALVO do recorte — entra no USER INTENT do
// reference-prompt, depois do "closer architectural crop focused on …".

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
  decoracao: {
    value: 'decoracao', label: 'Decoração', icon: 'vase',
    description: 'Objetos, arte, vasos e composição de estilo do ambiente.',
    color: '#8A8276',
    promptModifier: 'a closer crop of the decorative styling already present in the scene: objects, art, vases and accessories',
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
  default:     ['materialidade', 'iluminacao_detalhe', 'mobiliario', 'decoracao', 'parede_destaque', 'area_principal', 'encontro_materiais'],
  corporativo: ['mesa_executiva', 'lounge', 'divisorias_vidro', 'iluminacao_detalhe', 'materialidade', 'decoracao', 'parede_destaque'],
  residencial: ['estar', 'cozinha_bancada', 'marcenaria', 'cabeceira', 'iluminacao_detalhe', 'decoracao', 'materialidade'],
  exterior:    ['acesso', 'fachada', 'paisagismo', 'varanda', 'brises_esquadrias', 'materialidade_externa'],
}

// União de todos os cards — usada pela rota pra validar qualquer slug de Detalhe.
export const DETALHE_OPTIONS: AxisOption[] = Object.values(DETAIL_CARD)

// Cards exibidos na UI conforme o contexto do projeto.
export function detalheOptionsForContext(ctx: DetalheContext): AxisOption[] {
  return DETALHE_BY_CONTEXT[ctx].map(slug => DETAIL_CARD[slug])
}

// Resolve o contexto a partir do TIPO DO PROJETO + categoria.
//
// ⚠️ Só o `tipo_projeto` decide interior×exterior — NUNCA o `entorno`. O entorno
// descreve o que se vê pela janela (vista, paisagem urbana, jardim, rua), então
// um ambiente INTERNO com vista cairia errado em "exterior" (bug real: um
// escritório com "vista panorâmica de uma paisagem urbana" virava exterior).
// Exterior só quando o PROJETO em si é externo: fachada, implantação, terreno,
// complexo/torres, área de lazer externa.
export function detalheContextFor(
  category: 'residencial' | 'comercial' | 'conceito',
  briefing?: BriefingArquitetonico | null,
): DetalheContext {
  const tipo = (briefing?.tipo_projeto ?? '').toLowerCase()
  const exteriorSubject =
    /\bfachada|facade|implanta|\bterreno|\blotes?\b|loteamento|condom[íi]nio|complexo|\btorres?\b|\bedif[íi]cios\b|\bextern[ao]s?\b|\bexterior|volumetria|paisagism|[áa]rea\s+de\s+lazer/.test(tipo)
  if (exteriorSubject)            return 'exterior'
  if (category === 'comercial')   return 'corporativo'
  if (category === 'residencial') return 'residencial'
  return 'default'
}

export const AXIS_OPTIONS: Record<Axis, AxisOption[]> = {
  iluminacao: ILUMINACAO_OPTIONS,
  angulo:     ANGULO_OPTIONS,
  horario:    HORARIO_OPTIONS,
  detalhe:    DETALHE_OPTIONS,
  material:   MATERIAL_OPTIONS,
}

// Labels das AÇÕES do fluxo novo — usados também nos filtros da galeria.
export const AXIS_LABEL: Record<Axis, string> = {
  iluminacao: 'Luz',
  angulo:     'Nova Vista',
  horario:    'Clima',
  detalhe:    'Detalhe',
  material:   'Materiais',
}

export const AXIS_CONFIG: Record<Axis, AxisConfig> = {
  iluminacao: { id: 'iluminacao', label: 'Luz',        mode: 'parametric', isAvailable: true                                               },
  angulo:     { id: 'angulo',     label: 'Nova Vista', mode: 'parametric', isAvailable: true,  labelSuggestions: ANGULO_LABEL_SUGGESTIONS },
  horario:    { id: 'horario',    label: 'Clima',      mode: 'parametric', isAvailable: false                                              },
  detalhe:    { id: 'detalhe',    label: 'Detalhe',    mode: 'parametric', isAvailable: true                                               },
  material:   { id: 'material',   label: 'Materiais',  mode: 'parametric', isAvailable: true                                               },
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
