'use client'

// Canvas de pintura de máscara compartilhado entre os 2 modos da Retocar
// (standalone e embebido no Spaces).
//
// Renderiza imagem + overlay vermelho 50% das pinceladas.
// Expõe métodos imperativos via ref:
//   - getMaskBlob(): Promise<Blob>          → PNG B&W (preto preserve, branco edit)
//   - getMaskCoverage(): number             → fração 0-1
//   - clearMask(): void
//   - hasMask(): boolean
//   - validateOutsideMaskPreservation(outputUrl): Promise<{ok, drift}>
//
// Atalhos: Cmd/Ctrl+Z (undo), [ ] (brush size).

import {
  forwardRef, useCallback, useEffect, useImperativeHandle,
  useLayoutEffect, useRef, useState,
} from 'react'

const BRUSH_MIN = 10
const BRUSH_MAX = 200

interface Stroke {
  points: { x: number; y: number }[]
  size:   number
}

export interface RetocarCanvasHandle {
  getMaskBlob:          () => Promise<Blob | null>
  getMaskCoverage:      () => number
  clearMask:            () => void
  hasMask:              () => boolean
  validateOutsideMaskPreservation: (outputUrl: string) => Promise<{ ok: boolean; drift: number }>
}

interface Props {
  imageUrl:      string
  onMaskChange?: (coverage: number) => void
  initialBrush?: number
}

