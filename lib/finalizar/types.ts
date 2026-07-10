// lib/finalizar/types.ts — modelo de dados do Finalizar v2 (pós-produção).
//
// Tudo aqui é serializável para JSON e vira o `document` jsonb de
// finalize_projects. Norte do produto: simples na superfície, preciso por trás.
// Edição NÃO destrutiva: a imagem original nunca é alterada — o documento
// descreve ajustes que o motor aplica na hora de exibir/exportar.
// Nenhuma operação local consome Nodes; só ações de IA (Limpeza) cobram, e
// essas passam pela infra de /api/edits (custo informado antes).

/** Modos de mesclagem de camadas (mapeados para globalCompositeOperation). */
export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'lighten' | 'darken'

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiplicar' },
  { id: 'screen', label: 'Clarear' },
  { id: 'overlay', label: 'Sobrepor' },
  { id: 'soft-light', label: 'Luz suave' },
  { id: 'lighten', label: 'Mais claro' },
  { id: 'darken', label: 'Mais escuro' },
]

// ═══════════════════════════════════════════════════════════════════════════
// Ajustes tonais e de cor
// ═══════════════════════════════════════════════════════════════════════════

/** Ajustes globais. Todos -100..100 exceto sharpen/noiseReduction (0..100).
 *  0 = identidade (nenhuma alteração). */
export interface Adjustments {
  exposure: number
  contrast: number
  highlights: number
  shadows: number
  whites: number
  blacks: number
  temperature: number
  tint: number
  saturation: number
  vibrance: number
  /** Contraste local — realça materiais e texturas. */
  clarity: number
  sharpen: number
  noiseReduction: number
}

/** Subconjunto aplicável dentro de uma máscara local. 0 = identidade. */
export interface LocalAdjustValues {
  exposure: number
  contrast: number
  highlights: number
  shadows: number
  temperature: number
  tint: number
  saturation: number
  clarity: number
  /** Positivo = mais nitidez; negativo = suaviza (reduz aparência plástica). */
  sharpness: number
}

export interface Vignette {
  /** -100 (escurece) .. 100 (clareia). 0 = sem vinheta. */
  amount: number
  /** 0..100 — quão cedo a vinheta começa a partir do centro. */
  size: number
  /** 0..100 — suavidade da transição. */
  feather: number
}

/** Ponto da curva de luminosidade, em 0..1 (x = entrada, y = saída). */
export interface CurvePoint { x: number; y: number }

export const HSL_BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const
export type HslBand = (typeof HSL_BANDS)[number]

export const HSL_BAND_META: Record<HslBand, { label: string; hue: number; css: string }> = {
  red: { label: 'Vermelho', hue: 0, css: '#e05252' },
  orange: { label: 'Laranja', hue: 30, css: '#e08a3c' },
  yellow: { label: 'Amarelo', hue: 60, css: '#d9c33c' },
  green: { label: 'Verde', hue: 120, css: '#5cb85c' },
  aqua: { label: 'Ciano', hue: 180, css: '#3cb8b8' },
  blue: { label: 'Azul', hue: 225, css: '#4a7de0' },
  purple: { label: 'Roxo', hue: 275, css: '#8a5ce0' },
  magenta: { label: 'Magenta', hue: 320, css: '#d05cb8' },
}

/** Ajuste por faixa de cor: tudo -100..100, 0 = identidade. */
export interface HslAdjust { hue: number; sat: number; lum: number }
export type HslMap = Record<HslBand, HslAdjust>

/** Roda de color grading: hue 0..360, sat 0..100 (0 = neutro), lum -100..100. */
export interface GradeWheel { hue: number; sat: number; lum: number }

export interface ColorGrading {
  shadows: GradeWheel
  midtones: GradeWheel
  highlights: GradeWheel
  /** 0..100 — sobreposição entre zonas. */
  blending: number
  /** -100..100 — desloca a fronteira sombras/realces. */
  balance: number
}

/** Correspondência de cor por imagem de referência (transferência de
 *  média/desvio por canal, pré-computada no cliente). amount 0..100. */
export interface ColorMatch {
  gain: [number, number, number]
  offset: [number, number, number]
  amount: number
  /** Miniatura da referência (para exibir no painel). */
  refThumbUrl: string | null
}

// ═══════════════════════════════════════════════════════════════════════════
// Máscaras e ajustes locais
// ═══════════════════════════════════════════════════════════════════════════

/** Traço de pincel em coordenadas NORMALIZADAS da imagem (0–1) — resize-safe. */
export interface MaskStroke {
  points: { x: number; y: number }[]
  /** Diâmetro em PIXELS DA IMAGEM base (independe de zoom/janela). */
  sizeImagePx: number
  /** 0..1 — dureza da borda (1 = recorte duro). */
  hardness: number
  /** 0..1 — opacidade do traço (fluxo aplicado por traço, não acumula). */
  flow: number
  /** true = borracha (subtrai da máscara). */
  erase: boolean
}

/** Forma-base da máscara; traços de pincel refinam qualquer forma. */
export type MaskShape =
  | { kind: 'brush' }
  | { kind: 'linear'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'radial'; cx: number; cy: number; rx: number; ry: number; feather: number }
  | { kind: 'luminosity'; min: number; max: number; smooth: number }
  | { kind: 'sky'; bakedUrl: string | null }

export interface LocalAdjustment {
  id: string
  name: string
  enabled: boolean
  invert: boolean
  shape: MaskShape
  /** Refino por pincel por cima da forma (adiciona/subtrai). */
  strokes: MaskStroke[]
  values: LocalAdjustValues
}

/** Máximo de ajustes locais por documento (limite de texturas do motor). */
export const MAX_LOCAL_ADJUSTMENTS = 8

