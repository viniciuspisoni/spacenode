'use client'

// CanvasViewport — superfície de trabalho do Finalizar.
//
// Dois canvases: um WebGL oculto (motor, resolução de trabalho) e um canvas 2D
// de tela que desenha o resultado com pan/zoom + overlays de UI (máscara ativa,
// corte, gizmo de elementos, anel do pincel, grade de geometria).
//
// Interações por ferramenta:
//   adjust/color — pan/zoom; conta-gotas de dominante quando ativo
//   masks        — pincel (traços) ou redefinição de gradiente (arrasto)
//   edit         — seleção da edição por IA: varinha + pincel (overlay de aviso)
//   geometry     — corte interativo com alças + grade de terços
//   elements     — selecionar/mover/escalar/rotacionar; pincel de máscara
//
// Traços em coordenadas NORMALIZADAS da imagem (0–1) — resize-safe, herdado
// do modelo v1. Espaço = pan temporário; scroll = zoom no cursor.

import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from 'react'
import type {
  CropRect, ElementTransform, FinalizeDoc, LocalAdjustment, MaskShape, MaskStroke, WandShape,
} from '@/lib/finalizar/types'
import { isGeometryIdentity } from '@/lib/finalizar/composition'
import {
  buildColorIndex, growSelectionAuto, invertSelection, magicWandAuto, magicWandSelect,
  type ColorIndex,
} from '@/lib/selection/magic-wand'
import { FinalizeRenderer } from '@/lib/finalizar/engine/renderer'
import { computeHistogram, type Histogram } from '@/lib/finalizar/engine/color-math'
import {
  contractSelection, expandSelection, fillSelectionHoles,
  removeSmallIslands, rleDecode, rleEncode, smoothSelection,
} from '@/lib/selection/mask-raster'
import { computeSkyMask, MASK_SCALE, selectionMaskPngCanvas, type LiveStroke } from '@/lib/finalizar/engine/masks'

const MIN_ZOOM = 1
const MAX_ZOOM = 8
const WORK_LONG_SIDE = 2304
/** Distância, em px de tela, para o clique fechar o polígono no ponto inicial. */
const POLY_CLOSE_PX = 14

/** Teto de passos de undo da seleção. Em RLE cada um custa alguns KB. */
const SELECTION_HISTORY_LIMIT = 24

/** Raio (px da imagem) da média que lê a cor do ponto clicado. Um pixel só
 *  deixa um respingo de ruído definir a seleção inteira. */
const WAND_SAMPLE_RADIUS_IMAGE_PX = 4

/** Resolução do índice de cor da varinha.
 *
 *  Tem que ser a MESMA ordem de grandeza em que a tolerância foi calibrada
 *  (scripts/editar-wand-calibrate.mts, imagens de ~1 MP). Medido na prática:
 *  construir o índice em meia resolução faz a varinha vazar pela cena inteira
 *  no mesmo número de tolerância — reduzir a imagem mistura pixels vizinhos e
 *  fabrica exatamente as cores intermediárias que servem de ponte para o
 *  preenchimento atravessar a borda entre dois materiais. */
const WAND_INDEX_LONG_SIDE = WORK_LONG_SIDE

export type ViewportTool = 'edit' | 'adjust' | 'color' | 'masks' | 'geometry' | 'elements'

/** Operações locais sobre a seleção — todas grátis, todas instantâneas. */
export type SelectionOp =
  | 'expand' | 'contract' | 'smooth' | 'fillHoles' | 'cleanIslands' | 'invert' | 'selectAll'

export interface BrushSettings {
  /** Diâmetro em px de TELA. */
  size: number
  hardness: number
  flow: number
  erase: boolean
}

export type StrokeTarget = { kind: 'local'; id: string } | { kind: 'element'; id: string } | { kind: 'edit' }

/** Comparação persistente além do "segurar": divisor arrastável ou lado a lado. */
export type CompareMode = 'none' | 'split' | 'side'

export type MaskOverlayColor = 'green' | 'red' | 'white'

/** Ferramentas de seleção da aba Editar. Varinha e pincel escrevem no mesmo
 *  lugar que laço, polígono e retângulo — o que a pessoa vê marcado é o que
 *  vai para a IA, venha de onde vier. */
export type EditSubTool = 'wand' | 'brush' | 'eraser' | 'lasso' | 'polygon' | 'rect'

export interface CanvasViewportHandle {
  fit(): void
  zoomBy(factor: number): void
  thumbnail(maxDim: number): Promise<Blob | null>
  resultHistogram(): Histogram | null
  /** Máscara de céu heurística (branco=céu) na resolução de máscara, ou null. */
  makeSkyMask(): HTMLCanvasElement | null
  /** Raster da varinha da seleção de edição, em ESPAÇO DE ORIGEM e na resolução
   *  de máscara. null quando não há varinha ativa. */
  wandMask(): HTMLCanvasElement | null
  /** A varinha pode ser usada agora? Falsa com geometria aplicada. */
  wandAvailable(): boolean
  /** Apaga as regiões desenhadas (laço/polígono/retângulo). */
  clearEditRegions(): void
  /** Cresce a seleção de edição até o material inteiro.
   *
   *  `maxCoverage` é uma condição, não um limite: se o resultado passar dela, o
   *  crescimento é DESCARTADO e a seleção fica como estava (`applied: false`).
   *  Existe para o caminho automático — melhor não crescer do que consertar
   *  meia cena sem ninguém ter pedido.
   *
   *  Devolve null quando não há o que crescer (sem seleção, ou varinha
   *  indisponível). */
  growEditSelection(opts?: { maxCoverage?: number }): { coverage: number; before: number; applied: boolean } | null
  /** Desfaz/refaz o ÚLTIMO gesto de seleção. Devolve false quando não há o
   *  que desfazer — é o sinal para o Ctrl+Z cair no histórico do documento. */
  undoSelection(): boolean
  redoSelection(): boolean
  /** Ajusta a seleção no lugar (morfologia). Devolve a cobertura resultante, ou
   *  null quando não há seleção. `px` só vale para expandir/contrair/suavizar. */
  refineSelection(op: SelectionOp, px?: number): { coverage: number; before: number; applied: boolean } | null
  /** Substitui a seleção inteira por uma máscara pronta (o retorno do
   *  "Colar na borda", que vem do servidor já casada com a imagem). */
  loadSelectionMask(url: string): Promise<boolean>
  /** A seleção de hoje como PNG branco-sobre-preto, no tamanho do documento. */
  selectionBlob(): Promise<Blob | null>
  baseImage(): HTMLImageElement | null
  webglSupported(): boolean
}

interface Props {
  doc: FinalizeDoc
  tool: ViewportTool
  activeLocalId: string | null
  activeElementId: string | null
  brush: BrushSettings
  /** masks: 'brush' pinta traços; 'shape' arrasta a forma (linear/radial). */
  maskInteraction: 'brush' | 'shape'
  /** elements: true = pincel de máscara do elemento; false = transformar. */
  elementMaskMode: boolean
  compare: boolean
  compareMode: CompareMode
  showMaskOverlay: boolean
  maskOverlayColor: MaskOverlayColor
  /** Traços de pincel/borracha da seleção de edição (espaço de EXIBIÇÃO). */
  editStrokes: MaskStroke[]
  /** Varinha da seleção de edição; compõe com os traços por baixo deles. */
  editWand: WandShape | null
  /** Qual ferramenta de seleção está ativa na aba Editar. */
  editSubTool: EditSubTool
  /** Tolerância pedida (TETO — o clique pode entregar menos; ver magicWandAuto). */
  wandTolerance: number
  wandContiguous: boolean
  /** Recebe a forma JÁ resolvida, com a tolerância que de fato valeu. */
  onWandPick: (shape: WandShape) => void
  /** Avisa que laço/polígono/retângulo mudaram a seleção desenhada. */
  onRegionsChange: (hasRegions: boolean) => void
  /** A varinha virou raster (Shift/Alt somam e subtraem, e formas não somam):
   *  o pai solta a forma, que agora vive dentro das regiões. NÃO mexe nos
   *  traços — pincel e borracha continuam valendo por cima. */
  onWandAbsorbed: () => void
  /** Quantos passos de seleção dá para desfazer/refazer agora — o topo usa
   *  para acender a seta, e o Ctrl+Z para saber a quem obedecer. */
  onSelectionHistory: (canUndo: boolean, canRedo: boolean) => void
  /** A seleção foi crescida e virou uma região única: traços e varinha já
   *  estão dentro dela e devem ser zerados no pai, sob pena de contarem duas
   *  vezes (e de o Desmarcar deixar sobras). */
  onSelectionGrown: () => void
  wbPicking: boolean
  onZoomChange: (pct: number) => void
  onStrokeCommit: (target: StrokeTarget, stroke: MaskStroke) => void
  onShapeChange: (localId: string, shape: MaskShape) => void
  onElementChange: (id: string, t: ElementTransform, commit: boolean) => void
  onCropChange: (crop: CropRect) => void
  onPickWb: (rgb: [number, number, number]) => void
  onSelectElement: (id: string | null) => void
  onError: (msg: string) => void
  /** Disparado quando a imagem base termina de carregar (histograma etc.).
   *  `canSample` diz se os pixels puderam ser lidos — falso em imagem sem CORS,
   *  e é o que decide se a varinha existe para esta imagem. */
  onBaseReady?: (canSample: boolean) => void
}

type DragState =
  | { kind: 'split'; pointerId: number }
  | { kind: 'pan'; pointerId: number; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'stroke'; pointerId: number; target: StrokeTarget; stroke: LiveStroke }
  | { kind: 'edit-lasso'; pointerId: number; points: { x: number; y: number }[]; erase: boolean }
  | { kind: 'edit-rect'; pointerId: number; from: { x: number; y: number }; to: { x: number; y: number }; erase: boolean }
  | { kind: 'shape'; pointerId: number; localId: string; shapeKind: 'linear' | 'radial'; start: { x: number; y: number } }
  | { kind: 'crop'; pointerId: number; mode: string; start: { x: number; y: number }; crop0: CropRect; ratio: number | null }
  | { kind: 'element-move'; pointerId: number; id: string; start: { x: number; y: number }; t0: ElementTransform }
  | { kind: 'element-scale'; pointerId: number; id: string; t0: ElementTransform; center: { x: number; y: number }; startDist: number }
  | { kind: 'element-rotate'; pointerId: number; id: string; t0: ElementTransform; center: { x: number; y: number }; startAngle: number }