export const RetocarCanvas = forwardRef<RetocarCanvasHandle, Props>(function RetocarCanvas(
  { imageUrl, onMaskChange, initialBrush = 40 },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const imgCanvasRef  = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [size, setSize]   = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [brush, setBrush] = useState(initialBrush)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [isPainting, setIsPainting] = useState(false)

  const strokesRef = useRef<Stroke[]>([])
  const currentStrokeRef = useRef<Stroke | null>(null)

  // ── Load image ────────────────────────────────────────────────
  useEffect(() => {
    if (!imageUrl) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImgEl(img)
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => console.warn('[RetocarCanvas] image failed to load')
    img.src = imageUrl
  }, [imageUrl])

  // ── Compute display size mantendo aspect ratio ────────────────
  const measure = useCallback(() => {
    const wrap = wrapperRef.current
    if (!wrap || !naturalSize.w) return
    const maxW = wrap.clientWidth
    const maxH = wrap.clientHeight
    const r = naturalSize.w / naturalSize.h
    let w = maxW, h = Math.round(w / r)
    if (h > maxH) { h = maxH; w = Math.round(h * r) }
    setSize({ w, h })
  }, [naturalSize])

  useLayoutEffect(() => { measure() }, [measure])
  useEffect(() => {
    const ro = new ResizeObserver(measure)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [measure])

  // ── Redraw mask canvas ────────────────────────────────────────
  const redrawMask = useCallback(() => {
    const cv = maskCanvasRef.current
    if (!cv || !size.w || !size.h) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.fillStyle = 'rgba(232,75,75,0.5)'
    ctx.strokeStyle = 'rgba(232,75,75,0.5)'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokesRef.current) {
      ctx.lineWidth = stroke.size
      ctx.beginPath()
      const [p0, ...rest] = stroke.points
      if (!p0) continue
      ctx.moveTo(p0.x, p0.y)
      if (rest.length === 0) {
        // dot
        ctx.arc(p0.x, p0.y, stroke.size / 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        for (const p of rest) ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }
    }
  }, [size])

  // ── Draw image ────────────────────────────────────────────────
  useEffect(() => {
    if (!imgEl || !imgCanvasRef.current || !size.w) return
    const cv = imgCanvasRef.current
    cv.width = size.w
    cv.height = size.h
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.drawImage(imgEl, 0, 0, size.w, size.h)
  }, [imgEl, size])

  useEffect(() => {
    const cv = maskCanvasRef.current
    if (!cv || !size.w) return
    cv.width = size.w
    cv.height = size.h
    redrawMask()
  }, [size, redrawMask])

  // ── Pointer events ────────────────────────────────────────────
  function relativePoint(e: React.PointerEvent | PointerEvent) {
    const cv = maskCanvasRef.current!
    const r = cv.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function startStroke(e: React.PointerEvent) {
    if (!size.w) return
    const p = relativePoint(e)
    const stroke: Stroke = { points: [p], size: brush }
    currentStrokeRef.current = stroke
    strokesRef.current = [...strokesRef.current, stroke]
    setIsPainting(true)
    redrawMask()
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  function moveStroke(e: React.PointerEvent) {
    const p = relativePoint(e)
    setCursor(p)
    if (!isPainting || !currentStrokeRef.current) return
    currentStrokeRef.current.points.push(p)
    redrawMask()
  }

  function endStroke() {
    if (!isPainting) return
    setIsPainting(false)
    currentStrokeRef.current = null
    notifyCoverage()
  }

  function leaveCanvas() {
    setCursor(null)
    endStroke()
  }

  // ── Coverage ──────────────────────────────────────────────────
  const computeCoverage = useCallback((): number => {
    const cv = maskCanvasRef.current
    if (!cv || !cv.width) return 0
    const ctx = cv.getContext('2d')
    if (!ctx) return 0
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data
    let masked = 0
    const total = (data.length / 4)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) masked++
    }
    return masked / total
  }, [])

  function notifyCoverage() {
    if (onMaskChange) onMaskChange(computeCoverage())
  }

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (strokesRef.current.length > 0) {
          strokesRef.current = strokesRef.current.slice(0, -1)
          redrawMask()
          notifyCoverage()
        }
      }
      if (e.key === '[') {
        setBrush(b => Math.max(BRUSH_MIN, b - 5))
      }
      if (e.key === ']') {
        setBrush(b => Math.min(BRUSH_MAX, b + 5))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redrawMask])

  // ── Imperative handle ─────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getMaskCoverage: () => computeCoverage(),
    hasMask:         () => strokesRef.current.length > 0,
    clearMask: () => {
      strokesRef.current = []
      redrawMask()
      notifyCoverage()
    },
    getMaskBlob: async () => {
      if (strokesRef.current.length === 0 || !naturalSize.w) return null
      // Renderiza máscara em natural resolution (escalando os pontos).
      const off = document.createElement('canvas')
      off.width = naturalSize.w
      off.height = naturalSize.h
      const ctx = off.getContext('2d')
      if (!ctx) return null
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, off.width, off.height)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#fff'
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const sx = naturalSize.w / size.w
      const sy = naturalSize.h / size.h
      for (const stroke of strokesRef.current) {
        ctx.lineWidth = stroke.size * sx  // brush scaled
        ctx.beginPath()
        const [p0, ...rest] = stroke.points
        if (!p0) continue
        ctx.moveTo(p0.x * sx, p0.y * sy)
        if (rest.length === 0) {
          ctx.arc(p0.x * sx, p0.y * sy, (stroke.size * sx) / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          for (const p of rest) ctx.lineTo(p.x * sx, p.y * sy)
          ctx.stroke()
        }
      }
      return await new Promise<Blob | null>((res) => off.toBlob(b => res(b), 'image/png'))
    },
    validateOutsideMaskPreservation: async (outputUrl: string) => {
      // Carrega output e original, e compara pixels fora da máscara.
      // Retorna fração de pixels divergentes (RMS por componente RGB > threshold).
      if (!imgEl || !naturalSize.w) return { ok: true, drift: 0 }
      const out = new Image()
      out.crossOrigin = 'anonymous'
      out.src = outputUrl
      await new Promise<void>(res => { out.onload = () => res(); out.onerror = () => res() })

      const w = Math.min(naturalSize.w, out.naturalWidth, 800)
      const h = Math.round(w * (naturalSize.h / naturalSize.w))

      // Source
      const c1 = document.createElement('canvas'); c1.width = w; c1.height = h
      const ctx1 = c1.getContext('2d')!; ctx1.drawImage(imgEl, 0, 0, w, h)
      const d1 = ctx1.getImageData(0, 0, w, h).data

      // Output
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h
      const ctx2 = c2.getContext('2d')!; ctx2.drawImage(out, 0, 0, w, h)
      const d2 = ctx2.getImageData(0, 0, w, h).data

      // Mask scaled
      const cm = document.createElement('canvas'); cm.width = w; cm.height = h
      const ctxm = cm.getContext('2d')!
      ctxm.fillStyle = '#000'; ctxm.fillRect(0, 0, w, h)
      ctxm.fillStyle = '#fff'; ctxm.strokeStyle = '#fff'
      ctxm.lineCap = 'round'; ctxm.lineJoin = 'round'
      const sx = w / size.w; const sy = h / size.h
      for (const stroke of strokesRef.current) {
        ctxm.lineWidth = stroke.size * sx
        ctxm.beginPath()
        const [p0, ...rest] = stroke.points
        if (!p0) continue
        ctxm.moveTo(p0.x * sx, p0.y * sy)
        if (rest.length === 0) { ctxm.arc(p0.x * sx, p0.y * sy, (stroke.size * sx) / 2, 0, Math.PI * 2); ctxm.fill() }
        else { for (const p of rest) ctxm.lineTo(p.x * sx, p.y * sy); ctxm.stroke() }
      }
      const dm = ctxm.getImageData(0, 0, w, h).data

      // Compara fora da máscara (mask alpha == 0 means outside)
      const DRIFT_THRESHOLD = 12  // por componente, 0-255
      let outsideCount = 0
      let driftCount = 0
      for (let i = 0; i < dm.length; i += 4) {
        const isMasked = dm[i] > 32  // branco no mask
        if (isMasked) continue
        outsideCount++
        const dr = Math.abs(d1[i]   - d2[i])
        const dg = Math.abs(d1[i+1] - d2[i+1])
        const db = Math.abs(d1[i+2] - d2[i+2])
        if (dr > DRIFT_THRESHOLD || dg > DRIFT_THRESHOLD || db > DRIFT_THRESHOLD) {
          driftCount++
        }
      }
      const drift = outsideCount > 0 ? driftCount / outsideCount : 0
      // 2% threshold do briefing
      return { ok: drift < 0.02, drift }
    },
  }), [computeCoverage, redrawMask, imgEl, naturalSize, size])

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg-elevated)', borderRadius: 14,
        overflow: 'hidden', position: 'relative',
        minHeight: 360,
        userSelect: 'none', touchAction: 'none',
      }}
    >
      {!imgEl ? (
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>carregando…</div>
      ) : (
        <div style={{ position: 'relative', width: size.w, height: size.h, cursor: 'crosshair' }}>
          <canvas
            ref={imgCanvasRef}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          />
          <canvas
            ref={maskCanvasRef}
            onPointerDown={startStroke}
            onPointerMove={moveStroke}
            onPointerUp={endStroke}
            onPointerLeave={leaveCanvas}
            style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
          />
          {/* Cursor preview */}
          {cursor && !isPainting && (
            <div style={{
              position: 'absolute',
              left: cursor.x - brush / 2,
              top:  cursor.y - brush / 2,
              width: brush, height: brush,
              borderRadius: '50%',
              border: '1.5px solid rgba(255,255,255,0.8)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
              pointerEvents: 'none',
            }} />
          )}
        </div>
      )}
    </div>
  )
})

export { BRUSH_MIN, BRUSH_MAX }
