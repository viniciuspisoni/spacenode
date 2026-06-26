'use client'

// EditV3Canvas — superfície de seleção do Editar V3.
//
// Núcleo de pintura herdado do EditV2Canvas (limpo, validado): formas em
// coordenadas NORMALIZADAS da imagem (0–1) — redimensionar nunca desloca a
// seleção; um único helper (paintShapes) pinta tela/export/cobertura de forma
// idêntica (o que aparece é exatamente o que é editado); zoom/pan; export PNG
// P&B na resolução natural (branco = editar).
//
// Diferença vs o v2: ferramenta e tamanho do pincel são CONTROLADOS por props
// (a barra vertical esquerda do EditV3Flow comanda) — o canvas não tem toolbar
// própria. Mantém botões flutuantes mínimos: "Ajustar à tela" (zoom) e "Fechar
// área" (polígono). Não conhece API nem custo — só pintura.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

export type EditV3Tool = 'auto' | 'lasso' | 'polygon' | 'brush' | 'eraser' | 'pan'

type Pt = { x: number; y: number }

interface Shape {
  kind: 'stroke' | 'poly'
  points: Pt[]
  sizeImagePx: number
  mode: 'add' | 'subtract'
}

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

export interface EditV3CanvasHandle {
  exportMaskBlob(): Promise<Blob | null>
  exportStrokesBlob(): Promise<Blob | null>
  clearStrokes(): void
  clearSelection(): void
  hasSelection(): boolean
  undo(): void
  redo(): void
}

interface Props {
  imageUrl: string
  baseMaskUrl?: string | null
  /** Ferramenta ativa (controlada pela barra esquerda). 'auto'/'pan' não pintam. */
  tool: EditV3Tool
  /** Tamanho do pincel em px de tela (controlado). */
  brushSize: number
  onCoverageChange?: (coverage: number) => void
  onClearedBase?: () => void
  disabled?: boolean
}

const MIN_ZOOM = 1
const MAX_ZOOM = 6
const CLOSE_THRESHOLD_PX = 14

/** 'auto' não é ferramenta de pintura (a detecção vive no fluxo); aqui cai em pan. */
function effTool(t: EditV3Tool): Exclude<EditV3Tool, 'auto'> {
  return t === 'auto' ? 'pan' : t
}

