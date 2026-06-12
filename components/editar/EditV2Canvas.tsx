'use client'

// EditV2Canvas — canvas de seleção do Editar v2.
//
// Diferenças estruturais vs o canvas v1 (RetocarCanvas):
//   - Traços guardados em coordenadas NORMALIZADAS da imagem (0–1) com tamanho
//     em pixels da imagem — redimensionar a janela nunca desloca a seleção
//     (bug P1 do v1, eliminado por construção).
//   - Zoom (scroll) + mover (ferramenta pan ou arrastar com botão do meio).
//   - Exportação re-renderiza os traços na resolução NATURAL da imagem
//     (PNG preto/branco: branco = editar).
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

type Tool = 'brush' | 'eraser' | 'pan'

interface Stroke {
  /** Pontos em coordenadas normalizadas da imagem (0–1). */
  points: { x: number; y: number }[]
  /** Diâmetro do traço em PIXELS DA IMAGEM (independe de zoom/janela). */
  sizeImagePx: number
  tool: 'brush' | 'eraser'
}

export interface EditV2CanvasHandle {
  /** Máscara FINAL: camada de superfície (se houver) + traços − borracha. */
  exportMaskBlob(): Promise<Blob | null>
  /** Só os traços do usuário (semente para a detecção de superfície). */
  exportStrokesBlob(): Promise<Blob | null>
  /** Remove só os traços, preservando a camada de superfície. */
  clearStrokes(): void
  clearSelection(): void
  hasSelection(): boolean
}

