'use client'

// EditV2Canvas — canvas de seleção do Editar v2.
//
// Diferenças estruturais vs o canvas v1 (RetocarCanvas):
//   - Formas guardadas em coordenadas NORMALIZADAS da imagem (0–1) com tamanho
//     em pixels da imagem — redimensionar a janela nunca desloca a seleção
//     (bug P1 do v1, eliminado por construção).
//   - Zoom (scroll) + mover (ferramenta pan ou arrastar com botão do meio).
//   - Exportação re-renderiza as formas na resolução NATURAL da imagem
//     (PNG preto/branco: branco = editar).
//
// Ferramentas: laço, polígono, pincel, borracha, mover. Laço/polígono são
// PREENCHIDOS (contorno de superfície); pincel/borracha são TRAÇOS (linha).
// Borracha subtrai de qualquer forma (destination-out). Um único helper
// (paintShapes) pinta os 3 caminhos — tela, export e cobertura — de forma
// idêntica por construção, então o que aparece é exatamente o que é editado.
//
// As ferramentas são opt-in via prop `tools` (default = pincel/borracha/mover,
// igual ao comportamento original — o laboratório segue intocado). undo/redo
// são opt-in via `enableUndo`.
//
// O componente não conhece API nem custo — só pintura. Norte: precisão.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

type Tool = 'lasso' | 'polygon' | 'brush' | 'eraser' | 'pan'

type Pt = { x: number; y: number }

interface Shape {
  /** 'stroke' = linha (pincel/borracha); 'poly' = preenchido (laço/polígono). */
  kind: 'stroke' | 'poly'
  /** Pontos em coordenadas normalizadas da imagem (0–1). */
  points: Pt[]
  /** Diâmetro do traço em PIXELS DA IMAGEM (só 'stroke'; ignorado em 'poly'). */
  sizeImagePx: number
  /** 'add' = adiciona à seleção; 'subtract' = remove (borracha). */
  mode: 'add' | 'subtract'
}

/** Pinta uma lista de formas (branco) num contexto 2D. `toPx` mapeia coords
 *  normalizadas (0–1) → pixels do contexto; `lineScale` converte sizeImagePx
 *  → largura de linha no mesmo espaço. Mantém os 3 caminhos (tela / export /
 *  cobertura) idênticos — a seleção exibida é a seleção exportada. */