export const EditV3Canvas = forwardRef<EditV3CanvasHandle, Props>(
  function EditV3Canvas({ imageUrl, baseMaskUrl, tool, brushSize, onCoverageChange, onClearedBase, disabled }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const imgRef = useRef<HTMLImageElement | null>(null)
    const baseLayerRef = useRef<HTMLCanvasElement | null>(null)
    const shapesRef = useRef<Shape[]>([])
    const activeShapeRef = useRef<Shape | null>(null)
    const polyRef = useRef<{ points: Pt[]; mode: 'add' } | null>(null)
    const undoneRef = useRef<Shape[]>([])
    const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
    const cursorRef = useRef<{ x: number; y: number } | null>(null)
    const rafRef = useRef<number>(0)
    const scheduleRedrawRef = useRef<(() => void) | null>(null)
    const prevToolRef = useRef<EditV3Tool>(tool)

    const [zoom, setZoom] = useState(1)
    const panRef = useRef({ x: 0, y: 0 })
    const [imageReady, setImageReady] = useState(false)
    const [, forceTick] = useState(0)
    const bump = useCallback(() => forceTick(n => n + 1), [])

    const active = effTool(tool)
    const isStrokeTool = active === 'brush' || active === 'eraser'

    // ── Carregamento da imagem ────────────────────────────────────────────────
    useEffect(() => {
      setImageReady(false)
      shapesRef.current = []
      activeShapeRef.current = null
      polyRef.current = null
      undoneRef.current = []
      baseLayerRef.current = null
      panRef.current = { x: 0, y: 0 }
      setZoom(1)
      // Sem crossOrigin: nunca lemos pixels da IMAGEM; exigir CORS quebraria o
      // load de fontes como o CDN da FAL.
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
      img.crossOrigin = 'anonymous' // saída do detector mora no Storage (CORS ok)
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
            const lum = d[i]
            d[i] = 255
            d[i + 1] = 255
            d[i + 2] = 255
            d[i + 3] = lum > 110 ? 255 : 0
          }
          ctx.putImageData(id, 0, 0)
          baseLayerRef.current = c
        } catch {
          baseLayerRef.current = null
          console.warn('[EditV3Canvas] camada de superfície indisponível (CORS)')
        }
        onCoverageChange?.(computeCoverageRef.current())
        scheduleRedrawRef.current?.()
      }
      img.onerror = () => {
        baseLayerRef.current = null
      }
      img.src = baseMaskUrl
      return () => {
        cancelled = true
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseMaskUrl])

    // ── Geometria ─────────────────────────────────────────────────────────────
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
      ctx.drawImage(img, t.offsetX, t.offsetY, img.naturalWidth * t.scale, img.naturalHeight * t.scale)

      const toDisplay = (x: number, y: number): Pt => ({
        x: t.offsetX + x * img.naturalWidth * t.scale,
        y: t.offsetY + y * img.naturalHeight * t.scale,
      })

      const all = activeShapeRef.current ? [...shapesRef.current, activeShapeRef.current] : shapesRef.current
      const base = baseLayerRef.current
      if (all.length > 0 || base) {
        const layer = document.createElement('canvas')
        layer.width = canvas.width
        layer.height = canvas.height
        const lctx = layer.getContext('2d')
        if (lctx) {
          if (base) {
            lctx.drawImage(base, t.offsetX, t.offsetY, img.naturalWidth * t.scale, img.naturalHeight * t.scale)
          }
          paintShapes(lctx, all, toDisplay, t.scale)
          lctx.globalCompositeOperation = 'source-in'
          lctx.fillStyle = '#30d158'
          lctx.fillRect(0, 0, layer.width, layer.height)
          ctx.globalAlpha = 0.42
          ctx.drawImage(layer, 0, 0)
          ctx.globalAlpha = 1
        }
      }

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

      const cur = cursorRef.current
      if (cur && isStrokeTool && !disabled) {
        ctx.beginPath()
        ctx.arc(cur.x, cur.y, brushSize / 2, 0, Math.PI * 2)
        ctx.strokeStyle = active === 'eraser' ? 'rgba(255,255,255,0.9)' : 'rgba(48,209,88,0.95)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }, [active, brushSize, disabled, getTransform, isStrokeTool])

    const scheduleRedraw = useCallback(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(redraw)
    }, [redraw])
    scheduleRedrawRef.current = scheduleRedraw

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

    // ── Cobertura ─────────────────────────────────────────────────────────────
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
    const computeCoverageRef = useRef(computeCoverage)
    computeCoverageRef.current = computeCoverage

    // ── Mutadores ─────────────────────────────────────────────────────────────
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

    // Troca de ferramenta controlada: ao SAIR do polígono, fecha se válido.
    useEffect(() => {
      const prev = prevToolRef.current
      if (prev === 'polygon' && tool !== 'polygon') {
        if (polyRef.current && polyRef.current.points.length >= 3) closePolygon()
        else {
          polyRef.current = null
          bump()
          scheduleRedraw()
        }
      }
      prevToolRef.current = tool
    }, [tool, bump, closePolygon, scheduleRedraw])

    // ── Atalhos de teclado ────────────────────────────────────────────────────
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (disabled) return
        const el = e.target as HTMLElement | null
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
        const meta = e.metaKey || e.ctrlKey
        if (meta && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault()
          if (e.shiftKey) redo()
          else undo()
          return
        }
        if (e.key === 'Enter' && active === 'polygon') {
          e.preventDefault()
          closePolygon()
        } else if (e.key === 'Escape') {
          cancelActive()
        }
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [active, cancelActive, closePolygon, disabled, redo, undo])

    // ── Ponteiro ──────────────────────────────────────────────────────────────
    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || !imageReady) return
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.setPointerCapture(e.pointerId)
      const isPan = active === 'pan' || e.button === 1
      if (isPan) {
        panDragRef.current = { startX: e.clientX, startY: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
        return
      }
      const p = toImageCoords(e.clientX, e.clientY)
      if (!p) return

      if (active === 'polygon') {
        const dev = toDeviceCoords(e.clientX, e.clientY)
        const t = getTransform()
        const img = imgRef.current
        const poly = polyRef.current
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

      if (active === 'lasso') {
        activeShapeRef.current = { kind: 'poly', points: [p], sizeImagePx: 0, mode: 'add' }
      } else {
        const t = getTransform()
        if (!t) return
        const dpr = canvas.width / canvas.getBoundingClientRect().width
        activeShapeRef.current = {
          kind: 'stroke',
          points: [p],
          sizeImagePx: (brushSize * dpr) / t.scale,
          mode: active === 'eraser' ? 'subtract' : 'add',
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
        panRef.current = { x: d.panX + (e.clientX - d.startX) * dpr, y: d.panY + (e.clientY - d.startY) * dpr }
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
        if (s.kind === 'stroke' || s.points.length >= 3) commitShape(s)
        else bump()
      }
      scheduleRedraw()
    }

    const onDoubleClick = () => {
      if (active === 'polygon') closePolygon()
    }

    // ── API imperativa ────────────────────────────────────────────────────────
    useImperativeHandle(
      ref,
      () => {
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
            onCoverageChange?.(computeCoverage())
            scheduleRedraw()
          },
          clearSelection: clearAll,
          exportMaskBlob: () => toMaskBlob(renderLayer(true)),
          exportStrokesBlob: () => toMaskBlob(renderLayer(false)),
          undo,
          redo,
        }
      },
      [bump, clearAll, computeCoverage, onCoverageChange, redo, scheduleRedraw, undo],
    )

    const cursorStyle = active === 'pan' || tool === 'auto' ? 'grab' : isStrokeTool ? 'none' : 'crosshair'
    const polyReady = (polyRef.current?.points.length ?? 0) >= 3

    const floatBtn: React.CSSProperties = {
      padding: '5px 11px',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 500,
      border: '0.5px solid var(--color-border-strong)',
      background: 'rgba(20,20,20,0.72)',
      color: 'var(--color-text-primary)',
      backdropFilter: 'blur(8px)',
      cursor: 'pointer',
    }

    return (
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 420,
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
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: cursorStyle }}
        />

        {/* Botões flutuantes mínimos */}
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 8 }}>
          {active === 'polygon' && polyReady && (
            <button type="button" style={floatBtn} onClick={closePolygon}>
              Fechar área
            </button>
          )}
          {zoom > 1 && (
            <button
              type="button"
              style={floatBtn}
              onClick={() => {
                setZoom(1)
                panRef.current = { x: 0, y: 0 }
                scheduleRedraw()
              }}
            >
              Ajustar à tela · {Math.round(zoom * 100)}%
            </button>
          )}
        </div>

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
    )
  },
)