/** Raio de amostragem no espaço do ÍNDICE, que pode estar reduzido. */
function wandSampleRadius(index: ColorIndex, docWidth: number): number {
  const k = index.width / Math.max(1, docWidth)
  return Math.max(1, Math.round(WAND_SAMPLE_RADIUS_IMAGE_PX * k))
}

/**
 * Roda a varinha sobre o índice da imagem-base e devolve o raster
 * (branco = selecionado), na resolução pedida.
 *
 * Vive no escopo do módulo, e não dentro do componente, porque só depende dos
 * argumentos: assim não entra em lista de dependências de hook nenhuma.
 *
 * Trabalha em ESPAÇO DE ORIGEM, porque é a imagem original que a IA edita. Não
 * há auto-ajuste aqui — a forma já chega com a tolerância resolvida no clique
 * (ou a que o usuário escolheu no controle); reajustar de novo faria o resultado
 * mudar sozinho a cada re-rasterização.
 */
function maskToCanvas(index: ColorIndex, mask: Uint8Array): HTMLCanvasElement | null {
  const src = document.createElement('canvas')
  src.width = index.width
  src.height = index.height
  const sctx = src.getContext('2d')
  if (!sctx) return null
  const img = sctx.createImageData(index.width, index.height)
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4
    const v = mask[i] > 127 ? 255 : 0
    img.data[o] = v
    img.data[o + 1] = v
    img.data[o + 2] = v
    img.data[o + 3] = v
  }
  sctx.putImageData(img, 0, 0)
  return src
}

function rasterizeWand(
  index: ColorIndex,
  shape: WandShape,
  w: number,
  h: number,
  docWidth: number,
): HTMLCanvasElement | null {
  const mask = magicWandSelect(
    index,
    shape.seed.x * index.width,
    shape.seed.y * index.height,
    {
      tolerance: shape.tolerance,
      contiguous: shape.contiguous,
      sampleRadius: wandSampleRadius(index, docWidth),
    },
  )
  const src = maskToCanvas(index, mask)
  if (!src) return null
  if (src.width === w && src.height === h) return src
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')?.drawImage(src, 0, 0, w, h)
  return out
}

