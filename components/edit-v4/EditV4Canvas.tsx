'use client'

// EditV4Canvas — a superfície de seleção do Editar V4.
//
// A seleção é um RASTER (`Uint8Array` 0/255 na resolução da imagem), não uma
// lista de traços. Toda ferramenta — varinha, pincel, laço, polígono, retângulo,
// borracha — escreve no MESMO buffer, e por isso todas se compõem: dá para
// clicar na varinha, somar um pedaço com o pincel, subtrair um canto com Alt e
// depois expandir a borda em 2 px. No modelo vetorial do V3 nada disso encaixa.
//
// Desempenho — as três decisões que sustentam a coisa em imagem de 8 MP:
//
//   1. O índice de cor (YCbCr) é calculado UMA vez, quando a imagem carrega.
//      Cada clique da varinha só lê arrays já prontos.
//   2. Rasterizar um traço acontece só na BOUNDING BOX do gesto, não na imagem
//      inteira. Enquanto o dedo está na tela o desenho é vetorial (barato); o
//      raster só é tocado ao soltar.
//   3. Os contornos do tracejado são traçados quando a seleção ASSENTA, em
//      coordenadas de imagem, e viram um `Path2D` reaproveitado. A animação é
//      só `lineDashOffset` — nada é recalculado por frame.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  buildColorIndex,
  applySelectionOp,
  invertSelection,
  magicWandSelect,
  selectionCoverage,
  type ColorIndex,
  type SelectionOp,
  type WandOptions,
} from './selection/magic-wand'
import {
  contractSelection,
  expandSelection,
  fillSelectionHoles,
  hasAnySelection,
  maskToGrayscaleRgba,
  maskToOverlayRgba,
  removeSmallIslands,
  rgbaToMask,
  rleDecode,
  rleEncode,
  smoothSelection,
} from './selection/mask-raster'
import { contoursToPath2D, traceMaskContours, type ContourPath } from './selection/contours'

export type EditV4Tool = 'wand' | 'brush' | 'eraser' | 'lasso' | 'polygon' | 'rect' | 'pan'

/** Cor do véu da seleção. Ciano: não existe em render arquitetônico, então
 *  nunca some contra o conteúdo — e é a convenção do plugin. */
const OVERLAY_RGB = { r: 45, g: 212, b: 191 }
const OVERLAY_ALPHA = 0.32

const MIN_ZOOM = 0.1
const MAX_ZOOM = 12
/** Distância, em px de tela, para o clique "fechar" o polígono no ponto inicial. */
const CLOSE_THRESHOLD_PX = 14
/** Teto de estados de undo. Em RLE cada um custa alguns KB, não alguns MB. */
const HISTORY_LIMIT = 40

type Pt = { x: number; y: number }

export interface EditV4CanvasHandle {
  exportMaskBlob(): Promise<Blob | null>
  hasSelection(): boolean
  coverage(): number
  clearSelection(): void
  selectAll(): void
  invert(): void
  expand(px: number): void
  contract(px: number): void
  smooth(px: number): void
  fillHoles(): void
  cleanIslands(): void
  /** Carrega uma máscara pronta (o retorno de "Colar na borda"). */
  loadMask(url: string): Promise<boolean>
  undo(): void
  redo(): void
  fit(): void
  setZoom(z: number): void
  /** A imagem pôde ser lida pixel a pixel? Falso = varinha indisponível (CORS). */
  canSample(): boolean
}

interface Props {
  imageUrl: string
  tool: EditV4Tool
  /** Tamanho do pincel, em px de TELA (não da imagem). */
  brushSize: number
  wand: WandOptions
  onSelectionChange?: (info: { coverage: number; canUndo: boolean; canRedo: boolean }) => void
  onZoomChange?: (zoom: number) => void
  onSampleUnavailable?: () => void
  disabled?: boolean
}