/** Máximo de camadas de elementos por documento. */
export const MAX_ELEMENTS = 24

// ═══════════════════════════════════════════════════════════════════════════
// Camadas de elementos (composição)
// ═══════════════════════════════════════════════════════════════════════════

export type ElementCategory = 'imagem' | 'ceu' | 'vegetacao' | 'pessoas' | 'veiculos' | 'logo'

export const ELEMENT_CATEGORIES: { id: ElementCategory; label: string }[] = [
  { id: 'imagem', label: 'Imagem' },
  { id: 'ceu', label: 'Céu' },
  { id: 'vegetacao', label: 'Vegetação' },
  { id: 'pessoas', label: 'Pessoas' },
  { id: 'veiculos', label: 'Veículos' },
  { id: 'logo', label: 'Logo / marca-d’água' },
]

/** Posição/tamanho do elemento em coordenadas normalizadas do canvas.
 *  (x, y) = centro; width = largura como fração da largura do canvas
 *  (altura segue a proporção natural da imagem do elemento). */
export interface ElementTransform {
  x: number
  y: number
  width: number
  /** Graus, sentido horário. */
  rotation: number
  flipH: boolean
  flipV: boolean
}

export interface ElementLayer {
  id: string
  name: string
  url: string
  category: ElementCategory
  visible: boolean
  /** 0–1. */
  opacity: number
  blendMode: BlendMode
  transform: ElementTransform
  /** Suavização da borda da máscara, em px da imagem base. */
  feather: number
  /** Estado inicial da máscara ('full' = todo visível). */
  maskFill: 'full' | 'empty'
  /** Traços de revelar/ocultar sobre o elemento (coords do CANVAS, 0–1). */
  maskStrokes: MaskStroke[]
  /** Máscara rasterizada persistida (PNG branco=visível) — legado v1/baked. */
  maskUrl: string | null
}

// ═══════════════════════════════════════════════════════════════════════════
// Geometria (perspectiva, lente, corte)
// ═══════════════════════════════════════════════════════════════════════════

export interface CropRect { x: number; y: number; w: number; h: number }

export interface Geometry {
  /** Rotação fina em graus (-45..45). */
  rotate: number
  /** Correção de perspectiva vertical (-100..100). */
  perspV: number
  /** Correção de perspectiva horizontal (-100..100). */
  perspH: number
  /** Correção de lente: distorção de barril/almofada (-100..100). */
  lens: number
  /** Corte normalizado no espaço já corrigido; null = sem corte. */
  crop: CropRect | null
  /** Proporção travada do corte ('original', '1:1', '4:5', …); null = livre. */
  aspect: string | null
}

export const ASPECT_PRESETS: { id: string; label: string; ratio: number | null; hint?: string }[] = [
  { id: 'free', label: 'Livre', ratio: null },
  { id: 'original', label: 'Original', ratio: 0 }, // 0 = usa proporção da imagem
  { id: '1:1', label: '1:1', ratio: 1, hint: 'Instagram' },
  { id: '4:5', label: '4:5', ratio: 4 / 5, hint: 'Instagram retrato' },
  { id: '16:9', label: '16:9', ratio: 16 / 9, hint: 'Apresentação' },
  { id: '3:2', label: '3:2', ratio: 3 / 2, hint: 'Impressão' },
  { id: '2:3', label: '2:3', ratio: 2 / 3, hint: 'Impressão retrato' },
  { id: 'a4', label: 'A4', ratio: 297 / 210, hint: 'Prancha' },
]

// ═══════════════════════════════════════════════════════════════════════════
// Versões e documento
// ═══════════════════════════════════════════════════════════════════════════

/** Versão exportada e salva no projeto (armazenada no próprio document —
 *  nenhuma migração necessária; finalize_exports guarda a linha de histórico). */
export interface ProjectVersion {
  url: string
  name: string
  format: ExportFormat
  width: number
  height: number
  createdAt: string
  /** Resumo curto dos ajustes aplicados (para o histórico). */
  summary: string
}

export interface FinalizeDoc {
  version: 2
  /** Dimensões naturais da imagem base. */
  width: number
  height: number
  /** Imagem de trabalho atual (avança após ações de IA da Limpeza). */
  baseUrl: string
  /** Imagem original de quando o projeto foi criado — NUNCA muda. */
  originalBaseUrl: string
  geometry: Geometry
  adjust: Adjustments
  vignette: Vignette
  /** Curva de luminosidade — pontos ordenados por x; [0,0]..[1,1] = identidade. */
  curve: CurvePoint[]
  hsl: HslMap
  grading: ColorGrading
  colorMatch: ColorMatch | null
  locals: LocalAdjustment[]
  elements: ElementLayer[]
  versions: ProjectVersion[]
}

/** Projeto Finalizar persistido (linha de finalize_projects). */
export interface FinalizeProject {
  id: string
  name: string
  base_image_url: string | null
  source_space_id: string | null
  width: number | null
  height: number | null
  document: unknown
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}

/** Resumo para a galeria de composições salvas. */
export interface FinalizeProjectSummary {
  id: string
  name: string
  thumbnail_url: string | null
  updated_at: string
}

export type ExportFormat = 'png' | 'jpg' | 'webp'

// ═══════════════════════════════════════════════════════════════════════════
// Documento v1 (legado) — para migração
// ═══════════════════════════════════════════════════════════════════════════

export interface LegacyLayerV1 {
  id: string
  name: string
  url: string
  visible: boolean
  opacity: number
  blendMode: string
  feather: number
  isBase: boolean
  maskFill: 'full' | 'empty'
  maskUrl?: string | null
}

export interface LegacyCompositionV1 {
  version: 1
  width: number
  height: number
  layers: LegacyLayerV1[]
}