export const CanvasViewport = forwardRef<CanvasViewportHandle, Props>(function CanvasViewport(props, ref) {
  const {
    doc, tool, activeLocalId, activeElementId, brush, maskInteraction, elementMaskMode,
    compare, compareMode, showMaskOverlay, maskOverlayColor, editStrokes, editWand, editSubTool, wbPicking,
    onZoomChange, onStrokeCommit, onShapeChange, onElementChange, onCropChange,
    onPickWb, onSelectElement, onError,
  } = props

  const colorIndexRef = useRef<ColorIndex | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const screenRef = useRef<HTMLCanvasElement | null>(null)
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<FinalizeRenderer | null>(null)
  const baseImgRef = useRef<HTMLImageElement | null>(null)
  /** A imagem de quando o projeto começou. É o "Antes" da comparação — ver o
   *  efeito que a carrega. */
  const originalImgRef = useRef<HTMLImageElement | null>(null)
  /** Regiões desenhadas da seleção de edição (laço, polígono, retângulo),
   *  acumuladas em branco na resolução do documento. Vivem aqui e não no
   *  documento porque a seleção é transitória: some quando a edição roda. */
  const editRegionsRef = useRef<HTMLCanvasElement | null>(null)
  /**
   * Undo da SELEÇÃO, em RLE.
   *
   * Existia no V4 e morreu na fusão junto com o raster — e some justamente na
   * hora em que faz falta: um clique de varinha que abraça meia cena não tinha
   * volta, só "Desmarcar e começar de novo". As funções de RLE nunca saíram do
   * repositório (`lib/selection/mask-raster`), ficaram órfãs com teste
   * passando, como o resto do que a fusão desligou.
   *
   * RLE porque uma máscara de 2 MP crua custa 2 MB por passo; comprimida, uma
   * seleção típica cabe em alguns KB — 24 passos ficam na casa das centenas de
   * KB, não das dezenas de MB.
   */
  const selUndoRef = useRef<Int32Array[]>([])
  const selRedoRef = useRef<Int32Array[]>([])
  /** As regiões contêm APENAS varinha somada? Se sim, um clique simples de
   *  varinha pode zerá-las (é o "substituir seleção" de qualquer editor). Se
   *  um laço ou polígono entrou ali, não: seria apagar trabalho à mão. */
  const wandOnlyRegionsRef = useRef(true)
  const editPolyRef = useRef<{ points: { x: number; y: number }[]; erase: boolean } | null>(null)
  /** Quantos vértices o polígono em curso tem. É estado, e não só o ref, porque
   *  o botão "Fechar área" precisa aparecer — o ref sozinho não re-renderiza. */
  const [polyCount, setPolyCount] = useState(0)
  const [baseReady, setBaseReady] = useState(false)
  const [glOk, setGlOk] = useState(true)

  const docRef = useRef(doc)
  const propsRef = useRef(props)
  docRef.current = doc
  propsRef.current = props

  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  /** Posição do divisor de comparação (fração 0..1 da largura da tela). */
  const splitRef = useRef(0.5)
  const dragRef = useRef<DragState | null>(null)
  const cursorRef = useRef<{ x: number; y: number } | null>(null)
  const spaceRef = useRef(false)
  const rafRef = useRef(0)
  const needsGlRef = useRef(true)

  // ── Renderer + imagem base ───────────────────────────────────────────────

  useEffect(() => {
    const glCanvas = document.createElement('canvas')
    glCanvas.width = 4
    glCanvas.height = 4
    glCanvasRef.current = glCanvas
    const renderer = new FinalizeRenderer(glCanvas, () => {
      needsGlRef.current = true
      scheduleDraw()
    })
    rendererRef.current = renderer
    // A lib de máscaras não sabe ler pixels de imagem; quem sabe é o viewport,
    // que é dono da base e do índice de cor. Ela só pede o raster pronto.
    renderer.masks.wandSampler = (shape, w, h) => {
      const index = colorIndexRef.current
      return index ? rasterizeWand(index, shape, w, h, docRef.current.width) : null
    }
    if (!renderer.isSupported()) setGlOk(false)
    return () => {
      renderer.dispose()
      rendererRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    setBaseReady(false)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      baseImgRef.current = img
      const renderer = rendererRef.current
      const glCanvas = glCanvasRef.current
      if (renderer && glCanvas) {
        const k = Math.min(1, WORK_LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
        glCanvas.width = Math.max(2, Math.round(img.naturalWidth * k))
        glCanvas.height = Math.max(2, Math.round(img.naturalHeight * k))
        renderer.setBaseImage(img, img.naturalWidth, img.naturalHeight)
      }
      needsGlRef.current = true

      // Índice de cor da base, para a varinha. Construído UMA vez por imagem.
      // Uma ação de IA troca a base e dispara este efeito de novo; o
      // `baseEpoch` invalida a máscara em cache.
      colorIndexRef.current = null
      try {
        const kw = Math.min(1, WAND_INDEX_LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
        const iw = Math.max(2, Math.round(img.naturalWidth * kw))
        const ih = Math.max(2, Math.round(img.naturalHeight * kw))
        const c = document.createElement('canvas')
        c.width = iw
        c.height = ih
        const cx = c.getContext('2d', { willReadFrequently: true })
        if (cx) {
          cx.drawImage(img, 0, 0, iw, ih)
          colorIndexRef.current = buildColorIndex(cx.getImageData(0, 0, iw, ih).data, iw, ih)
        }
      } catch {
        // Imagem sem CORS: tudo segue funcionando, menos a varinha.
        colorIndexRef.current = null
      }
      const r = rendererRef.current
      if (r) r.masks.baseEpoch += 1

      setBaseReady(true)
      scheduleDraw()
      propsRef.current.onBaseReady?.(colorIndexRef.current !== null)
    }
    img.onerror = () => {
      if (!cancelled) onError('Não foi possível carregar a imagem base.')
    }
    img.src = doc.baseUrl
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.baseUrl])

  // ── Geometria de exibição ────────────────────────────────────────────────

  /** Retângulo visível em coords normalizadas (corte aplicado fora do modo geometria). */
  const visibleRect = useCallback((): CropRect => {
    const d = docRef.current
    const p = propsRef.current
    if (p.tool === 'geometry' || p.compare || !d.geometry.crop) return { x: 0, y: 0, w: 1, h: 1 }
    return d.geometry.crop
  }, [])

  interface ViewTransform { s: number; ox: number; oy: number; vis: CropRect }

  const getView = useCallback((): ViewTransform | null => {
    const screen = screenRef.current
    const d = docRef.current
    if (!screen || !d.width || !d.height) return null
    const vis = visibleRect()
    const visW = vis.w * d.width
    const visH = vis.h * d.height
    const margin = 24 * devicePixelRatio
    const fit = Math.min((screen.width - margin) / visW, (screen.height - margin) / visH)
    const s = Math.max(0.001, fit * zoomRef.current)
    const ox = (screen.width - visW * s) / 2 + panRef.current.x
    const oy = (screen.height - visH * s) / 2 + panRef.current.y
    return { s, ox, oy, vis }
  }, [visibleRect])

  /** client → coords normalizadas da imagem COMPLETA. */
  const toImage = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const screen = screenRef.current
    const v = getView()
    if (!screen || !v) return null
    const rect = screen.getBoundingClientRect()
    const px = (clientX - rect.left) * (screen.width / rect.width)
    const py = (clientY - rect.top) * (screen.height / rect.height)
    const d = docRef.current
    return {
      x: v.vis.x + (px - v.ox) / v.s / d.width,
      y: v.vis.y + (py - v.oy) / v.s / d.height,
    }
  }, [getView])

  /** coords normalizadas → px do canvas de tela. */
  const toScreen = useCallback((nx: number, ny: number): { x: number; y: number } | null => {
    const v = getView()
    if (!v) return null
    const d = docRef.current
    return {
      x: v.ox + (nx - v.vis.x) * d.width * v.s,
      y: v.oy + (ny - v.vis.y) * d.height * v.s,
    }
  }, [getView])

  // ── Desenho ──────────────────────────────────────────────────────────────

  const drawScreen = useCallback(() => {
    const screen = screenRef.current
    const glCanvas = glCanvasRef.current
    const renderer = rendererRef.current
    const ctx = screen?.getContext('2d')
    const v = getView()
    if (!screen || !ctx || !glCanvas || !renderer || !v) return
    const d = docRef.current
    const p = propsRef.current

    // motor (só quando algo mudou)
    if (needsGlRef.current && baseImgRef.current) {
      const drag = dragRef.current
      const live = drag?.kind === 'stroke'
        ? {
            local: drag.target.kind === 'local' ? { id: drag.target.id, stroke: drag.stroke } : null,
            element: drag.target.kind === 'element' ? { id: drag.target.id, stroke: drag.stroke } : null,
          }
        : undefined
      renderer.render(d, live)
      needsGlRef.current = false
    }

    ctx.clearRect(0, 0, screen.width, screen.height)
    ctx.imageSmoothingQuality = 'high'

    const dw = v.vis.w * d.width * v.s
    const dh = v.vis.h * d.height * v.s

    // O "Antes" da comparação é a imagem ORIGINAL do projeto, não a base atual.
    //
    // A distinção só passou a existir quando a edição por IA entrou na mesma
    // ferramenta: ela AVANÇA `baseUrl`, então comparar contra a base virou
    // comparar a imagem nova com ela mesma — os dois lados idênticos. Enquanto
    // ninguém rodou IA as duas URLs são a mesma e nada muda; depois de rodar,
    // "antes" volta a significar o que a palavra diz.
    const img = originalImgRef.current ?? baseImgRef.current
    const drawView = (src: CanvasImageSource, srcW: number, srcH: number, clip?: { x: number; w: number }) => {
      ctx.save()
      if (clip) {
        ctx.beginPath()
        ctx.rect(clip.x, 0, clip.w, screen.height)
        ctx.clip()
      }
      ctx.drawImage(
        src,
        v.vis.x * srcW, v.vis.y * srcH, v.vis.w * srcW, v.vis.h * srcH,
        v.ox, v.oy, dw, dh,
      )
      ctx.restore()
    }
    const compareLabel = (text: string, x: number, align: 'left' | 'right') => {
      ctx.font = `${11 * devicePixelRatio}px ${getComputedStyle(document.body).fontFamily}`
      const padX = 8 * devicePixelRatio
      const tw = ctx.measureText(text).width
      const bx = align === 'left' ? x : x - tw - padX * 2
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.beginPath()
      ctx.roundRect(bx, 10 * devicePixelRatio, tw + padX * 2, 20 * devicePixelRatio, 6 * devicePixelRatio)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(text, bx + padX, 24 * devicePixelRatio)
    }

    if (p.compare && img) {
      // segurar: mostra o "antes" em tela cheia
      drawView(img, img.naturalWidth, img.naturalHeight)
    } else if (p.compareMode === 'split' && img) {
      drawView(glCanvas, glCanvas.width, glCanvas.height)
      const sx = splitRef.current * screen.width
      drawView(img, img.naturalWidth, img.naturalHeight, { x: 0, w: sx })
      // divisor + alça
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5 * devicePixelRatio
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, screen.height); ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath(); ctx.arc(sx, screen.height / 2, 8 * devicePixelRatio, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      compareLabel('Antes', 10 * devicePixelRatio, 'left')
      compareLabel('Depois', screen.width - 10 * devicePixelRatio, 'right')
    } else if (p.compareMode === 'side' && img) {
      // duas metades com fit próprio; zoom/pan compartilhados
      const gap = 6 * devicePixelRatio
      const halfW = (screen.width - gap) / 2
      const visW = v.vis.w * d.width
      const visH = v.vis.h * d.height
      const margin = 24 * devicePixelRatio
      const fit = Math.min((halfW - margin) / visW, (screen.height - margin) / visH)
      const s = Math.max(0.001, fit * zoomRef.current)
      const dw2 = visW * s
      const dh2 = visH * s
      const oy2 = (screen.height - dh2) / 2 + panRef.current.y
      const drawHalf = (src: CanvasImageSource, srcW: number, srcH: number, x0: number, label: string) => {
        const ox2 = x0 + (halfW - dw2) / 2 + panRef.current.x
        ctx.save()
        ctx.beginPath(); ctx.rect(x0, 0, halfW, screen.height); ctx.clip()
        ctx.drawImage(src, v.vis.x * srcW, v.vis.y * srcH, v.vis.w * srcW, v.vis.h * srcH, ox2, oy2, dw2, dh2)
        ctx.restore()
        compareLabel(label, x0 + 10 * devicePixelRatio, 'left')
      }
      drawHalf(img, img.naturalWidth, img.naturalHeight, 0, 'Antes')
      drawHalf(glCanvas, glCanvas.width, glCanvas.height, halfW + gap, 'Depois')
    } else {
      drawView(glCanvas, glCanvas.width, glCanvas.height)
    }

    // ── gesto de seleção em andamento (laço, retângulo, polígono) ──
    //
    // Vetorial, direto na tela, sem tocar no raster: o traço só vira região
    // quando o gesto termina. É o que o V4 fazia, com a diferença de que lá o
    // contexto estava transformado em coordenadas de imagem e aqui pintamos em
    // px de tela — daí o toScreen em cada ponto.
    if (p.tool === 'edit' && p.compareMode === 'none' && !p.compare) {
      const drag = dragRef.current
      const poly = editPolyRef.current
      const line = (pts: { x: number; y: number }[], close: boolean) => {
        ctx.beginPath()
        let started = false
        for (const pt of pts) {
          const q = toScreen(pt.x, pt.y)
          if (!q) continue
          if (!started) { ctx.moveTo(q.x, q.y); started = true } else ctx.lineTo(q.x, q.y)
        }
        if (close) ctx.closePath()
        ctx.stroke()
      }
      ctx.save()
      ctx.lineCap = 'butt'
      ctx.lineJoin = 'miter'

      // Marquee de duas passadas, a convenção de qualquer editor: um tracejado
      // ESCURO por baixo e um CLARO por cima, com a fase trocada. Um traço de
      // 1 px lê sobre a madeira clara e sobre o vidro escuro da mesma cena, e
      // não pinta o render de verde — o verde de 1,5 px competia com a imagem
      // justamente onde a pessoa precisa enxergar a borda que está marcando.
      const DASH = 4 * devicePixelRatio
      const marquee = (traco: () => void, erase: boolean) => {
        ctx.lineWidth = devicePixelRatio
        ctx.setLineDash([DASH, DASH])
        ctx.lineDashOffset = 0
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        traco()
        ctx.lineDashOffset = DASH
        ctx.strokeStyle = erase ? 'rgba(255,146,146,0.95)' : 'rgba(255,255,255,0.95)'
        traco()
      }

      if (drag?.kind === 'edit-lasso' && drag.points.length > 1) {
        marquee(() => line(drag.points, true), drag.erase)
      } else if (drag?.kind === 'edit-rect') {
        const a = toScreen(Math.min(drag.from.x, drag.to.x), Math.min(drag.from.y, drag.to.y))
        const b = toScreen(Math.max(drag.from.x, drag.to.x), Math.max(drag.from.y, drag.to.y))
        if (a && b) marquee(() => ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y), drag.erase)
      } else if (poly && poly.points.length > 0 && p.editSubTool === 'polygon') {
        const cur = cursorRef.current
        const pts = [...poly.points]
        marquee(() => {
          line(pts, false)
          // Segmento elástico até o cursor, para a pessoa ver onde o próximo
          // vértice cai antes de clicar.
          if (cur && pts.length > 0) {
            const last = toScreen(pts[pts.length - 1].x, pts[pts.length - 1].y)
            if (last) {
              ctx.beginPath()
              ctx.moveTo(last.x, last.y)
              ctx.lineTo(cur.x, cur.y)
              ctx.stroke()
            }
          }
        }, poly.erase)

        // Ponto inicial: é o alvo do clique que fecha a área. Branco com anel
        // escuro, pelo mesmo motivo do tracejado — precisa aparecer sobre
        // qualquer fundo sem virar o elemento mais forte da tela.
        const first = toScreen(pts[0].x, pts[0].y)
        if (first) {
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.arc(first.x, first.y, 3.5 * devicePixelRatio, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.95)'
          ctx.fill()
          ctx.lineWidth = devicePixelRatio
          ctx.strokeStyle = 'rgba(0,0,0,0.55)'
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    // ── overlays (fora dos modos de comparação) ──
    if (!p.compare && p.compareMode === 'none') {
      if (p.tool === 'masks' && p.showMaskOverlay && p.activeLocalId) {
        const local = d.locals.find((l) => l.id === p.activeLocalId)
        if (local) drawMaskOverlay(ctx, v, local)
      }
      // A varinha entra na condição: uma seleção pode existir SEM nenhum traço
      // (um clique e pronto), e sem isto o overlay ficava invisível justo no
      // caminho mais curto da ferramenta.
      if (
        p.tool === 'edit' &&
        (p.editWand !== null || p.editStrokes.length > 0 || editRegionsRef.current !== null ||
          editPolyRef.current !== null || dragRef.current !== null)
      ) {
        drawEditOverlay(ctx, v)
      }
      if (p.tool === 'geometry') drawCropUI(ctx)
      if (p.tool === 'elements' && !p.elementMaskMode) drawElementGizmo(ctx)
      drawBrushCursor(ctx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getView])

  const scheduleDraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(drawScreen)
  }, [drawScreen])

  // re-render do motor quando o documento muda
  useEffect(() => {
    needsGlRef.current = true
    scheduleDraw()
  }, [doc, scheduleDraw])

  // Imagem original do projeto, só para a comparação. Não entra no renderer
  // nem no índice da varinha — é textura de leitura, carregada uma vez e
  // apenas quando difere da base (projeto sem nenhuma ação de IA não paga nada).
  useEffect(() => {
    const original = doc.originalBaseUrl
    if (!original || original === doc.baseUrl) {
      originalImgRef.current = null
      return
    }
    let cancelled = false
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => {
      if (cancelled) return
      originalImgRef.current = im
      scheduleDraw()
    }
    im.onerror = () => {
      if (!cancelled) originalImgRef.current = null
    }
    im.src = original
    return () => { cancelled = true }
  }, [doc.originalBaseUrl, doc.baseUrl, scheduleDraw])


  // overlays dependem de props de UI
  useEffect(() => {
    scheduleDraw()
  }, [tool, activeLocalId, activeElementId, compare, compareMode, showMaskOverlay, maskOverlayColor, editStrokes, editWand, editSubTool, elementMaskMode, wbPicking, brush, scheduleDraw])

  // resize
  useEffect(() => {
    const el = containerRef.current
    const screen = screenRef.current
    if (!el || !screen) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      screen.width = Math.max(2, Math.round(r.width * devicePixelRatio))
      screen.height = Math.max(2, Math.round(r.height * devicePixelRatio))
      scheduleDraw()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [scheduleDraw, baseReady])

  // ── Overlays (funções internas usam refs) ────────────────────────────────

  const maskTintCache = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)

  function analyticShapeCanvas(local: LocalAdjustment, w: number, h: number): HTMLCanvasElement | null {
    const s = local.shape
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return null
    if (s.kind === 'linear') {
      const g = ctx.createLinearGradient(s.x0 * w, s.y0 * h, s.x1 * w, s.y1 * h)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      // lado "antes" de p0 fica 1.0 (o gradiente 2D já se comporta assim)
      return c
    }
    if (s.kind === 'radial') {
      ctx.save()
      ctx.translate(s.cx * w, s.cy * h)
      ctx.scale(Math.max(0.01, s.rx * w), Math.max(0.01, s.ry * h))
      const inner = 1 - Math.min(0.95, Math.max(0.05, s.feather))
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(inner, 'rgba(255,255,255,1)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      return c
    }
    if (s.kind === 'luminosity') {
      const img = baseImgRef.current
      if (!img) return null
      ctx.drawImage(img, 0, 0, w, h)
      try {
        const id = ctx.getImageData(0, 0, w, h)
        const dt = id.data
        const sm = Math.max(0.01, s.smooth)
        for (let i = 0; i < dt.length; i += 4) {
          const L = (0.2126 * dt[i] + 0.7152 * dt[i + 1] + 0.0722 * dt[i + 2]) / 255
          const lo = smoothstep(s.min - sm, s.min + sm, L)
          const hi = s.max >= 0.999 ? 1 : 1 - smoothstep(s.max - sm, s.max + sm, L)
          const m = Math.round(lo * hi * 255)
          dt[i] = 255; dt[i + 1] = 255; dt[i + 2] = 255; dt[i + 3] = m
        }
        ctx.putImageData(id, 0, 0)
      } catch {
        return null
      }
      return c
    }
    return null
  }

  function drawMaskOverlay(ctx: CanvasRenderingContext2D, v: ViewTransform, local: LocalAdjustment) {
    const renderer = rendererRef.current
    const d = docRef.current
    if (!renderer) return
    const mw = Math.max(2, Math.round(d.width * MASK_SCALE))
    const mh = Math.max(2, Math.round(d.height * MASK_SCALE))
    const overlayColor = propsRef.current.maskOverlayColor
    const key = `${local.id}|${JSON.stringify(local.shape)}|${local.strokes.length}|${local.invert}|${local.feather}|${mw}|${overlayColor}`
    let tint = maskTintCache.current?.key === key ? maskTintCache.current.canvas : null
    if (!tint) {
      const analytic = local.shape.kind === 'linear' || local.shape.kind === 'radial' || local.shape.kind === 'luminosity'
        ? analyticShapeCanvas(local, mw, mh)
        : null
      const solved = renderer.masks.solvedLocalMaskPng(local, d.width, d.height, analytic)
      // branco=selecionado → cor de visualização translúcida
      tint = document.createElement('canvas')
      tint.width = solved.width
      tint.height = solved.height
      const tctx = tint.getContext('2d')!
      tctx.drawImage(solved, 0, 0)
      tctx.globalCompositeOperation = 'multiply'
      tctx.fillStyle = overlayColor === 'red' ? '#e0584a' : overlayColor === 'white' ? '#ffffff' : accentGreen()
      tctx.fillRect(0, 0, tint.width, tint.height)
      // preto (não selecionado) vira transparente
      const id = tctx.getImageData(0, 0, tint.width, tint.height)
      const dt = id.data
      for (let i = 0; i < dt.length; i += 4) {
        const lum = 0.2126 * dt[i] + 0.7152 * dt[i + 1] + 0.0722 * dt[i + 2]
        dt[i + 3] = Math.min(255, lum * 2.2)
      }
      tctx.putImageData(id, 0, 0)
      maskTintCache.current = { key, canvas: tint }
    }
    const dImg = docRef.current
    ctx.globalAlpha = 0.4
    ctx.drawImage(
      tint,
      v.vis.x * tint.width, v.vis.y * tint.height, v.vis.w * tint.width, v.vis.h * tint.height,
      v.ox, v.oy, v.vis.w * dImg.width * v.s, v.vis.h * dImg.height * v.s,
    )
    ctx.globalAlpha = 1
  }

  function drawEditOverlay(ctx: CanvasRenderingContext2D, v: ViewTransform) {
    const renderer = rendererRef.current
    const d = docRef.current
    if (!renderer) return
    const drag = dragRef.current
    const live = drag?.kind === 'stroke' && drag.target.kind === 'edit' ? drag.stroke : null
    // A base do overlay é a MESMA que vai para a IA (varinha ∪ regiões), então
    // o que aparece marcado é exatamente o que será editado — a única
    // propriedade que uma ferramenta de seleção precisa garantir.
    const pseudo: LocalAdjustment = {
      id: '__edit__', name: '', enabled: true, invert: false,
      shape: propsRef.current.editWand ?? { kind: 'brush' },
      strokes: propsRef.current.editStrokes,
      values: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0, clarity: 0, sharpness: 0 },
      feather: 0, density: 100,
    }
    const rg = renderer.masks.localMask(pseudo, d.width, d.height, live)
    // R (add) → vermelho translúcido de aviso
    const tint = document.createElement('canvas')
    tint.width = rg.width
    tint.height = rg.height
    const tctx = tint.getContext('2d', { willReadFrequently: true })!
    tctx.drawImage(rg, 0, 0)
    const id = tctx.getImageData(0, 0, tint.width, tint.height)
    const dt = id.data

    // Laço, polígono e retângulo vivem num raster à parte (não são forma nem
    // traço), e entram aqui somando ao canal de "adicionar". Sem isto o
    // desenho ficava gravado mas invisível — o que é o mesmo que não existir.
    let regionAlpha: Uint8ClampedArray | null = null
    const regions = editRegionsRef.current
    if (regions) {
      const rc = document.createElement('canvas')
      rc.width = tint.width
      rc.height = tint.height
      const rctx = rc.getContext('2d', { willReadFrequently: true })
      if (rctx) {
        rctx.drawImage(regions, 0, 0, tint.width, tint.height)
        regionAlpha = rctx.getImageData(0, 0, tint.width, tint.height).data
      }
    }

    for (let i = 0; i < dt.length; i += 4) {
      const add = Math.max(dt[i], regionAlpha ? regionAlpha[i + 3] : 0)
      const erase = dt[i + 1]
      const m = Math.max(0, add - erase)
      dt[i] = 224; dt[i + 1] = 88; dt[i + 2] = 74; dt[i + 3] = Math.round(m * 0.55)
    }
    tctx.putImageData(id, 0, 0)
    ctx.drawImage(
      tint,
      v.vis.x * tint.width, v.vis.y * tint.height, v.vis.w * tint.width, v.vis.h * tint.height,
      v.ox, v.oy, v.vis.w * d.width * v.s, v.vis.h * d.height * v.s,
    )
  }

  function drawCropUI(ctx: CanvasRenderingContext2D) {
    const d = docRef.current
    const crop = d.geometry.crop ?? { x: 0, y: 0, w: 1, h: 1 }
    const p0 = toScreen(crop.x, crop.y)
    const p1 = toScreen(crop.x + crop.w, crop.y + crop.h)
    if (!p0 || !p1) return
    const screen = screenRef.current!

    // véu fora do corte
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.rect(0, 0, screen.width, screen.height)
    ctx.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y)
    ctx.fill('evenodd')

    // grade de terços
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    for (let i = 1; i < 3; i++) {
      const gx = p0.x + ((p1.x - p0.x) * i) / 3
      const gy = p0.y + ((p1.y - p0.y) * i) / 3
      ctx.beginPath(); ctx.moveTo(gx, p0.y); ctx.lineTo(gx, p1.y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(p0.x, gy); ctx.lineTo(p1.x, gy); ctx.stroke()
    }

    // borda + alças
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y)
    const hs = 7 * devicePixelRatio
    ctx.fillStyle = '#ffffff'
    for (const [hx, hy] of cropHandles(p0, p1)) {
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
    }
  }

  function elementCorners(t: ElementTransform, elAspect: number): { x: number; y: number }[] {
    const d = docRef.current
    const wPx = t.width * d.width
    const hPx = wPx / elAspect
    const rad = (t.rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const cx = t.x * d.width
    const cy = t.y * d.height
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
      const lx = (sx * wPx) / 2
      const ly = (sy * hPx) / 2
      return {
        x: (cx + lx * cos - ly * sin) / d.width,
        y: (cy + lx * sin + ly * cos) / d.height,
      }
    })
  }

  function drawElementGizmo(ctx: CanvasRenderingContext2D) {
    const p = propsRef.current
    const d = docRef.current
    const el = d.elements.find((e) => e.id === p.activeElementId)
    if (!el) return
    const size = rendererRef.current?.elementImageSize(el.url)
    const elAspect = size ? size.w / size.h : 4 / 3
    const corners = elementCorners(el.transform, elAspect).map((c) => toScreen(c.x, c.y)).filter(Boolean) as { x: number; y: number }[]
    if (corners.length !== 4) return

    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i <= 4; i++) ctx.lineTo(corners[i % 4].x, corners[i % 4].y)
    ctx.stroke()
    ctx.setLineDash([])

    const hs = 8 * devicePixelRatio
    for (const c of corners) {
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.beginPath()
      ctx.arc(c.x, c.y, hs / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    // alça de rotação: acima do centro do topo
    const topMid = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 }
    const center = { x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 }
    const dir = { x: topMid.x - center.x, y: topMid.y - center.y }
    const len = Math.hypot(dir.x, dir.y) || 1
    const rh = { x: topMid.x + (dir.x / len) * 26 * devicePixelRatio, y: topMid.y + (dir.y / len) * 26 * devicePixelRatio }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.beginPath(); ctx.moveTo(topMid.x, topMid.y); ctx.lineTo(rh.x, rh.y); ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(rh.x, rh.y, hs / 2, 0, Math.PI * 2); ctx.fill()
  }

  function drawBrushCursor(ctx: CanvasRenderingContext2D) {
    const p = propsRef.current
    const cur = cursorRef.current
    if (!cur || spaceRef.current) return
    // Na aba Editar só pincel e borracha pintam; varinha, laço, polígono e
    // retângulo não têm raio, então mostrar o círculo do pincel neles era
    // prometer um gesto que a ferramenta não faz.
    const editPaints = p.editSubTool === 'brush' || p.editSubTool === 'eraser'
    const painting =
      (p.tool === 'masks' && p.activeLocalId && p.maskInteraction === 'brush')
      || (p.tool === 'edit' && editPaints)
      || (p.tool === 'elements' && p.activeElementId && p.elementMaskMode)
    if (!painting) return
    const r = (p.brush.size * devicePixelRatio) / 2
    ctx.beginPath()
    ctx.arc(cur.x, cur.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cur.x, cur.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = p.brush.erase ? 'rgba(255,255,255,0.95)' : p.tool === 'edit' ? 'rgba(224,88,74,0.95)' : accentGreen()
    ctx.lineWidth = 1.25
    ctx.stroke()
  }

  // ── Zoom / pan ───────────────────────────────────────────────────────────

  useEffect(() => {
    const screen = screenRef.current
    if (!screen) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const prev = zoomRef.current
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor))
      if (next === prev) return
      const rect = screen.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (screen.width / rect.width)
      const py = (e.clientY - rect.top) * (screen.height / rect.height)
      const v = getView()
      if (v) {
        // Âncora no cursor: o termo de centralização depende do zoom, então o
        // offset "novo" usa C(next) — não o C(prev) — senão a vista deriva.
        const k = next / prev
        const d = docRef.current
        const cPrevX = v.ox - panRef.current.x
        const cPrevY = v.oy - panRef.current.y
        const visW = v.vis.w * d.width
        const visH = v.vis.h * d.height
        const cNextX = (screen.width - visW * (v.s / prev) * next) / 2
        const cNextY = (screen.height - visH * (v.s / prev) * next) / 2
        panRef.current = {
          x: px - (px - panRef.current.x - cPrevX) * k - cNextX,
          y: py - (py - panRef.current.y - cPrevY) * k - cNextY,
        }
      }
      if (next === MIN_ZOOM) panRef.current = { x: 0, y: 0 }
      zoomRef.current = next
      onZoomChange(Math.round(next * 100))
      scheduleDraw()
    }
    screen.addEventListener('wheel', onWheel, { passive: false })
    return () => screen.removeEventListener('wheel', onWheel)
  }, [getView, onZoomChange, scheduleDraw])

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (!el) return false
      if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true
      return el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range'
    }
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !isTyping(e)) spaceRef.current = true }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceRef.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // ── Pointer ──────────────────────────────────────────────────────────────

  const startStroke = (e: React.PointerEvent, target: StrokeTarget) => {
    const p = propsRef.current
    const v = getView()
    const pt = toImage(e.clientX, e.clientY)
    if (!v || !pt) return
    const d = docRef.current
    const sizeImagePx = (p.brush.size * devicePixelRatio) / v.s
    const stroke: LiveStroke = {
      points: [pt],
      sizeImagePx,
      hardness: p.brush.hardness,
      flow: p.brush.flow,
      erase: p.brush.erase,
    }
    void d
    dragRef.current = { kind: 'stroke', pointerId: e.pointerId, target, stroke }
    needsGlRef.current = true
    scheduleDraw()
  }

  const hitCropHandle = (px: number, py: number): string | null => {
    const d = docRef.current
    const crop = d.geometry.crop ?? { x: 0, y: 0, w: 1, h: 1 }
    const p0 = toScreen(crop.x, crop.y)
    const p1 = toScreen(crop.x + crop.w, crop.y + crop.h)
    if (!p0 || !p1) return null
    const tol = 12 * devicePixelRatio
    const handles: [string, number, number][] = [
      ['nw', p0.x, p0.y], ['ne', p1.x, p0.y], ['se', p1.x, p1.y], ['sw', p0.x, p1.y],
      ['n', (p0.x + p1.x) / 2, p0.y], ['s', (p0.x + p1.x) / 2, p1.y],
      ['w', p0.x, (p0.y + p1.y) / 2], ['e', p1.x, (p0.y + p1.y) / 2],
    ]
    for (const [mode, hx, hy] of handles) {
      if (Math.abs(px - hx) < tol && Math.abs(py - hy) < tol) return mode
    }
    if (px > p0.x && px < p1.x && py > p0.y && py < p1.y) return 'move'
    return null
  }

  const hitElement = (nx: number, ny: number): string | null => {
    const d = docRef.current
    // topo → base
    for (let i = d.elements.length - 1; i >= 0; i--) {
      const el = d.elements[i]
      if (!el.visible) continue
      const size = rendererRef.current?.elementImageSize(el.url)
      const elAspect = size ? size.w / size.h : 4 / 3
      // inverso: ponto em coords locais do elemento
      const wN = el.transform.width
      const hN = (el.transform.width / elAspect) * (d.width / d.height)
      const rad = (-el.transform.rotation * Math.PI) / 180
      const dx = (nx - el.transform.x) * d.width
      const dy = (ny - el.transform.y) * d.height
      const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / d.width
      const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / d.height
      if (Math.abs(lx) <= wN / 2 && Math.abs(ly) <= hN / 2) return el.id
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const screen = screenRef.current
    if (!screen || dragRef.current) return
    screen.setPointerCapture(e.pointerId)
    const p = propsRef.current
    const rect = screen.getBoundingClientRect()
    const px = (e.clientX - rect.left) * (screen.width / rect.width)
    const py = (e.clientY - rect.top) * (screen.height / rect.height)

    const isPan = spaceRef.current || e.button === 1
    if (isPan) {
      dragRef.current = { kind: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
      return
    }
    if (e.button !== 0 || p.compare) return

    // Modos de comparação são de VISUALIZAÇÃO: divisor arrastável + pan.
    if (p.compareMode === 'split') {
      const sx = splitRef.current * screen.width
      if (Math.abs(px - sx) < 14 * devicePixelRatio) {
        dragRef.current = { kind: 'split', pointerId: e.pointerId }
        return
      }
      dragRef.current = { kind: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
      return
    }
    if (p.compareMode === 'side') {
      dragRef.current = { kind: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
      return
    }

    if (p.wbPicking) {
      const pt = toImage(e.clientX, e.clientY)
      const img = baseImgRef.current
      if (pt && img && pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1) {
        const rgb = sampleImage(img, pt.x, pt.y)
        if (rgb) onPickWb(rgb)
      }
      return
    }

    switch (p.tool) {
      case 'masks': {
        if (!p.activeLocalId) return
        const local = docRef.current.locals.find((l) => l.id === p.activeLocalId)
        if (!local) return
        const canShape = local.shape.kind === 'linear' || local.shape.kind === 'radial'
        if (p.maskInteraction === 'shape' && canShape) {
          const pt = toImage(e.clientX, e.clientY)
          if (!pt) return
          dragRef.current = { kind: 'shape', pointerId: e.pointerId, localId: local.id, shapeKind: local.shape.kind as 'linear' | 'radial', start: pt }
        } else {
          startStroke(e, { kind: 'local', id: p.activeLocalId })
        }
        return
      }
      case 'edit': {
        const p2 = propsRef.current
        const sub = p2.editSubTool
        const alt = e.altKey

        if (sub === 'lasso') {
          const pt = toImage(e.clientX, e.clientY)
          if (pt) dragRef.current = { kind: 'edit-lasso', pointerId: e.pointerId, points: [pt], erase: alt }
          return
        }
        if (sub === 'rect') {
          const pt = toImage(e.clientX, e.clientY)
          if (pt) dragRef.current = { kind: 'edit-rect', pointerId: e.pointerId, from: pt, to: pt, erase: alt }
          return
        }
        if (sub === 'polygon') {
          const pt = toImage(e.clientX, e.clientY)
          if (!pt) return
          const poly = editPolyRef.current
          if (poly && poly.points.length >= 3) {
            // Clique perto do primeiro ponto fecha a área — a convenção de
            // qualquer ferramenta de polígono.
            const v0 = getView()
            const first = poly.points[0]
            const d0 = docRef.current
            if (v0) {
              const dx = (pt.x - first.x) * d0.width * v0.s
              const dy = (pt.y - first.y) * d0.height * v0.s
              if (Math.hypot(dx, dy) <= POLY_CLOSE_PX * devicePixelRatio) {
                closeEditPolygon()
                return
              }
            }
          }
          const nextPoly = poly ?? { points: [] as { x: number; y: number }[], erase: alt }
          nextPoly.points.push(pt)
          editPolyRef.current = nextPoly
          setPolyCount(nextPoly.points.length)
          scheduleDraw()
          return
        }

        // Varinha: um CLIQUE seleciona; ela não pinta. Pincel e borracha
        // continuam pintando por cima do que ela selecionou.
        //
        // Shift SOMA e Alt SUBTRAI — é o que transforma "um clique, uma
        // tentativa" em ferramenta de verdade, e uma seleção difícil em três
        // cliques fáceis. Some por um tempo na fusão com o Finalizar: a
        // varinha virou uma forma paramétrica única, e forma não soma com
        // forma. Volta pelo raster, que é onde soma e subtração são a mesma
        // operação.
        if (sub === 'wand') {
          const pt = toImage(e.clientX, e.clientY)
          const index = colorIndexRef.current
          if (pt && index) {
            const { mask, tolerance } = magicWandAuto(
              index,
              pt.x * index.width,
              pt.y * index.height,
              {
                tolerance: p2.wandTolerance,
                contiguous: p2.wandContiguous,
                sampleRadius: wandSampleRadius(index, docRef.current.width),
              },
            )
            pushSelectionUndo()
            if (e.shiftKey || alt) {
              bakeWandShape()
              mergeWandMask(index, mask, alt)
              scheduleDraw()
              return
            }
            // Clique simples SUBSTITUI, como em qualquer editor — mas só
            // apaga as regiões se elas vieram da própria varinha.
            if (wandOnlyRegionsRef.current && editRegionsRef.current) {
              const rctx = editRegionsRef.current.getContext('2d')
              rctx?.clearRect(0, 0, editRegionsRef.current.width, editRegionsRef.current.height)
              p2.onRegionsChange(false)
            }
            p2.onWandPick({
              kind: 'wand',
              seed: pt,
              tolerance,
              contiguous: p2.wandContiguous,
              sampleRadius: WAND_SAMPLE_RADIUS_IMAGE_PX,
            })
          }
          return
        }
        // Pincel e borracha também são gesto de seleção: cada traço vira um
        // passo de undo, senão Ctrl+Z pularia direto por cima de todos eles.
        pushSelectionUndo()
        startStroke(e, { kind: 'edit' })
        return
      }
      case 'geometry': {
        const mode = hitCropHandle(px, py)
        const pt = toImage(e.clientX, e.clientY)
        if (!pt) return
        const crop0 = docRef.current.geometry.crop ?? { x: 0, y: 0, w: 1, h: 1 }
        const ratioId = docRef.current.geometry.aspect
        const d = docRef.current
        let ratio: number | null = null
        if (ratioId && ratioId !== 'free') {
          ratio = crop0.w * d.width / Math.max(1e-6, crop0.h * d.height)
        }
        dragRef.current = { kind: 'crop', pointerId: e.pointerId, mode: mode ?? 'create', start: pt, crop0, ratio }
        return
      }
      case 'elements': {
        if (p.elementMaskMode && p.activeElementId) {
          startStroke(e, { kind: 'element', id: p.activeElementId })
          return
        }
        // alças do elemento ativo primeiro
        const d = docRef.current
        const active = d.elements.find((el) => el.id === p.activeElementId)
        if (active) {
          const size = rendererRef.current?.elementImageSize(active.url)
          const elAspect = size ? size.w / size.h : 4 / 3
          const corners = elementCorners(active.transform, elAspect).map((c) => toScreen(c.x, c.y)) as ({ x: number; y: number } | null)[]
          const centerS = toScreen(active.transform.x, active.transform.y)
          const tol = 12 * devicePixelRatio
          if (centerS && corners.every(Boolean)) {
            const cs = corners as { x: number; y: number }[]
            // rotação
            const topMid = { x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2 }
            const dir = { x: topMid.x - centerS.x, y: topMid.y - centerS.y }
            const len = Math.hypot(dir.x, dir.y) || 1
            const rh = { x: topMid.x + (dir.x / len) * 26 * devicePixelRatio, y: topMid.y + (dir.y / len) * 26 * devicePixelRatio }
            if (Math.hypot(px - rh.x, py - rh.y) < tol) {
              dragRef.current = {
                kind: 'element-rotate', pointerId: e.pointerId, id: active.id, t0: active.transform,
                center: centerS, startAngle: Math.atan2(py - centerS.y, px - centerS.x),
              }
              return
            }
            for (const c of cs) {
              if (Math.hypot(px - c.x, py - c.y) < tol) {
                dragRef.current = {
                  kind: 'element-scale', pointerId: e.pointerId, id: active.id, t0: active.transform,
                  center: centerS, startDist: Math.max(4, Math.hypot(px - centerS.x, py - centerS.y)),
                }
                return
              }
            }
          }
        }
        const pt = toImage(e.clientX, e.clientY)
        if (!pt) return
        const hitId = hitElement(pt.x, pt.y)
        onSelectElement(hitId)
        if (hitId) {
          const el = docRef.current.elements.find((x) => x.id === hitId)!
          dragRef.current = { kind: 'element-move', pointerId: e.pointerId, id: hitId, start: pt, t0: el.transform }
        }
        return
      }
      default:
        // adjust/color: arrasto = pan
        dragRef.current = { kind: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const screen = screenRef.current
    if (!screen) return
    const rect = screen.getBoundingClientRect()
    cursorRef.current = {
      x: (e.clientX - rect.left) * (screen.width / rect.width),
      y: (e.clientY - rect.top) * (screen.height / rect.height),
    }
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) {
      scheduleDraw()
      return
    }

    switch (drag.kind) {
      case 'split': {
        const px = (e.clientX - rect.left) * (screen.width / rect.width)
        splitRef.current = Math.max(0.05, Math.min(0.95, px / screen.width))
        break
      }
      case 'pan': {
        const dpr = screen.width / rect.width
        panRef.current = { x: drag.panX + (e.clientX - drag.startX) * dpr, y: drag.panY + (e.clientY - drag.startY) * dpr }
        break
      }
      case 'stroke': {
        const native = e.nativeEvent
        const events = typeof native.getCoalescedEvents === 'function' && native.getCoalescedEvents().length > 0
          ? native.getCoalescedEvents()
          : [native]
        for (const ev of events) {
          const pt = toImage(ev.clientX, ev.clientY)
          if (pt) drag.stroke.points.push(pt)
        }
        if (drag.target.kind === 'edit') {
          // overlay 2D é redesenhado; motor não precisa
        } else {
          needsGlRef.current = true
        }
        break
      }
      case 'edit-lasso': {
        const pt = toImage(e.clientX, e.clientY)
        if (pt) drag.points.push(pt)
        break
      }
      case 'edit-rect': {
        const pt = toImage(e.clientX, e.clientY)
        if (pt) drag.to = pt
        break
      }
      case 'shape': {
        const pt = toImage(e.clientX, e.clientY)
        if (!pt) break
        const curShape = docRef.current?.locals.find((l) => l.id === drag.localId)?.shape
        const shape: MaskShape = drag.shapeKind === 'linear'
          ? { kind: 'linear', x0: drag.start.x, y0: drag.start.y, x1: pt.x, y1: pt.y }
          : {
              kind: 'radial', cx: drag.start.x, cy: drag.start.y,
              rx: Math.max(0.02, Math.abs(pt.x - drag.start.x)),
              ry: Math.max(0.02, Math.abs(pt.y - drag.start.y)),
              // Reposicionar não reseta a suavidade escolhida no painel.
              feather: curShape?.kind === 'radial' ? curShape.feather : 0.5,
            }
        onShapeChange(drag.localId, shape)
        break
      }
      case 'crop': {
        const pt = toImage(e.clientX, e.clientY)
        if (!pt) break
        onCropChange(resizeCrop(drag.crop0, drag.mode, drag.start, pt, drag.ratio, docRef.current.width / docRef.current.height))
        break
      }
      case 'element-move': {
        const pt = toImage(e.clientX, e.clientY)
        if (!pt) break
        onElementChange(drag.id, {
          ...drag.t0,
          x: clamp(drag.t0.x + (pt.x - drag.start.x), -0.5, 1.5),
          y: clamp(drag.t0.y + (pt.y - drag.start.y), -0.5, 1.5),
        }, false)
        break
      }
      case 'element-scale': {
        const px = cursorRef.current!.x
        const py = cursorRef.current!.y
        const dist = Math.hypot(px - drag.center.x, py - drag.center.y)
        onElementChange(drag.id, {
          ...drag.t0,
          width: clamp(drag.t0.width * (dist / drag.startDist), 0.02, 4),
        }, false)
        break
      }
      case 'element-rotate': {
        const px = cursorRef.current!.x
        const py = cursorRef.current!.y
        const angle = Math.atan2(py - drag.center.y, px - drag.center.x)
        let deg = drag.t0.rotation + ((angle - drag.startAngle) * 180) / Math.PI
        if (e.shiftKey) deg = Math.round(deg / 15) * 15
        onElementChange(drag.id, { ...drag.t0, rotation: normalizeDeg(deg) }, false)
        break
      }
    }
    scheduleDraw()
  }

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    dragRef.current = null
    switch (drag.kind) {
      case 'stroke': {
        const s = drag.stroke
        if (s.points.length > 0) {
          onStrokeCommit(drag.target, {
            points: s.points,
            sizeImagePx: s.sizeImagePx,
            hardness: s.hardness,
            flow: s.flow,
            erase: s.erase,
          })
        }
        needsGlRef.current = true
        break
      }
      case 'edit-lasso': {
        fillEditRegion(drag.points, drag.erase)
        break
      }
      case 'edit-rect': {
        fillEditRect(drag.from, drag.to, drag.erase)
        break
      }
      case 'element-move':
      case 'element-scale':
      case 'element-rotate': {
        const d = docRef.current
        const el = d.elements.find((x) => x.id === drag.id)
        if (el) onElementChange(drag.id, el.transform, true)
        break
      }
      default:
        break
    }
    scheduleDraw()
  }

  /** Canvas das regiões, criado sob demanda no tamanho do documento. */
  function editRegions(): HTMLCanvasElement | null {
    const d = docRef.current
    if (!d.width || !d.height) return null
    let c = editRegionsRef.current
    if (!c || c.width !== d.width || c.height !== d.height) {
      c = document.createElement('canvas')
      c.width = d.width
      c.height = d.height
      editRegionsRef.current = c
    }
    return c
  }

  /** Preenche um polígono (laço, polígono ou retângulo) nas regiões.
   *  `erase` recorta em vez de somar — é o Alt de qualquer editor. */
  function fillEditRegion(points: { x: number; y: number }[], erase: boolean) {
    const c = editRegions()
    const d = docRef.current
    if (!c || points.length < 3) return
    pushSelectionUndo()
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.save()
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    points.forEach((p, i) => {
      const x = p.x * d.width
      const y = p.y * d.height
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    wandOnlyRegionsRef.current = false
    propsRef.current.onRegionsChange(true)
  }

  /** Soma (ou subtrai, com Alt) uma máscara de varinha nas regiões. É o que
   *  devolve a seleção múltipla: formas paramétricas não somam, raster soma. */
  function mergeWandMask(index: ColorIndex, mask: Uint8Array, erase: boolean) {
    const regions = editRegions()
    const src = maskToCanvas(index, mask)
    const ctx = regions?.getContext('2d')
    if (!regions || !src || !ctx) return
    ctx.save()
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    ctx.drawImage(src, 0, 0, regions.width, regions.height)
    ctx.restore()
    propsRef.current.onRegionsChange(true)
  }

  /** Assa a forma de varinha ativa dentro das regiões e avisa o pai para
   *  soltá-la. Precisa acontecer ANTES de somar ou subtrair: enquanto ela for
   *  forma, o subtrair não a alcança (a composição só sabe somar formas). */
  function bakeWandShape() {
    const shape = propsRef.current.editWand
    const index = colorIndexRef.current
    if (!shape || !index) return
    const d = docRef.current
    const c = rasterizeWand(index, shape, d.width, d.height, d.width)
    const regions = editRegions()
    const ctx = regions?.getContext('2d')
    if (c && regions && ctx) {
      ctx.save()
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(c, 0, 0, regions.width, regions.height)
      ctx.restore()
    }
    propsRef.current.onWandAbsorbed()
  }

  /** Retângulo a partir de dois cantos. */
  function fillEditRect(a: { x: number; y: number }, b: { x: number; y: number }, erase: boolean) {
    const x0 = Math.min(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const x1 = Math.max(a.x, b.x)
    const y1 = Math.max(a.y, b.y)
    if (x1 - x0 < 0.002 || y1 - y0 < 0.002) return
    fillEditRegion([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], erase)
  }

  /** Fecha o polígono em curso e o transforma em região. */
  function closeEditPolygon() {
    const poly = editPolyRef.current
    if (poly && poly.points.length >= 3) fillEditRegion(poly.points, poly.erase)
    editPolyRef.current = null
    setPolyCount(0)
    scheduleDraw()
  }

  /** Base da seleção de edição: varinha ∪ regiões desenhadas, no tamanho pedido. */
  function editSelectionBase(w: number, h: number): HTMLCanvasElement | null {
    const shape = propsRef.current.editWand
    const index = colorIndexRef.current
    const regions = editRegionsRef.current
    const wand = shape && index ? rasterizeWand(index, shape, w, h, docRef.current.width) : null
    if (!wand && !regions) return null
    if (wand && !regions) return wand
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')
    if (!ctx) return wand
    if (wand) ctx.drawImage(wand, 0, 0, w, h)
    if (regions) ctx.drawImage(regions, 0, 0, w, h)
    return out
  }

  /** A seleção completa de hoje (varinha ∪ regiões ∪ traços) como máscara
   *  binária na resolução do índice de cor. null = não há índice, geometria
   *  aplicada, ou nada marcado. */
  function composeSelectionMask(): { index: ColorIndex; mask: Uint8Array; marked: number } | null {
    const index = colorIndexRef.current
    const d = docRef.current
    if (!index || !isGeometryIdentity(d.geometry)) return null
    const base = editSelectionBase(index.width, index.height)
    const full = selectionMaskPngCanvas(base, propsRef.current.editStrokes, index.width, index.height)
    const fctx = full.getContext('2d', { willReadFrequently: true })
    if (!fctx) return null
    const px = fctx.getImageData(0, 0, index.width, index.height).data
    const n = index.width * index.height
    const mask = new Uint8Array(n)
    let marked = 0
    // O PNG da máscara é branco sobre preto e opaco: quem manda é o canal R.
    for (let i = 0; i < n; i++) if (px[i * 4] > 127) { mask[i] = 255; marked++ }
    return { index, mask, marked }
  }

  /** Grava uma máscara como a seleção inteira: vira região única, a forma da
   *  varinha e os traços são absorvidos. */
  function writeSelection(
    index: ColorIndex,
    mask: Uint8Array,
    n: number,
    before: number,
  ): { coverage: number; before: number; applied: boolean } | null {
    const src = maskToCanvas(index, mask)
    const regions = editRegions()
    const rctx = regions?.getContext('2d')
    if (!src || !regions || !rctx) return null
    rctx.clearRect(0, 0, regions.width, regions.height)
    rctx.drawImage(src, 0, 0, regions.width, regions.height)

    let after = 0
    for (let i = 0; i < n; i++) if (mask[i] > 127) after++
    editPolyRef.current = null
    wandOnlyRegionsRef.current = false
    propsRef.current.onRegionsChange(true)
    propsRef.current.onSelectionGrown()
    scheduleDraw()
    return { coverage: after / n, before, applied: true }
  }

  /** Compõe → transforma → grava. É o caminho único de toda operação sobre a
   *  seleção; `maxCoverage` faz a transformação ser DESCARTADA se estourar. */
  function transformSelection(
    fn: (mask: Uint8Array, index: ColorIndex) => Uint8Array | undefined,
    maxCoverage?: number,
  ): { coverage: number; before: number; applied: boolean } | null {
    const composed = composeSelectionMask()
    if (!composed || composed.marked === 0) return null
    pushSelectionUndo()
    const { index, mask, marked } = composed
    const n = index.width * index.height
    const out = fn(mask, index)
    if (!out) return null
    const before = marked / n
    if (maxCoverage !== undefined) {
      let after = 0
      for (let i = 0; i < n; i++) if (out[i] > 127) after++
      if (after / n > maxCoverage) return { coverage: after / n, before, applied: false }
    }
    return writeSelection(index, out, n, before)
  }

  // Trocar de ferramenta abandona o polígono em curso. Enquanto isso não
  // existia, o traço de um polígono esquecido seguia na tela sob a varinha —
  // uma marcação que a ferramenta ativa não sabia explicar nem apagar.
  useEffect(() => {
    if (editSubTool === 'polygon') return
    if (!editPolyRef.current) return
    editPolyRef.current = null
    setPolyCount(0)
    scheduleDraw()
  }, [editSubTool, scheduleDraw])

  /** Empilha a seleção ATUAL. Chamar ANTES de qualquer coisa que a mude. */
  function pushSelectionUndo() {
    const composed = composeSelectionMask()
    // Sem índice de cor (imagem sem CORS) não há como compor — a seleção segue
    // funcionando, só não ganha undo próprio.
    if (!composed) return
    selUndoRef.current.push(rleEncode(composed.mask))
    if (selUndoRef.current.length > SELECTION_HISTORY_LIMIT) selUndoRef.current.shift()
    selRedoRef.current = []
    propsRef.current.onSelectionHistory(true, false)
  }

  /** Devolve a máscara guardada para a tela, como região única. */
  function restoreSelection(rle: Int32Array): boolean {
    const index = colorIndexRef.current
    if (!index) return false
    const n = index.width * index.height
    const ok = writeSelection(index, rleDecode(rle, n), n, 0)
    propsRef.current.onSelectionHistory(
      selUndoRef.current.length > 0,
      selRedoRef.current.length > 0,
    )
    return ok !== null
  }

  // ── API imperativa ───────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    fit: () => {
      zoomRef.current = 1
      panRef.current = { x: 0, y: 0 }
      onZoomChange(100)
      scheduleDraw()
    },
    zoomBy: (factor: number) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor))
      zoomRef.current = next
      if (next === MIN_ZOOM) panRef.current = { x: 0, y: 0 }
      onZoomChange(Math.round(next * 100))
      scheduleDraw()
    },
    thumbnail: async (maxDim: number) => {
      const glCanvas = glCanvasRef.current
      if (!glCanvas || !baseReady) return null
      // garante frame atual
      rendererRef.current?.render(docRef.current)
      const d = docRef.current
      const crop = d.geometry.crop ?? { x: 0, y: 0, w: 1, h: 1 }
      const sw = crop.w * glCanvas.width
      const sh = crop.h * glCanvas.height
      const k = Math.min(1, maxDim / Math.max(sw, sh))
      const out = document.createElement('canvas')
      out.width = Math.max(2, Math.round(sw * k))
      out.height = Math.max(2, Math.round(sh * k))
      const ctx = out.getContext('2d')
      if (!ctx) return null
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, out.width, out.height)
      try {
        ctx.drawImage(glCanvas, crop.x * glCanvas.width, crop.y * glCanvas.height, sw, sh, 0, 0, out.width, out.height)
      } catch {
        return null
      }
      return new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.75))
    },
    resultHistogram: () => {
      const glCanvas = glCanvasRef.current
      if (!glCanvas || !baseReady || glCanvas.width < 4) return null
      return computeHistogram(glCanvas, glCanvas.width, glCanvas.height)
    },
    makeSkyMask: () => {
      const img = baseImgRef.current
      const d = docRef.current
      if (!img) return null
      return computeSkyMask(
        img, img.naturalWidth, img.naturalHeight,
        Math.max(2, Math.round(d.width * MASK_SCALE)), Math.max(2, Math.round(d.height * MASK_SCALE)),
      )
    },
    baseImage: () => baseImgRef.current,
    webglSupported: () => glOk,
    // Resolução CHEIA: este raster vai para a IA, não para a tela.
    wandMask: () => {
      const d = docRef.current
      return editSelectionBase(d.width, d.height)
    },
    clearEditRegions: () => {
      // Desmarcar TAMBÉM é um gesto: sem empilhar, quem limpa sem querer não
      // tem volta — que é exatamente a reclamação que trouxe este undo.
      if (editRegionsRef.current || propsRef.current.editWand || propsRef.current.editStrokes.length > 0) {
        pushSelectionUndo()
      }
      editRegionsRef.current = null
      editPolyRef.current = null
      wandOnlyRegionsRef.current = true
      propsRef.current.onRegionsChange(false)
      scheduleDraw()
    },
    // Crescer a seleção até o material inteiro.
    //
    // Só existe com geometria identidade — a mesma razão da varinha: os traços
    // vivem em espaço de EXIBIÇÃO e o índice de cor em espaço de ORIGEM, e
    // enquanto a geometria é identidade os dois coincidem. Com perspectiva
    // aplicada seria preciso deformar o raster pela inversa da homografia.
    //
    // O resultado vira uma REGIÃO (raster), porque uma área crescida não cabe
    // nos parâmetros de uma WandShape: ela nasce de traços, varinha e regiões
    // ao mesmo tempo. Depois disso a seleção é uma coisa só.
    undoSelection: () => {
      const anterior = selUndoRef.current.pop()
      if (!anterior) return false
      const atual = composeSelectionMask()
      if (atual) selRedoRef.current.push(rleEncode(atual.mask))
      return restoreSelection(anterior)
    },
    redoSelection: () => {
      const proximo = selRedoRef.current.pop()
      if (!proximo) return false
      const atual = composeSelectionMask()
      if (atual) selUndoRef.current.push(rleEncode(atual.mask))
      return restoreSelection(proximo)
    },
    growEditSelection: (opts) => transformSelection((mask, index) => {
      const { mask: grown } = growSelectionAuto(index, mask, {
        tolerance: propsRef.current.wandTolerance,
        contiguous: propsRef.current.wandContiguous,
        sampleRadius: wandSampleRadius(index, docRef.current.width),
      })
      return grown
    }, opts?.maxCoverage),

    // Ajustes da seleção — expandir, contrair, suavizar, tapar buraco, limpar
    // respingo, inverter, selecionar tudo.
    //
    // Existiam no V4 e sumiram na fusão junto com o raster: eram operações de
    // morfologia sobre `Uint8Array`, e a varinha virou forma paramétrica. A
    // biblioteca (`lib/selection/mask-raster`) nunca saiu do repositório —
    // ficou órfã, com testes passando e ninguém chamando. Voltam pelo mesmo
    // caminho do crescimento: compõe tudo num raster, transforma, grava de
    // volta como região.
    //
    // Nenhuma delas consome node. São aritmética de browser.
    refineSelection: (op, px = 2) => {
      if (op === 'selectAll') {
        const index = colorIndexRef.current
        const d = docRef.current
        if (!index || !isGeometryIdentity(d.geometry)) return null
        const n = index.width * index.height
        const all = new Uint8Array(n).fill(255)
        // Selecionar tudo não passa pelo transformSelection (não depende de haver
        // seleção antes), então empilha aqui — senão seria o único gesto sem volta.
        pushSelectionUndo()
        return writeSelection(index, all, n, 0)
      }
      return transformSelection((mask, index) => {
        const { width: w, height: h } = index
        switch (op) {
          case 'expand':       return expandSelection(mask, w, h, px)
          case 'contract':     return contractSelection(mask, w, h, px)
          case 'smooth':       return smoothSelection(mask, w, h, px)
          case 'fillHoles':    return fillSelectionHoles(mask, w, h)
          // O piso de tamanho acompanha a imagem: 0,002% do total. Numa de 4 MP
          // são ~85 px — some com o salpico da varinha em textura ruidosa e
          // preserva qualquer coisa que alguém tenha marcado de propósito.
          case 'cleanIslands': return removeSmallIslands(mask, w, h, Math.max(24, Math.round(w * h * 0.00002)))
          case 'invert':       return invertSelection(new Uint8Array(mask))
        }
      })
    },
    // A seleção como PNG branco-sobre-preto, no tamanho do documento — é o que
    // o "Colar na borda" manda ao servidor.
    selectionBlob: async () => {
      const d = docRef.current
      const base = editSelectionBase(d.width, d.height)
      if (!base && propsRef.current.editStrokes.length === 0) return null
      const canvas = selectionMaskPngCanvas(base, propsRef.current.editStrokes, d.width, d.height)
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    },

    // Substitui a seleção pela máscara refinada que voltou do servidor. Ela
    // nasce casada com a imagem (mesmas dimensões), então entra como região
    // única e absorve forma e traços — igual a qualquer outra transformação.
    loadSelectionMask: async (url: string) => {
      const regions = editRegions()
      const rctx = regions?.getContext('2d')
      if (!regions || !rctx) return false
      pushSelectionUndo()
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const im = new Image()
        im.crossOrigin = 'anonymous'
        im.onload = () => resolve(im)
        im.onerror = () => resolve(null)
        im.src = url
      })
      if (!img) return false
      rctx.clearRect(0, 0, regions.width, regions.height)
      rctx.drawImage(img, 0, 0, regions.width, regions.height)
      // O PNG vem branco sobre PRETO opaco; a região precisa de alpha, senão o
      // preto de fora conta como selecionado. Converte no lugar.
      const id = rctx.getImageData(0, 0, regions.width, regions.height)
      const dt = id.data
      for (let i = 0; i < dt.length; i += 4) {
        const on = dt[i] > 127
        const v = on ? 255 : 0
        dt[i] = v; dt[i + 1] = v; dt[i + 2] = v; dt[i + 3] = v
      }
      rctx.putImageData(id, 0, 0)

      editPolyRef.current = null
      wandOnlyRegionsRef.current = false
      propsRef.current.onRegionsChange(true)
      propsRef.current.onSelectionGrown()
      scheduleDraw()
      return true
    },

    // (mantido no handle para uso interno/testes; a TELA decide por
    //  `canSample` + geometria, sem ler ref durante o render.)
    // A varinha lê a imagem ORIGINAL; os traços e o overlay vivem no espaço já
    // corrigido pela geometria. Enquanto a geometria é identidade os dois
    // espaços coincidem e não há o que reconciliar. Com perspectiva ou corte
    // aplicados, reconciliar exigiria deformar o raster pela inversa da
    // homografia — trabalho que só se paga se alguém precisar, e a ordem do
    // trilho (Editar primeiro, Geometria depois) diz que raramente vai
    // precisar. Até lá, a varinha se desliga e a tela explica por quê, em vez
    // de entregar uma seleção silenciosamente torta.
    wandAvailable: () => colorIndexRef.current !== null && isGeometryIdentity(docRef.current.geometry),
    // composeSelectionMask/writeSelection/transformSelection são declarações de
    // função do corpo do componente: mudam de identidade a cada render, mas só
    // leem refs (docRef, propsRef, colorIndexRef, editRegionsRef). Listá-las
    // recriaria o handle a cada render sem ganho nenhum; omiti-las não deixa o
    // handle velho, porque não há estado capturado nelas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [baseReady, glOk, onZoomChange, scheduleDraw])

  // ── Cursor CSS ───────────────────────────────────────────────────────────

  const painting = compareMode === 'none' && (
    (tool === 'masks' && activeLocalId && maskInteraction === 'brush')
    || (tool === 'edit' && (editSubTool === 'brush' || editSubTool === 'eraser'))
    || (tool === 'elements' && activeElementId && elementMaskMode)
  )
  const cursorStyle = compareMode === 'split'
    ? 'col-resize'
    : compareMode === 'side'
      ? 'default'
      : wbPicking
        ? 'crosshair'
        : painting
          ? 'none'
          : tool === 'geometry'
            ? 'crosshair'
            : 'default'

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative', flex: 1, minWidth: 0, minHeight: 0,
        overflow: 'hidden', background: 'var(--color-canvas)',
      }}
    >
      <canvas
        ref={screenRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={(e) => { cursorRef.current = null; endDrag(e) }}
        onDoubleClick={() => { if (polyCount >= 3) closeEditPolygon() }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: cursorStyle }}
      />
      {!glOk && (
        <div style={overlayMsg}>
          <div style={{ maxWidth: 380, textAlign: 'center', lineHeight: 1.6 }}>
            Este navegador não suporta WebGL2, necessário para o editor.
            Atualize o navegador ou habilite a aceleração de hardware.
          </div>
        </div>
      )}
      {glOk && !baseReady && (
        <div style={overlayMsg}>Carregando imagem…</div>
      )}
      {polyCount >= 3 && (
        <button
          type="button"
          onClick={closeEditPolygon}
          className="spn-glass spn-glass--raised"
          style={{
            position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)',
            padding: '7px 14px', borderRadius: 999, fontSize: 12.5,
            color: 'var(--color-text-primary)', cursor: 'pointer', zIndex: 3,
          }}
        >
          Fechar área
        </button>
      )}
    </div>
  )
})