export const EditV4Canvas = forwardRef<EditV4CanvasHandle, Props>(function EditV4Canvas(
  { imageUrl, tool, brushSize, wand, onSelectionChange, onZoomChange, onSampleUnavailable, disabled },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const dimsRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const colorRef = useRef<ColorIndex | null>(null)
  const maskRef = useRef<Uint8Array | null>(null)

  // Canvas fora de tela com o véu da seleção, na resolução da imagem. É ele que
  // o desenho principal escala — repintar o véu inteiro por frame seria caro.
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const scratchRef = useRef<HTMLCanvasElement | null>(null)
  const antsRef = useRef<Path2D | null>(null)
  const contoursRef = useRef<ContourPath[]>([])

  const undoRef = useRef<Int32Array[]>([])
  const redoRef = useRef<Int32Array[]>([])

  const zoomRef = useRef(1)
  const panRef = useRef<Pt>({ x: 0, y: 0 })
  const dashRef = useRef(0)
  const rafRef = useRef(0)

  const dragRef = useRef<
    | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
    | { kind: 'stroke'; points: Pt[]; op: SelectionOp }
    | { kind: 'lasso'; points: Pt[]; op: SelectionOp }
    | { kind: 'rect'; from: Pt; to: Pt; op: SelectionOp }
    | null
  >(null)
  const polyRef = useRef<{ points: Pt[]; op: SelectionOp } | null>(null)
  const cursorRef = useRef<Pt | null>(null)
  const spaceRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [, tick] = useState(0)
  const bump = useCallback(() => tick(n => n + 1), [])

  // Os callbacks do pai vivem num ref, e não nas dependências dos hooks.
  //
  // Sem isto, um pai que passe `onSelectionChange={info => …}` (que é como
  // qualquer um escreve) muda a identidade da função a cada render; a
  // identidade sobe pela cadeia notify → commit → efeito de carregamento, o
  // efeito roda de novo e `maskRef.current = new Uint8Array(...)` APAGA a
  // seleção. Na prática: digitar uma letra na instrução limpava a marcação que
  // o usuário acabou de fazer.
  const cbRef = useRef({ onSelectionChange, onZoomChange, onSampleUnavailable })
  cbRef.current = { onSelectionChange, onZoomChange, onSampleUnavailable }

  // ── Projeção imagem ↔ tela ────────────────────────────────────────────────
  const viewport = useCallback(() => {
    const el = containerRef.current
    const { w, h } = dimsRef.current
    if (!el || !w || !h) return { scale: 1, offsetX: 0, offsetY: 0, cw: 0, ch: 0 }
    const cw = el.clientWidth
    const ch = el.clientHeight
    const base = Math.min(cw / w, ch / h)
    const scale = base * zoomRef.current
    const offsetX = (cw - w * scale) / 2 + panRef.current.x
    const offsetY = (ch - h * scale) / 2 + panRef.current.y
    return { scale, offsetX, offsetY, cw, ch }
  }, [])

  const toImage = useCallback(
    (clientX: number, clientY: number): Pt => {
      const el = containerRef.current
      if (!el) return { x: 0, y: 0 }
      const rect = el.getBoundingClientRect()
      const { scale, offsetX, offsetY } = viewport()
      return {
        x: (clientX - rect.left - offsetX) / scale,
        y: (clientY - rect.top - offsetY) / scale,
      }
    },
    [viewport],
  )

  // ── Notificação de estado ─────────────────────────────────────────────────
  const notify = useCallback(() => {
    const mask = maskRef.current
    cbRef.current.onSelectionChange?.({
      coverage: mask ? selectionCoverage(mask) : 0,
      canUndo: undoRef.current.length > 0,
      canRedo: redoRef.current.length > 0,
    })
  }, [])

  // ── Véu + contornos ───────────────────────────────────────────────────────
  const refreshSelectionVisuals = useCallback(() => {
    const mask = maskRef.current
    const { w, h } = dimsRef.current
    const overlay = overlayRef.current
    if (!mask || !overlay || !w || !h) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    // createImageData + set em vez de `new ImageData(array, …)`: o construtor
    // exige um Uint8ClampedArray sobre ArrayBuffer nomeado, e o array genérico
    // que nossas funções puras devolvem não casa com esse tipo.
    const veil = ctx.createImageData(w, h)
    veil.data.set(maskToOverlayRgba(mask, OVERLAY_RGB, OVERLAY_ALPHA))
    ctx.putImageData(veil, 0, 0)
    contoursRef.current = traceMaskContours(mask, w, h)
    antsRef.current = contoursToPath2D(contoursRef.current, (x, y) => ({ x, y }))
  }, [])

  /** Empilha o estado atual no undo. Chamar ANTES de mudar a máscara. */
  const snapshot = useCallback(() => {
    const mask = maskRef.current
    if (!mask) return
    undoRef.current.push(rleEncode(mask))
    if (undoRef.current.length > HISTORY_LIMIT) undoRef.current.shift()
    redoRef.current = []
  }, [])

  const commit = useCallback(() => {
    refreshSelectionVisuals()
    notify()
    bump()
  }, [bump, notify, refreshSelectionVisuals])

  // ── Carregamento da imagem ────────────────────────────────────────────────
  useEffect(() => {
    setReady(false)
    maskRef.current = null
    colorRef.current = null
    antsRef.current = null
    contoursRef.current = []
    undoRef.current = []
    redoRef.current = []
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }

    const img = new Image()
    // Sem isto o canvas fica "contaminado" e getImageData lança — e a varinha,
    // que depende de ler os pixels, deixa de existir.
    img.crossOrigin = 'anonymous'
    let cancelled = false
    img.onload = () => {
      if (cancelled) return
      const w = img.naturalWidth
      const h = img.naturalHeight
      imgRef.current = img
      dimsRef.current = { w, h }
      maskRef.current = new Uint8Array(w * h)

      const overlay = document.createElement('canvas')
      overlay.width = w
      overlay.height = h
      overlayRef.current = overlay

      const scratch = document.createElement('canvas')
      scratch.width = w
      scratch.height = h
      scratchRef.current = scratch

      // Índice de cor: uma leitura de pixels, uma vez.
      try {
        const read = document.createElement('canvas')
        read.width = w
        read.height = h
        const rctx = read.getContext('2d', { willReadFrequently: true })
        if (rctx) {
          rctx.drawImage(img, 0, 0)
          const data = rctx.getImageData(0, 0, w, h).data
          colorRef.current = buildColorIndex(data, w, h)
        }
      } catch {
        // Imagem de origem sem CORS: tudo continua funcionando, menos a varinha.
        colorRef.current = null
        cbRef.current.onSampleUnavailable?.()
      }

      setReady(true)
      notify()
      bump()
    }
    img.onerror = () => {
      if (!cancelled) setReady(false)
    }
    img.src = imageUrl
    return () => {
      cancelled = true
    }
    // Só a URL. `bump` e `notify` são estáveis; os callbacks do pai entram
    // pelo cbRef justamente para não reentrarem aqui (ver o comentário do ref).
  }, [imageUrl, bump, notify])

  // ── Desenho ───────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const el = containerRef.current
    const img = imgRef.current
    if (!canvas || !el || !img) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const cw = el.clientWidth
    const ch = el.clientHeight
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(ch * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch)

    const { scale, offsetX, offsetY } = viewport()
    ctx.imageSmoothingEnabled = scale < 1
    ctx.save()
    ctx.translate(offsetX, offsetY)
    ctx.scale(scale, scale)

    ctx.drawImage(img, 0, 0)
    const overlay = overlayRef.current
    if (overlay) ctx.drawImage(overlay, 0, 0)

    // Gesto em andamento: vetorial, direto na tela, sem tocar no raster.
    const drag = dragRef.current
    const poly = polyRef.current
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (drag?.kind === 'stroke') {
      ctx.strokeStyle = drag.op === 'subtract' ? 'rgba(255,90,90,0.85)' : 'rgba(45,212,191,0.85)'
      ctx.lineWidth = brushSize / scale
      ctx.beginPath()
      drag.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      if (drag.points.length === 1) {
        ctx.arc(drag.points[0].x, drag.points[0].y, brushSize / scale / 2, 0, Math.PI * 2)
        ctx.fillStyle = ctx.strokeStyle
        ctx.fill()
      } else {
        ctx.stroke()
      }
    } else if (drag?.kind === 'lasso' && drag.points.length > 1) {
      ctx.strokeStyle = 'rgba(45,212,191,0.95)'
      ctx.lineWidth = 1 / scale
      ctx.beginPath()
      drag.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      ctx.stroke()
    } else if (drag?.kind === 'rect') {
      ctx.strokeStyle = 'rgba(45,212,191,0.95)'
      ctx.lineWidth = 1 / scale
      ctx.strokeRect(
        Math.min(drag.from.x, drag.to.x),
        Math.min(drag.from.y, drag.to.y),
        Math.abs(drag.to.x - drag.from.x),
        Math.abs(drag.to.y - drag.from.y),
      )
    }
    if (poly && poly.points.length > 0) {
      ctx.strokeStyle = 'rgba(45,212,191,0.95)'
      ctx.lineWidth = 1 / scale
      ctx.beginPath()
      poly.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      const c = cursorRef.current
      if (c) ctx.lineTo(c.x, c.y)
      ctx.stroke()
      const first = poly.points[0]
      ctx.fillStyle = 'rgba(45,212,191,1)'
      ctx.beginPath()
      ctx.arc(first.x, first.y, 4 / scale, 0, Math.PI * 2)
      ctx.fill()
    }

    // Marching ants: caminho já pronto em coordenadas de imagem; só a fase muda.
    const ants = antsRef.current
    if (ants) {
      ctx.lineWidth = 1 / scale
      ctx.setLineDash([5 / scale, 4 / scale])
      ctx.lineDashOffset = -dashRef.current / scale
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.stroke(ants)
      ctx.setLineDash([])
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 0.6 / scale
      ctx.stroke(ants)
    }
    ctx.restore()

    // Cursor do pincel: círculo do tamanho real, em px de tela.
    const cur = cursorRef.current
    if (cur && (tool === 'brush' || tool === 'eraser') && !disabled) {
      const p = { x: cur.x * scale + offsetX, y: cur.y * scale + offsetY }
      ctx.beginPath()
      ctx.arc(p.x, p.y, brushSize / 2, 0, Math.PI * 2)
      ctx.strokeStyle = tool === 'eraser' ? 'rgba(255,120,120,0.9)' : 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, brushSize / 2 + 1, 0, Math.PI * 2)
      ctx.stroke()
    }
  }, [brushSize, disabled, tool, viewport])

  // Loop de animação: só corre quando há tracejado para animar.
  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      if (antsRef.current) dashRef.current = (dashRef.current + 0.35) % 9
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [draw])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(el)
    return () => ro.disconnect()
  }, [draw])

  // ── Rasterização de um gesto no raster da seleção ─────────────────────────
  //
  // Só na bounding box do gesto: um traço de pincel no canto de uma imagem de
  // 8 MP toca alguns milhares de pixels, não oito milhões.
  const rasterize = useCallback(
    (paint: (ctx: CanvasRenderingContext2D) => void, bbox: { x0: number; y0: number; x1: number; y1: number }, op: SelectionOp) => {
      const scratch = scratchRef.current
      const mask = maskRef.current
      const { w, h } = dimsRef.current
      if (!scratch || !mask || !w || !h) return
      const x0 = Math.max(0, Math.floor(bbox.x0))
      const y0 = Math.max(0, Math.floor(bbox.y0))
      const x1 = Math.min(w, Math.ceil(bbox.x1))
      const y1 = Math.min(h, Math.ceil(bbox.y1))
      const bw = x1 - x0
      const bh = y1 - y0
      if (bw <= 0 || bh <= 0) return

      const ctx = scratch.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(x0, y0, bw, bh)
      ctx.save()
      paint(ctx)
      ctx.restore()

      const data = ctx.getImageData(x0, y0, bw, bh).data
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          if (data[(y * bw + x) * 4 + 3] <= 127) continue
          const i = (y0 + y) * w + (x0 + x)
          if (op === 'subtract') mask[i] = 0
          else mask[i] = 255
        }
      }
    },
    [],
  )

  const opFromEvent = useCallback(
    (e: { shiftKey: boolean; altKey: boolean }, fallback: SelectionOp): SelectionOp =>
      e.shiftKey ? 'add' : e.altKey ? 'subtract' : fallback,
    [],
  )

  // ── Aplicação da varinha ──────────────────────────────────────────────────
  const runWand = useCallback(
    (p: Pt, op: SelectionOp) => {
      const index = colorRef.current
      const mask = maskRef.current
      if (!index || !mask) return
      snapshot()
      const patch = magicWandSelect(index, p.x, p.y, wand)
      applySelectionOp(mask, patch, op)
      commit()
    },
    [commit, snapshot, wand],
  )

  const closePolygon = useCallback(() => {
    const poly = polyRef.current
    const mask = maskRef.current
    if (!poly || poly.points.length < 3 || !mask) {
      polyRef.current = null
      bump()
      return
    }
    const pts = poly.points
    snapshot()
    if (poly.op === 'replace') mask.fill(0)
    const xs = pts.map(q => q.x)
    const ys = pts.map(q => q.y)
    rasterize(
      ctx => {
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        pts.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)))
        ctx.closePath()
        ctx.fill()
      },
      { x0: Math.min(...xs) - 1, y0: Math.min(...ys) - 1, x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1 },
      poly.op,
    )
    polyRef.current = null
    commit()
  }, [bump, commit, rasterize, snapshot])

  // ── Ponteiro ──────────────────────────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !ready) return
      const el = containerRef.current
      try {
        el?.setPointerCapture(e.pointerId)
      } catch {
        // Ponteiro já solto (ou sintético): a captura é conveniência, não
        // requisito — sem ela o gesto ainda funciona dentro do elemento.
      }
      const p = toImage(e.clientX, e.clientY)
      cursorRef.current = p

      // Espaço ou botão do meio: mover, venha de qual ferramenta vier.
      if (tool === 'pan' || spaceRef.current || e.button === 1) {
        dragRef.current = {
          kind: 'pan',
          startX: e.clientX,
          startY: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        }
        return
      }

      switch (tool) {
        case 'wand':
          runWand(p, opFromEvent(e, 'replace'))
          break
        case 'brush':
          snapshot()
          dragRef.current = { kind: 'stroke', points: [p], op: e.altKey ? 'subtract' : 'add' }
          break
        case 'eraser':
          snapshot()
          dragRef.current = { kind: 'stroke', points: [p], op: 'subtract' }
          break
        case 'lasso':
          dragRef.current = { kind: 'lasso', points: [p], op: opFromEvent(e, 'replace') }
          break
        case 'rect':
          dragRef.current = { kind: 'rect', from: p, to: p, op: opFromEvent(e, 'replace') }
          break
        case 'polygon': {
          const { scale } = viewport()
          const poly = polyRef.current
          if (poly && poly.points.length >= 3) {
            const first = poly.points[0]
            const dist = Math.hypot((p.x - first.x) * scale, (p.y - first.y) * scale)
            if (dist <= CLOSE_THRESHOLD_PX) {
              closePolygon()
              return
            }
          }
          if (poly) poly.points.push(p)
          else polyRef.current = { points: [p], op: opFromEvent(e, 'replace') }
          bump()
          break
        }
      }
    },
    [bump, closePolygon, disabled, opFromEvent, ready, runWand, snapshot, tool, toImage, viewport],
  )


  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!ready) return
      const p = toImage(e.clientX, e.clientY)
      cursorRef.current = p
      const drag = dragRef.current
      if (!drag) return
      if (drag.kind === 'pan') {
        panRef.current = {
          x: drag.panX + (e.clientX - drag.startX),
          y: drag.panY + (e.clientY - drag.startY),
        }
      } else if (drag.kind === 'stroke' || drag.kind === 'lasso') {
        drag.points.push(p)
      } else if (drag.kind === 'rect') {
        drag.to = p
      }
    },
    [ready, toImage],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      try {
        containerRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        // idem setPointerCapture.
      }
      const drag = dragRef.current
      dragRef.current = null
      const mask = maskRef.current
      if (!drag || !mask) return

      if (drag.kind === 'pan') {
        bump()
        return
      }
      const { scale } = viewport()

      if (drag.kind === 'stroke') {
        const radius = brushSize / scale / 2
        const xs = drag.points.map(q => q.x)
        const ys = drag.points.map(q => q.y)
        rasterize(
          ctx => {
            ctx.strokeStyle = '#fff'
            ctx.fillStyle = '#fff'
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.lineWidth = radius * 2
            if (drag.points.length === 1) {
              ctx.beginPath()
              ctx.arc(drag.points[0].x, drag.points[0].y, radius, 0, Math.PI * 2)
              ctx.fill()
            } else {
              ctx.beginPath()
              drag.points.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)))
              ctx.stroke()
            }
          },
          {
            x0: Math.min(...xs) - radius - 2,
            y0: Math.min(...ys) - radius - 2,
            x1: Math.max(...xs) + radius + 2,
            y1: Math.max(...ys) + radius + 2,
          },
          drag.op,
        )
        commit()
        return
      }

      if (drag.kind === 'lasso') {
        if (drag.points.length < 3) {
          bump()
          return
        }
        snapshot()
        if (drag.op === 'replace') mask.fill(0)
        const xs = drag.points.map(q => q.x)
        const ys = drag.points.map(q => q.y)
        rasterize(
          ctx => {
            ctx.fillStyle = '#fff'
            ctx.beginPath()
            drag.points.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)))
            ctx.closePath()
            ctx.fill()
          },
          { x0: Math.min(...xs) - 1, y0: Math.min(...ys) - 1, x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1 },
          drag.op,
        )
        commit()
        return
      }

      if (drag.kind === 'rect') {
        const x0 = Math.min(drag.from.x, drag.to.x)
        const y0 = Math.min(drag.from.y, drag.to.y)
        const x1 = Math.max(drag.from.x, drag.to.x)
        const y1 = Math.max(drag.from.y, drag.to.y)
        if (x1 - x0 < 1 || y1 - y0 < 1) {
          bump()
          return
        }
        snapshot()
        if (drag.op === 'replace') mask.fill(0)
        rasterize(
          ctx => {
            ctx.fillStyle = '#fff'
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
          },
          { x0, y0, x1, y1 },
          drag.op,
        )
        commit()
      }
    },
    [brushSize, bump, commit, rasterize, snapshot, viewport],
  )

  // Zoom pela roda, ancorado no ponteiro (o pixel sob o cursor não sai do lugar).
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!ready) return
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const before = toImage(e.clientX, e.clientY)
      const factor = Math.exp(-e.deltaY * 0.0015)
      zoomRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * factor))
      const { scale, offsetX, offsetY } = viewport()
      const screenX = before.x * scale + offsetX
      const screenY = before.y * scale + offsetY
      panRef.current = {
        x: panRef.current.x + (e.clientX - rect.left - screenX),
        y: panRef.current.y + (e.clientY - rect.top - screenY),
      }
      cbRef.current.onZoomChange?.(zoomRef.current)
      bump()
    },
    [bump, ready, toImage, viewport],
  )

  // Espaço segura o "mover" temporário, como em qualquer editor.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = true
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // ── Handle imperativo ─────────────────────────────────────────────────────
  const applyMorph = useCallback(
    (fn: (m: Uint8Array, w: number, h: number) => Uint8Array) => {
      const mask = maskRef.current
      const { w, h } = dimsRef.current
      if (!mask || !w || !h) return
      snapshot()
      maskRef.current = fn(mask, w, h)
      commit()
    },
    [commit, snapshot],
  )

  useImperativeHandle(
    ref,
    (): EditV4CanvasHandle => ({
      canSample: () => colorRef.current !== null,
      hasSelection: () => (maskRef.current ? hasAnySelection(maskRef.current) : false),
      coverage: () => (maskRef.current ? selectionCoverage(maskRef.current) : 0),
      clearSelection: () => {
        const mask = maskRef.current
        if (!mask) return
        snapshot()
        mask.fill(0)
        polyRef.current = null
        commit()
      },
      selectAll: () => {
        const mask = maskRef.current
        if (!mask) return
        snapshot()
        mask.fill(255)
        commit()
      },
      invert: () => {
        const mask = maskRef.current
        if (!mask) return
        snapshot()
        invertSelection(mask)
        commit()
      },
      expand: px => applyMorph((m, w, h) => expandSelection(m, w, h, px)),
      contract: px => applyMorph((m, w, h) => contractSelection(m, w, h, px)),
      smooth: px => applyMorph((m, w, h) => smoothSelection(m, w, h, px)),
      fillHoles: () => applyMorph((m, w, h) => fillSelectionHoles(m, w, h)),
      cleanIslands: () =>
        applyMorph((m, w, h) => removeSmallIslands(m, w, h, Math.max(24, Math.round(w * h * 0.00002)))),
      undo: () => {
        const prev = undoRef.current.pop()
        const mask = maskRef.current
        if (!prev || !mask) return
        redoRef.current.push(rleEncode(mask))
        maskRef.current = rleDecode(prev, mask.length)
        commit()
      },
      redo: () => {
        const next = redoRef.current.pop()
        const mask = maskRef.current
        if (!next || !mask) return
        undoRef.current.push(rleEncode(mask))
        maskRef.current = rleDecode(next, mask.length)
        commit()
      },
      fit: () => {
        zoomRef.current = 1
        panRef.current = { x: 0, y: 0 }
        cbRef.current.onZoomChange?.(1)
        bump()
      },
      setZoom: z => {
        zoomRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
        cbRef.current.onZoomChange?.(zoomRef.current)
        bump()
      },
      loadMask: async (url: string) => {
        const { w, h } = dimsRef.current
        const mask = maskRef.current
        if (!mask || !w || !h) return false
        return new Promise<boolean>(resolve => {
          const im = new Image()
          im.crossOrigin = 'anonymous'
          im.onload = () => {
            try {
              const c = document.createElement('canvas')
              c.width = w
              c.height = h
              const cx = c.getContext('2d', { willReadFrequently: true })
              if (!cx) return resolve(false)
              cx.drawImage(im, 0, 0, w, h)
              snapshot()
              maskRef.current = rgbaToMask(cx.getImageData(0, 0, w, h).data, w * h)
              commit()
              resolve(true)
            } catch {
              resolve(false)
            }
          }
          im.onerror = () => resolve(false)
          im.src = url
        })
      },
      exportMaskBlob: async () => {
        const mask = maskRef.current
        const { w, h } = dimsRef.current
        if (!mask || !w || !h || !hasAnySelection(mask)) return null
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const cx = c.getContext('2d')
        if (!cx) return null
        const out = cx.createImageData(w, h)
        out.data.set(maskToGrayscaleRgba(mask))
        cx.putImageData(out, 0, 0)
        return new Promise<Blob | null>(resolve => c.toBlob(b => resolve(b), 'image/png'))
      },
    }),
    [applyMorph, bump, commit, snapshot],
  )

  const cursor =
    disabled ? 'not-allowed'
    : tool === 'pan' || spaceRef.current ? 'grab'
    : tool === 'brush' || tool === 'eraser' ? 'none'
    : 'crosshair'

  const polyReady = (polyRef.current?.points.length ?? 0) >= 3

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        cursorRef.current = null
      }}
      onWheel={onWheel}
      onDoubleClick={() => {
        if (tool === 'polygon' && polyReady) closePolygon()
      }}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        touchAction: 'none',
        cursor,
        // Sólido de propósito: vidro por cima de um canvas que repinta em rAF é
        // o caso que o contrato de design proíbe (docs/VIDRO-NO-APP.md, item 6).
        background: 'var(--color-bg-elevated)',
        borderRadius: 'var(--r-card)',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {polyReady && (
        <button
          type="button"
          onClick={closePolygon}
          className="spn-glass spn-glass--raised"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 14,
            transform: 'translateX(-50%)',
            padding: '7px 14px',
            borderRadius: 999,
            fontSize: 12.5,
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          Fechar área
        </button>
      )}
      {!ready && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--color-text-tertiary)',
            fontSize: 13,
          }}
        >
          Carregando imagem…
        </div>
      )}
    </div>
  )
})