interface Props {
  imageUrl: string
  /** Máscara de SUPERFÍCIE detectada (PNG P&B no Storage) — vira camada-base
   *  da seleção; o pincel ADICIONA por cima e a borracha SUBTRAI dela. */
  baseMaskUrl?: string | null
  /** Chamado ao fim de cada traço com a fração 0–1 coberta pela seleção. */
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

export const EditV2Canvas = forwardRef<EditV2CanvasHandle, Props>(
  function EditV2Canvas({ imageUrl, baseMaskUrl, onCoverageChange, onClearedBase, disabled }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const imgRef = useRef<HTMLImageElement | null>(null)
    /** Camada de superfície como BRANCO-sobre-transparente (offscreen). */
    const baseLayerRef = useRef<HTMLCanvasElement | null>(null)
    const strokesRef = useRef<Stroke[]>([])
    const activeStrokeRef = useRef<Stroke | null>(null)
    const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
    const cursorRef = useRef<{ x: number; y: number } | null>(null)
    const rafRef = useRef<number>(0)
    const scheduleRedrawRef = useRef<(() => void) | null>(null)

    const [tool, setTool] = useState<Tool>('brush')
    const [brushSize, setBrushSize] = useState(36) // px de TELA (convertido ao pintar)
    const [zoom, setZoom] = useState(1)
    const panRef = useRef({ x: 0, y: 0 })
    const [imageReady, setImageReady] = useState(false)
    const [, forceTick] = useState(0)

    // ── Carregamento da imagem ────────────────────────────────────────────────
    useEffect(() => {
      setImageReady(false)
      strokesRef.current = []
      panRef.current = { x: 0, y: 0 }
      setZoom(1)
      // Sem crossOrigin: nunca lemos pixels da IMAGEM (cobertura/export usam só
      // os traços), e exigir CORS quebraria o load de fontes como o CDN da FAL.
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
      // Saída do /segment mora no Storage do Supabase (CORS liberado) — o
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
          // CORS/taint inesperado: degrada para traços literais, sem quebrar.
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

      // Camada de seleção: superfície detectada (se houver) + replay dos traços
      // em canvas temporário (na escala de exibição) → tinge de verde → compõe.
      const all = activeStrokeRef.current
        ? [...strokesRef.current, activeStrokeRef.current]
        : strokesRef.current
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
          lctx.lineCap = 'round'
          lctx.lineJoin = 'round'
          for (const s of all) {
            lctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over'
            lctx.strokeStyle = '#ffffff'
            lctx.fillStyle = '#ffffff'
            lctx.lineWidth = s.sizeImagePx * t.scale
            const pts = s.points
            if (pts.length === 1) {
              const p = pts[0]
              lctx.beginPath()
              lctx.arc(
                t.offsetX + p.x * img.naturalWidth * t.scale,
                t.offsetY + p.y * img.naturalHeight * t.scale,
                (s.sizeImagePx * t.scale) / 2,
                0,
                Math.PI * 2,
              )
              lctx.fill()
            } else {
              lctx.beginPath()
              pts.forEach((p, i) => {
                const x = t.offsetX + p.x * img.naturalWidth * t.scale
                const y = t.offsetY + p.y * img.naturalHeight * t.scale
                if (i === 0) lctx.moveTo(x, y)
                else lctx.lineTo(x, y)
              })
              lctx.stroke()
            }
          }
          // tinge: mantém só onde há traço
          lctx.globalCompositeOperation = 'source-in'
          lctx.fillStyle = '#30d158'
          lctx.fillRect(0, 0, layer.width, layer.height)
          ctx.globalAlpha = 0.42
          ctx.drawImage(layer, 0, 0)
          ctx.globalAlpha = 1
        }
      }

      // anel do pincel
      const cur = cursorRef.current
      if (cur && tool !== 'pan' && !disabled) {
        ctx.beginPath()
        ctx.arc(cur.x, cur.y, brushSize / 2, 0, Math.PI * 2)
        ctx.strokeStyle = tool === 'eraser' ? 'rgba(255,255,255,0.9)' : 'rgba(48,209,88,0.95)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }, [brushSize, disabled, getTransform, tool])

    const scheduleRedraw = useCallback(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(redraw)
    }, [redraw])
    scheduleRedrawRef.current = scheduleRedraw

    // resize: só recalcula o bitmap — traços normalizados não deslocam.
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

    // ── Cobertura (raster pequeno: superfície + traços − borracha) ───────────
    const computeCoverage = useCallback(() => {
      const img = imgRef.current
      if (!img) return 0
      const base = baseLayerRef.current
      if (strokesRef.current.length === 0 && !base) return 0
      const W = 256
      const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W))
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const ctx = c.getContext('2d')
      if (!ctx) return 0
      if (base) ctx.drawImage(base, 0, 0, W, H)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const s of strokesRef.current) {
        ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over'
        ctx.strokeStyle = '#fff'
        ctx.fillStyle = '#fff'
        ctx.lineWidth = (s.sizeImagePx / img.naturalWidth) * W
        if (s.points.length === 1) {
          ctx.beginPath()
          ctx.arc(s.points[0].x * W, s.points[0].y * H, ctx.lineWidth / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.beginPath()
          s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * W, p.y * H) : ctx.lineTo(p.x * W, p.y * H)))
          ctx.stroke()
        }
      }
      const data = ctx.getImageData(0, 0, W, H).data
      let on = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] > 10) on++
      return on / (W * H)
    }, [])

    // ── Pintura / pan ─────────────────────────────────────────────────────────
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
      const t = getTransform()
      const img = imgRef.current
      const p = toImageCoords(e.clientX, e.clientY)
      if (!p || !t || !img) return
      const dpr = canvas.width / canvas.getBoundingClientRect().width
      activeStrokeRef.current = {
        points: [p],
        sizeImagePx: (brushSize * dpr) / t.scale,
        tool: tool === 'eraser' ? 'eraser' : 'brush',
      }
      scheduleRedraw()
    }

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      cursorRef.current = {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      }
      if (panDragRef.current) {
        const d = panDragRef.current
        const dpr = canvas.width / rect.width
        panRef.current = {
          x: d.panX + (e.clientX - d.startX) * dpr,
          y: d.panY + (e.clientY - d.startY) * dpr,
        }
      } else if (activeStrokeRef.current) {
        const p = toImageCoords(e.clientX, e.clientY)
        if (p) activeStrokeRef.current.points.push(p)
      }
      scheduleRedraw()
    }

    const endStroke = () => {
      panDragRef.current = null
      if (activeStrokeRef.current) {
        strokesRef.current.push(activeStrokeRef.current)
        activeStrokeRef.current = null
        forceTick(n => n + 1)
        onCoverageChange?.(computeCoverage())
      }
      scheduleRedraw()
    }

    // ── API imperativa ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => {
      /** Renderiza a seleção (branco/transparente) na resolução natural. */
      const renderLayer = (includeBase: boolean): HTMLCanvasElement | null => {
        const img = imgRef.current
        if (!img) return null
        const base = baseLayerRef.current
        if (strokesRef.current.length === 0 && !(includeBase && base)) return null
        const layer = document.createElement('canvas')
        layer.width = img.naturalWidth
        layer.height = img.naturalHeight
        const l = layer.getContext('2d')
        if (!l) return null
        if (includeBase && base) l.drawImage(base, 0, 0, layer.width, layer.height)
        l.lineCap = 'round'
        l.lineJoin = 'round'
        for (const s of strokesRef.current) {
          l.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over'
          l.strokeStyle = '#ffffff'
          l.fillStyle = '#ffffff'
          l.lineWidth = s.sizeImagePx
          if (s.points.length === 1) {
            l.beginPath()
            l.arc(s.points[0].x * layer.width, s.points[0].y * layer.height, s.sizeImagePx / 2, 0, Math.PI * 2)
            l.fill()
          } else {
            l.beginPath()
            s.points.forEach((p, i) =>
              i === 0
                ? l.moveTo(p.x * layer.width, p.y * layer.height)
                : l.lineTo(p.x * layer.width, p.y * layer.height),
            )
            l.stroke()
          }
        }
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
          strokesRef.current = []
          activeStrokeRef.current = null
          forceTick(n => n + 1)
          scheduleRedraw()
        },
        clearSelection: () => {
          strokesRef.current = []
          activeStrokeRef.current = null
          baseLayerRef.current = null
          forceTick(n => n + 1)
          onClearedBase?.()
          onCoverageChange?.(0)
          scheduleRedraw()
        },
        exportMaskBlob: () => toMaskBlob(renderLayer(true)),
        exportStrokesBlob: () => toMaskBlob(renderLayer(false)),
      }
    }, [computeCoverage, onClearedBase, onCoverageChange, scheduleRedraw])

    const pillStyle = (active: boolean): React.CSSProperties => ({
      padding: '5px 12px',
      borderRadius: 8,
      fontSize: 12.5,
      border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
      background: active ? 'var(--color-surface-hover)' : 'transparent',
      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
      cursor: 'pointer',
    })

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
        {/* Toolbar mínima */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={pillStyle(tool === 'brush')} onClick={() => setTool('brush')}>
            Pincel
          </button>
          <button type="button" style={pillStyle(tool === 'eraser')} onClick={() => setTool('eraser')}>
            Borracha
          </button>
          <button type="button" style={pillStyle(tool === 'pan')} onClick={() => setTool('pan')}>
            Mover
          </button>
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
          <button
            type="button"
            style={pillStyle(false)}
            onClick={() => {
              strokesRef.current = []
              activeStrokeRef.current = null
              baseLayerRef.current = null
              forceTick(n => n + 1)
              onClearedBase?.()
              onCoverageChange?.(0)
              scheduleRedraw()
            }}
          >
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
              cursor: tool === 'pan' ? 'grab' : 'none',
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
          Scroll para aproximar · arraste com “Mover” para navegar · a edição altera apenas a área selecionada
        </div>
      </div>
    )
  },
)