// ── helpers ──────────────────────────────────────────────────────────────────

const overlayMsg: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
  color: 'var(--color-text-tertiary)', fontSize: 13, padding: 24,
}

function accentGreen(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-green').trim()
  return v || '#30d158'
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function normalizeDeg(deg: number): number {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / Math.max(1e-6, b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

function cropHandles(p0: { x: number; y: number }, p1: { x: number; y: number }): [number, number][] {
  return [
    [p0.x, p0.y], [p1.x, p0.y], [p1.x, p1.y], [p0.x, p1.y],
    [(p0.x + p1.x) / 2, p0.y], [(p0.x + p1.x) / 2, p1.y],
    [p0.x, (p0.y + p1.y) / 2], [p1.x, (p0.y + p1.y) / 2],
  ]
}

function sampleImage(img: HTMLImageElement, nx: number, ny: number): [number, number, number] | null {
  const c = document.createElement('canvas')
  c.width = 5
  c.height = 5
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const sx = clamp(Math.round(nx * img.naturalWidth) - 2, 0, img.naturalWidth - 5)
  const sy = clamp(Math.round(ny * img.naturalHeight) - 2, 0, img.naturalHeight - 5)
  ctx.drawImage(img, sx, sy, 5, 5, 0, 0, 5, 5)
  try {
    const data = ctx.getImageData(0, 0, 5, 5).data
    let r = 0; let g = 0; let b = 0
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2] }
    const n = data.length / 4
    return [r / n / 255, g / n / 255, b / n / 255]
  } catch {
    return null
  }
}

const MIN_CROP = 0.05

/** Redimensiona/move o corte; ratio em unidades de PIXEL (w_px/h_px) ou null. */
function resizeCrop(
  crop0: CropRect, mode: string, start: { x: number; y: number }, pt: { x: number; y: number },
  ratio: number | null, imgRatio: number,
): CropRect {
  const dx = pt.x - start.x
  const dy = pt.y - start.y
  let { x, y, w, h } = crop0

  if (mode === 'move') {
    x = clamp(x + dx, 0, 1 - w)
    y = clamp(y + dy, 0, 1 - h)
    return { x, y, w, h }
  }
  if (mode === 'create') {
    const x0 = clamp(Math.min(start.x, pt.x), 0, 1)
    const y0 = clamp(Math.min(start.y, pt.y), 0, 1)
    const x1 = clamp(Math.max(start.x, pt.x), 0, 1)
    const y1 = clamp(Math.max(start.y, pt.y), 0, 1)
    return { x: x0, y: y0, w: Math.max(MIN_CROP, x1 - x0), h: Math.max(MIN_CROP, y1 - y0) }
  }

  const right = x + w
  const bottom = y + h
  let nx0 = x
  let ny0 = y
  let nx1 = right
  let ny1 = bottom
  if (mode.includes('w')) nx0 = clamp(x + dx, 0, right - MIN_CROP)
  if (mode.includes('e')) nx1 = clamp(right + dx, x + MIN_CROP, 1)
  if (mode.includes('n')) ny0 = clamp(y + dy, 0, bottom - MIN_CROP)
  if (mode.includes('s')) ny1 = clamp(bottom + dy, y + MIN_CROP, 1)

  x = nx0; y = ny0; w = nx1 - nx0; h = ny1 - ny0

  if (ratio) {
    // trava a proporção em unidades de pixel: (w·W)/(h·H) = ratio
    const targetWOverH = ratio / imgRatio // em unidades normalizadas
    if (mode === 'n' || mode === 's') {
      const newW = h * targetWOverH
      const cx = crop0.x + crop0.w / 2
      x = clamp(cx - newW / 2, 0, 1 - newW)
      w = Math.min(newW, 1)
    } else {
      const newH = w / targetWOverH
      if (mode.includes('n')) y = clamp(ny1 - newH, 0, 1 - Math.min(newH, 1))
      else y = crop0.y
      h = Math.min(newH, 1)
      if (y + h > 1) { h = 1 - y; w = h * targetWOverH }
    }
  }
  return { x, y, w: Math.max(MIN_CROP, w), h: Math.max(MIN_CROP, h) }
}