function paintShapes(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  toPx: (x: number, y: number) => Pt,
  lineScale: number,
): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of shapes) {
    ctx.globalCompositeOperation = s.mode === 'subtract' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = '#ffffff'
    ctx.fillStyle = '#ffffff'
    if (s.kind === 'poly') {
      if (s.points.length < 3) continue
      ctx.beginPath()
      s.points.forEach((p, i) => {
        const q = toPx(p.x, p.y)
        if (i === 0) ctx.moveTo(q.x, q.y)
        else ctx.lineTo(q.x, q.y)
      })
      ctx.closePath()
      ctx.fill()
    } else {
      const w = s.sizeImagePx * lineScale
      ctx.lineWidth = w
      if (s.points.length === 1) {
        const q = toPx(s.points[0].x, s.points[0].y)
        ctx.beginPath()
        ctx.arc(q.x, q.y, w / 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.beginPath()
        s.points.forEach((p, i) => {
          const q = toPx(p.x, p.y)
          if (i === 0) ctx.moveTo(q.x, q.y)
          else ctx.lineTo(q.x, q.y)
        })
        ctx.stroke()
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over'
}

export interface EditV2CanvasHandle {
  /** Máscara FINAL: camada de superfície (se houver) + formas − borracha. */
  exportMaskBlob(): Promise<Blob | null>
  /** Só as formas do usuário (semente para a detecção de superfície). */
  exportStrokesBlob(): Promise<Blob | null>
  /** Remove só as formas, preservando a camada de superfície. */
  clearStrokes(): void
  clearSelection(): void
  hasSelection(): boolean
  undo(): void
  redo(): void
}

interface Props {
  imageUrl: string
  /** Máscara de SUPERFÍCIE detectada (PNG P&B no Storage) — vira camada-base
   *  da seleção; o pincel ADICIONA por cima e a borracha SUBTRAI dela. */
  baseMaskUrl?: string | null
  /** Quais ferramentas exibir na toolbar (e habilitar). Default = pincel/
   *  borracha/mover (comportamento original do laboratório). O Editar Clean
   *  passa o conjunto completo com laço/polígono. */
  tools?: Tool[]
  /** Mostra os botões Desfazer/Refazer + atalhos de teclado. */
  enableUndo?: boolean
  /** Chamado ao fim de cada forma com a fração 0–1 coberta pela seleção. */
  onCoverageChange?: (coverage: number) => void
  /** Chamado quando o usuário usa "Limpar seleção" (o dono da camada-base
   *  precisa descartá-la também). */
  onClearedBase?: () => void
  disabled?: boolean
}

const MIN_ZOOM = 1
const MAX_ZOOM = 6
const BRUSH_MIN = 8
const BRUSH_MAX = 120
const CLOSE_THRESHOLD_PX = 14 // distância (px de tela) p/ fechar o polígono no 1º vértice

const DEFAULT_TOOLS: Tool[] = ['brush', 'eraser', 'pan']

const TOOL_LABEL: Record<Tool, string> = {
  lasso: 'Laço',
  polygon: 'Polígono',
  brush: 'Pincel',
  eraser: 'Borracha',
  pan: 'Mover',
}

export const EditV2Canvas = forwardRef<EditV2CanvasHandle, Props>(
  function EditV2Canvas(
    { imageUrl, baseMaskUrl, tools, enableUndo, onCoverageChange, onClearedBase, disabled },
    ref,
  ) {
    const toolList = tools && tools.length > 0 ? tools : DEFAULT_TOOLS
    const containerRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const imgRef = useRef<HTMLImageElement | null>(null)
    /** Camada de superfície como BRANCO-sobre-transparente (offscreen). */
    const baseLayerRef = useRef<HTMLCanvasElement | null>(null)
    /** Formas confirmadas (pincel/borracha/laço/polígono fechado). */
    const shapesRef = useRef<Shape[]>([])
    /** Forma em traçado contínuo (pincel/borracha/laço enquanto o ponteiro desce). */
    const activeShapeRef = useRef<Shape | null>(null)
    /** Polígono em construção por cliques (vértices acumulados até fechar). */
    const polyRef = useRef<{ points: Pt[]; mode: 'add' } | null>(null)
    /** Pilha de refazer (formas desfeitas). */
    const undoneRef = useRef<Shape[]>([])
    const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
    const cursorRef = useRef<{ x: number; y: number } | null>(null)
    const rafRef = useRef<number>(0)
    const scheduleRedrawRef = useRef<(() => void) | null>(null)

    const [tool, setTool] = useState<Tool>(toolList[0])
    const [brushSize, setBrushSize] = useState(36) // px de TELA (convertido ao pintar)
    const [zoom, setZoom] = useState(1)
    const panRef = useRef({ x: 0, y: 0 })
    const [imageReady, setImageReady] = useState(false)
    const [, forceTick] = useState(0)
    const bump = useCallback(() => forceTick(n => n + 1), [])

    const isStrokeTool = tool === 'brush' || tool === 'eraser'

    // ── Carregamento da imagem ────────────────────────────────────────────────
    useEffect(() => {
      setImageReady(false)
      shapesRef.current = []
      activeShapeRef.current = null
      polyRef.current = null
      undoneRef.current = []
      panRef.current = { x: 0, y: 0 }
      setZoom(1)
      // Sem crossOrigin: nunca lemos pixels da IMAGEM (cobertura/export usam só
      // as formas), e exigir CORS quebraria o load de fontes como o CDN da FAL.
      const img = new Image()
      img.onload = () => {
        imgRef.current = img
        setImageReady(true)
      }
      img.src = imageUrl
      return () => {
        imgRef.current = null
      }
    }, [imageUrl])

    // ── Camada de superfície (máscara P&B → branco-sobre-transparente) ───────
    useEffect(() => {
      baseLayerRef.current = null
      if (!baseMaskUrl) {
        scheduleRedrawRef.current?.()
        return
      }
      let cancelled = false
      const img = new Image()
      // Saída do /detect-surface mora no Storage do Supabase (CORS liberado) — o
      // getImageData da conversão exige crossOrigin.
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (cancelled) return
        try {
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          const ctx = c.getContext('2d')
          if (!ctx) return
          ctx.drawImage(img, 0, 0)
          const id = ctx.getImageData(0, 0, c.width, c.height)
          const d = id.data
          for (let i = 0; i < d.length; i += 4) {
            const lum = d[i] // máscara é P&B: r ≈ luminância
            d[i] = 255
            d[i + 1] = 255
            d[i + 2] = 255
            d[i + 3] = lum > 110 ? 255 : 0
          }
          ctx.putImageData(id, 0, 0)
          baseLayerRef.current = c
        } catch {
          // CORS/taint inesperado: degrada para formas literais, sem quebrar.
          baseLayerRef.current = null
          console.warn('[EditV2Canvas] camada de superfície indisponível (CORS)')
        }
        scheduleRedrawRef.current?.()
      }
      img.onerror = () => {
        baseLayerRef.current = null
      }
      img.src = baseMaskUrl
      return () => {
        cancelled = true
      }
    }, [baseMaskUrl])

    // ── Geometria: fit + zoom + pan ───────────────────────────────────────────
    const getTransform = useCallback(() => {
      const canvas = canvasRef.current
      const img = imgRef.current
      if (!canvas || !img) return null
      const cw = canvas.width
      const ch = canvas.height
      const fit = Math.min(cw / img.naturalWidth, ch / img.naturalHeight)
      const scale = fit * zoom
      const drawW = img.naturalWidth * scale
      const drawH = img.naturalHeight * scale
      const baseX = (cw - drawW) / 2
      const baseY = (ch - drawH) / 2
      return { scale, offsetX: baseX + panRef.current.x, offsetY: baseY + panRef.current.y }
    }, [zoom])

    const toImageCoords = useCallback(
      (clientX: number, clientY: number) => {
        const canvas = canvasRef.current
        const img = imgRef.current
        const t = getTransform()
        if (!canvas || !img || !t) return null
        const rect = canvas.getBoundingClientRect()
        const px = (clientX - rect.left) * (canvas.width / rect.width)
        const py = (clientY - rect.top) * (canvas.height / rect.height)
        return {
          x: (px - t.offsetX) / t.scale / img.naturalWidth,
          y: (py - t.offsetY) / t.scale / img.naturalHeight,
        }
      },
      [getTransform],
    )

    /** Coords em pixels do BITMAP (mesma base que cursorRef). */
    const toDeviceCoords = useCallback((clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height),
      }
    }, [])

    // ── Render ────────────────────────────────────────────────────────────────
    const redraw = useCallback(() => {
      const canvas = canvasRef.current
      const img = imgRef.current
      const t = getTransform()
      if (!canvas || !img || !t) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(
        img,
        t.offsetX,
        t.offsetY,
        img.naturalWidth * t.scale,
        img.naturalHeight * t.scale,
      )

      const toDisplay = (x: number, y: number): Pt => ({
        x: t.offsetX + x * img.naturalWidth * t.scale,
        y: t.offsetY + y * img.naturalHeight * t.scale,
      })

      // Camada de seleção: superfície detectada (se houver) + replay das formas
      // em canvas temporário (na escala de exibição) → tinge de verde → compõe.
      const all = activeShapeRef.current
        ? [...shapesRef.current, activeShapeRef.current]
        : shapesRef.current
      const base = baseLayerRef.current
      if (all.length > 0 || base) {
        const layer = document.createElement('canvas')
        layer.width = canvas.width
        layer.height = canvas.height
        const lctx = layer.getContext('2d')
        if (lctx) {
          if (base) {
            lctx.drawImage(
              base,
              t.offsetX,
              t.offsetY,
              img.naturalWidth * t.scale,
              img.naturalHeight * t.scale,
            )
          }
          paintShapes(lctx, all, toDisplay, t.scale)
          // tinge: mantém só onde há seleção
          lctx.globalCompositeOperation = 'source-in'
          lctx.fillStyle = '#30d158'
          lctx.fillRect(0, 0, layer.width, layer.height)
          ctx.globalAlpha = 0.42
          ctx.drawImage(layer, 0, 0)
          ctx.globalAlpha = 1
        }
      }

      // Polígono em construção: guia de linha + vértices + preview até o cursor.
      const poly = polyRef.current
      if (poly && poly.points.length > 0) {
        ctx.save()
        ctx.strokeStyle = 'rgba(48,209,88,0.95)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 4])
        ctx.beginPath()
        poly.points.forEach((p, i) => {
          const q = toDisplay(p.x, p.y)
          if (i === 0) ctx.moveTo(q.x, q.y)
          else ctx.lineTo(q.x, q.y)
        })
        const cur = cursorRef.current
        if (cur) ctx.lineTo(cur.x, cur.y)
        ctx.stroke()
        ctx.setLineDash([])
        poly.points.forEach((p, i) => {
          const q = toDisplay(p.x, p.y)
          ctx.beginPath()
          ctx.arc(q.x, q.y, i === 0 ? 5 : 3.5, 0, Math.PI * 2)
          ctx.fillStyle = i === 0 ? '#30d158' : 'rgba(255,255,255,0.92)'
          ctx.fill()
        })
        ctx.restore()
      }

      // anel do pincel (só ferramentas de traço)
      const cur = cursorRef.current
      if (cur && isStrokeTool && !disabled) {
        ctx.beginPath()
        ctx.arc(cur.x, cur.y, brushSize / 2, 0, Math.PI * 2)
        ctx.strokeStyle = tool === 'eraser' ? 'rgba(255,255,255,0.9)' : 'rgba(48,209,88,0.95)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }, [brushSize, disabled, getTransform, isStrokeTool, tool])

    const scheduleRedraw = useCallback(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(redraw)
    }, [redraw])
    scheduleRedrawRef.current = scheduleRedraw

    // resize: só recalcula o bitmap — formas normalizadas não deslocam.
    useEffect(() => {
      const el = containerRef.current
      const canvas = canvasRef.current
      if (!el || !canvas) return
      const ro = new ResizeObserver(() => {
        const r = el.getBoundingClientRect()
        canvas.width = Math.max(1, Math.round(r.width * devicePixelRatio))
        canvas.height = Math.max(1, Math.round(r.height * devicePixelRatio))
        scheduleRedraw()
      })
      ro.observe(el)
      return () => ro.disconnect()
    }, [scheduleRedraw, imageReady])

    useEffect(scheduleRedraw, [scheduleRedraw, imageReady, zoom])

    // ── Zoom por scroll (centrado no cursor) ─────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const onWheel = (e: WheelEvent) => {
        if (!imgRef.current) return
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
        setZoom(prev => {
          const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor))
          if (next === prev) return prev
          const t = getTransform()
          const rect = canvas.getBoundingClientRect()
          if (t) {
            const px = (e.clientX - rect.left) * (canvas.width / rect.width)
            const py = (e.clientY - rect.top) * (canvas.height / rect.height)
            const k = next / prev
            panRef.current = {
              x: px - (px - panRef.current.x - (t.offsetX - panRef.current.x)) * k - (t.offsetX - panRef.current.x),
              y: py - (py - panRef.current.y - (t.offsetY - panRef.current.y)) * k - (t.offsetY - panRef.current.y),
            }
          }
          if (next === MIN_ZOOM) panRef.current = { x: 0, y: 0 }
          return next
        })
        scheduleRedraw()
      }
      canvas.addEventListener('wheel', onWheel, { passive: false })
      return () => canvas.removeEventListener('wheel', onWheel)
    }, [getTransform, scheduleRedraw])

    // ── Cobertura (raster pequeno: superfície + formas − borracha) ────────────
    const computeCoverage = useCallback(() => {
      const img = imgRef.current
      if (!img) return 0
      const base = baseLayerRef.current
      if (shapesRef.current.length === 0 && !base) return 0
      const W = 256
      const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W))
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const ctx = c.getContext('2d')
      if (!ctx) return 0
      if (base) ctx.drawImage(base, 0, 0, W, H)
      paintShapes(ctx, shapesRef.current, (x, y) => ({ x: x * W, y: y * H }), W / img.naturalWidth)
      const data = ctx.getImageData(0, 0, W, H).data
      let on = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] > 10) on++
      return on / (W * H)
    }, [])

    // ── Mutadores de seleção ──────────────────────────────────────────────────
    const commitShape = useCallback(
      (s: Shape) => {
        shapesRef.current.push(s)
        undoneRef.current = []
        bump()
        onCoverageChange?.(computeCoverage())
      },
      [bump, computeCoverage, onCoverageChange],
    )

    const closePolygon = useCallback(() => {
      const poly = polyRef.current
      if (poly && poly.points.length >= 3) {
        commitShape({ kind: 'poly', points: poly.points.slice(), sizeImagePx: 0, mode: poly.mode })
      }
      polyRef.current = null
      bump()
      scheduleRedraw()
    }, [bump, commitShape, scheduleRedraw])

    const cancelActive = useCallback(() => {
      polyRef.current = null
      activeShapeRef.current = null
      bump()
      scheduleRedraw()
    }, [bump, scheduleRedraw])

    const undo = useCallback(() => {
      if (polyRef.current && polyRef.current.points.length > 0) {
        polyRef.current.points.pop()
        if (polyRef.current.points.length === 0) polyRef.current = null
      } else if (shapesRef.current.length > 0) {
        undoneRef.current.push(shapesRef.current.pop() as Shape)
      } else {
        return
      }
      bump()
      onCoverageChange?.(computeCoverage())
      scheduleRedraw()
    }, [bump, computeCoverage, onCoverageChange, scheduleRedraw])

    const redo = useCallback(() => {
      if (undoneRef.current.length === 0) return
      shapesRef.current.push(undoneRef.current.pop() as Shape)
      bump()
      onCoverageChange?.(computeCoverage())
      scheduleRedraw()
    }, [bump, computeCoverage, onCoverageChange, scheduleRedraw])

    const clearAll = useCallback(() => {
      shapesRef.current = []
      activeShapeRef.current = null
      polyRef.current = null
      undoneRef.current = []
      baseLayerRef.current = null
      bump()
      onClearedBase?.()
      onCoverageChange?.(0)
      scheduleRedraw()
    }, [bump, onClearedBase, onCoverageChange, scheduleRedraw])

    /** Troca de ferramenta: ao sair do polígono, fecha se já é área válida;
     *  caso contrário descarta o que estava em construção. */
    const changeTool = useCallback(
      (next: Tool) => {
        if (tool === 'polygon' && next !== 'polygon') {
          if (polyRef.current && polyRef.current.points.length >= 3) closePolygon()
          else {
            polyRef.current = null
            bump()
          }
        }
        setTool(next)
        scheduleRedraw()
      },
      [bump, closePolygon, scheduleRedraw, tool],
    )

    // ── Atalhos de teclado ────────────────────────────────────────────────────
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (disabled) return
        const el = e.target as HTMLElement | null
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
        const meta = e.metaKey || e.ctrlKey
        if (enableUndo && meta && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault()
          if (e.shiftKey) redo()
          else undo()
          return
        }
        if (e.key === 'Enter' && tool === 'polygon') {
          e.preventDefault()
          closePolygon()
        } else if (e.key === 'Escape') {
          cancelActive()
        }
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [cancelActive, closePolygon, disabled, enableUndo, redo, tool, undo])

    // ── Ponteiro: pintar / contornar / pan ────────────────────────────────────
    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || !imageReady) return
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.setPointerCapture(e.pointerId)
      const isPan = tool === 'pan' || e.button === 1
      if (isPan) {
        panDragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        }
        return
      }
      const p = toImageCoords(e.clientX, e.clientY)
      if (!p) return

      if (tool === 'polygon') {
        const dev = toDeviceCoords(e.clientX, e.clientY)
        const t = getTransform()
        const img = imgRef.current
        const poly = polyRef.current
        // Clicar perto do 1º vértice (com ≥3 pontos) fecha a área.
        if (poly && poly.points.length >= 3 && dev && t && img) {
          const first = poly.points[0]
          const fx = t.offsetX + first.x * img.naturalWidth * t.scale
          const fy = t.offsetY + first.y * img.naturalHeight * t.scale
          const dpr = canvas.width / canvas.getBoundingClientRect().width
          if (Math.hypot(dev.x - fx, dev.y - fy) <= CLOSE_THRESHOLD_PX * dpr) {
            closePolygon()
            return
          }
        }
        if (poly) poly.points.push(p)
        else polyRef.current = { points: [p], mode: 'add' }
        bump()
        scheduleRedraw()
        return
      }

      if (tool === 'lasso') {
        activeShapeRef.current = { kind: 'poly', points: [p], sizeImagePx: 0, mode: 'add' }
      } else {
        const t = getTransform()
        if (!t) return
        const dpr = canvas.width / canvas.getBoundingClientRect().width
        activeShapeRef.current = {
          kind: 'stroke',
          points: [p],
          sizeImagePx: (brushSize * dpr) / t.scale,
          mode: tool === 'eraser' ? 'subtract' : 'add',
        }
      }
      scheduleRedraw()
    }

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const dev = toDeviceCoords(e.clientX, e.clientY)
      if (dev) cursorRef.current = dev
      if (panDragRef.current) {
        const canvas = canvasRef.current
        const d = panDragRef.current
        const dpr = canvas ? canvas.width / canvas.getBoundingClientRect().width : 1
        panRef.current = {
          x: d.panX + (e.clientX - d.startX) * dpr,
          y: d.panY + (e.clientY - d.startY) * dpr,
        }
      } else if (activeShapeRef.current) {
        const p = toImageCoords(e.clientX, e.clientY)
        if (p) activeShapeRef.current.points.push(p)
      }
      scheduleRedraw()
    }

    const endStroke = () => {
      panDragRef.current = null
      const s = activeShapeRef.current
      if (s) {
        activeShapeRef.current = null
        // Laço precisa de ≥3 pontos para virar área; traço sempre vale (até 1 ponto).
        if (s.kind === 'stroke' || s.points.length >= 3) commitShape(s)
        else bump()
      }
      scheduleRedraw()
    }

    const onDoubleClick = () => {
      if (tool === 'polygon') closePolygon()
    }

    // ── API imperativa ────────────────────────────────────────────────────────
    useImperativeHandle(
      ref,
      () => {
        /** Renderiza a seleção (branco/transparente) na resolução natural. */
        const renderLayer = (includeBase: boolean): HTMLCanvasElement | null => {
          const img = imgRef.current
          if (!img) return null
          const base = baseLayerRef.current
          if (shapesRef.current.length === 0 && !(includeBase && base)) return null
          const layer = document.createElement('canvas')
          layer.width = img.naturalWidth
          layer.height = img.naturalHeight
          const l = layer.getContext('2d')
          if (!l) return null
          if (includeBase && base) l.drawImage(base, 0, 0, layer.width, layer.height)
          paintShapes(l, shapesRef.current, (x, y) => ({ x: x * layer.width, y: y * layer.height }), 1)
          return layer
        }

        const toMaskBlob = (layer: HTMLCanvasElement | null): Promise<Blob | null> => {
          if (!layer) return Promise.resolve(null)
          const c = document.createElement('canvas')
          c.width = layer.width
          c.height = layer.height
          const ctx = c.getContext('2d')
          if (!ctx) return Promise.resolve(null)
          ctx.fillStyle = '#000000'
          ctx.fillRect(0, 0, c.width, c.height)
          ctx.drawImage(layer, 0, 0)
          return new Promise<Blob | null>(resolve => c.toBlob(resolve, 'image/png'))
        }

        return {
          hasSelection: () => computeCoverage() > 0,
          clearStrokes: () => {
            shapesRef.current = []
            activeShapeRef.current = null
            polyRef.current = null
            undoneRef.current = []
            bump()
            scheduleRedraw()
          },
          clearSelection: clearAll,
          exportMaskBlob: () => toMaskBlob(renderLayer(true)),
          exportStrokesBlob: () => toMaskBlob(renderLayer(false)),
          undo,
          redo,
        }
      },
      [bump, clearAll, computeCoverage, redo, scheduleRedraw, undo],
    )

    const pillStyle = (active: boolean, isDisabled = false): React.CSSProperties => ({
      padding: '5px 12px',
      borderRadius: 8,
      fontSize: 12.5,
      border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
      background: active ? 'var(--color-surface-hover)' : 'transparent',
      color: isDisabled
        ? 'var(--color-text-quaternary)'
        : active
          ? 'var(--color-text-primary)'
          : 'var(--color-text-secondary)',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      opacity: isDisabled ? 0.6 : 1,
    })

    const cursorStyle =
      tool === 'pan' ? 'grab' : isStrokeTool ? 'none' : 'crosshair'

    const polyReady = (polyRef.current?.points.length ?? 0) >= 3
    const canUndo =
      shapesRef.current.length > 0 || (polyRef.current?.points.length ?? 0) > 0
    const canRedo = undoneRef.current.length > 0

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {toolList.map(tl => (
            <button key={tl} type="button" style={pillStyle(tool === tl)} onClick={() => changeTool(tl)}>
              {TOOL_LABEL[tl]}
            </button>
          ))}
          {isStrokeTool && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--color-text-tertiary)',
              }}
            >
              Tamanho
              <input
                type="range"
                min={BRUSH_MIN}
                max={BRUSH_MAX}
                value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
                style={{ width: 110, accentColor: 'var(--color-accent-green)' }}
              />
            </label>
          )}
          {tool === 'polygon' && polyReady && (
            <button
              type="button"
              style={pillStyle(true)}
              onClick={closePolygon}
            >
              Fechar área
            </button>
          )}
          {enableUndo && (
            <>
              <button
                type="button"
                style={pillStyle(false, !canUndo)}
                disabled={!canUndo}
                onClick={undo}
              >
                Desfazer
              </button>
              <button
                type="button"
                style={pillStyle(false, !canRedo)}
                disabled={!canRedo}
                onClick={redo}
              >
                Refazer
              </button>
            </>
          )}
          <div style={{ flex: 1 }} />
          {zoom > 1 && (
            <button
              type="button"
              style={pillStyle(false)}
              onClick={() => {
                setZoom(1)
                panRef.current = { x: 0, y: 0 }
                scheduleRedraw()
              }}
            >
              Ajustar à tela · {Math.round(zoom * 100)}%
            </button>
          )}
          <button type="button" style={pillStyle(false)} onClick={clearAll}>
            Limpar seleção
          </button>
        </div>

        {/* Superfície de pintura */}
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 380,
            borderRadius: 12,
            overflow: 'hidden',
            border: '0.5px solid var(--color-border)',
            background: '#0a0a0a',
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onDoubleClick={onDoubleClick}
            onPointerLeave={() => {
              cursorRef.current = null
              endStroke()
            }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              touchAction: 'none',
              cursor: cursorStyle,
            }}
          />
          {!imageReady && (
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
        <div style={{ fontSize: 11.5, color: 'var(--color-text-quaternary)' }}>
          {tool === 'polygon'
            ? 'Clique para marcar os cantos da superfície · clique no primeiro ponto, dê duplo-clique ou pressione Enter para fechar'
            : tool === 'lasso'
              ? 'Arraste contornando a superfície · solte para fechar a área'
              : 'Scroll para aproximar · arraste com “Mover” para navegar · a edição altera apenas a área selecionada'}
        </div>
      </div>
    )
  },
)
