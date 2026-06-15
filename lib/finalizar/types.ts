// lib/finalizar/types.ts — modelo de dados da ferramenta Finalizar (MVP).
//
// Tudo aqui é serializável para JSON e vira o `document` jsonb de
// finalize_projects. Norte do produto: simples na superfície, preciso por trás.
// Nenhuma operação aqui consome Nodes — é composição local.

/** Modos de mesclagem suportados no MVP (mapeados para globalCompositeOperation). */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light'

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiplicar' },
  { id: 'screen', label: 'Clarear' },
  { id: 'overlay', label: 'Sobrepor' },
  { id: 'soft-light', label: 'Luz suave' },
]

/** Pincel: revelar mostra a camada na área pintada; ocultar a esconde. */
export type BrushMode = 'reveal' | 'hide'

/** Traço de máscara em coordenadas NORMALIZADAS da imagem (0–1) — espelha o
 *  modelo resize-safe do EditV2Canvas (redimensionar nunca desloca a máscara). */
export interface MaskStroke {
  points: { x: number; y: number }[]
  /** Diâmetro em PIXELS DA IMAGEM base (independe de zoom/janela). */
  sizeImagePx: number
  mode: BrushMode
}

/** Uma camada da composição. index 0 da pilha = base (fundo). */
export interface Layer {
  id: string
  name: string
  /** URL pública da imagem (Supabase Storage, fal.media, etc.). */
  url: string
  visible: boolean
  /** 0–1. */
  opacity: number
  blendMode: BlendMode
  /** Suavização da borda da máscara, em px da imagem base (0 = recorte duro). */
  feather: number
  /** Camada base: fundo, sempre 100% visível, sem máscara. */
  isBase: boolean
  /** Preenchimento inicial da máscara antes dos traços:
   *  'full'  = camada começa toda visível (oculte as partes ruins);
   *  'empty' = camada começa oculta (revele só as partes boas). */
  maskFill: 'full' | 'empty'
  /** Máscara persistida (PNG, branco = visível) — preenchida ao salvar e
   *  recarregada ao reabrir. Em sessão, os traços vivos ficam no canvas. */
  maskUrl?: string | null
}

/** Documento da composição (vira finalize_projects.document). */
export interface Composition {
  version: 1
  /** Dimensões do canvas = dimensões naturais da camada base. */
  width: number
  height: number
  /** Ordem de pintura: índice 0 = base (fundo), último = topo. */
  layers: Layer[]
}

/** Projeto Finalizar persistido (linha de finalize_projects). */
export interface FinalizeProject {
  id: string
  name: string
  base_image_url: string | null
  source_space_id: string | null
  width: number | null
  height: number | null
  document: Composition
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

export type ExportFormat = 'png' | 'jpg'
