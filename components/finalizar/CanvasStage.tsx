'use client'

// CanvasStage — superfície de composição do Finalizar.
//
// Motor de camadas em Canvas 2D nativo (sem Konva), forkado do EditV2Canvas:
//   - Traços de máscara em coordenadas NORMALIZADAS da imagem (0–1) → resize-safe.
//   - Cada camada (exceto a base) tem uma máscara alfa offscreen na resolução
//     natural da base; o pincel "revelar" pinta branco, "ocultar" apaga.
//   - Composição: base no fundo, demais camadas mascaradas + opacidade + blend.
//   - Feather: blur simples aplicado na máscara no momento de compor.
//   - Export re-compõe na resolução NATURAL (PNG/JPG). Nada disso usa Nodes.
//
// crossOrigin='anonymous' em TODAS as imagens: vamos ler pixels no export, então
// as fontes precisam servir CORS (Supabase Storage e fal.media servem). Falha de
// CORS é tratada com try/catch — degrada sem quebrar.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { BlendMode, BrushMode, ExportFormat, Layer } from '@/lib/finalizar/types'

const MIN_ZOOM = 1
const MAX_ZOOM = 8
const UNDO_DEPTH = 15

const BLEND_OP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  'soft-light': 'soft-light',
}

interface LayerRecord {
  img: HTMLImageElement | null
  /** Máscara alfa (branco opaco = visível). null para a base. */
  mask: HTMLCanvasElement | null
  loaded: boolean
  failed: boolean
  /** Já pintada nesta sessão ou carregada de maskUrl (vale persistir). */
  dirty: boolean
}

export interface CanvasStageHandle {
  exportComposite(format: ExportFormat, quality?: number): Promise<Blob | null>
  exportThumbnail(maxDim: number): Promise<Blob | null>
  /** PNG branco=visível na resolução natural — null se a camada não tem máscara útil. */
  getLayerMaskBlob(layerId: string): Promise<Blob | null>
  hasMask(layerId: string): boolean
  invertMask(layerId: string): void
  clearMask(layerId: string, fill: 'full' | 'empty'): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  resetView(): void
  zoomPct(): number
}

interface Props {
  layers: Layer[]
  width: number
  height: number
  activeLayerId: string | null
  brushMode: BrushMode
  brushSize: number
  /** Antes/depois: quando true, mostra só a camada base. */
  showBaseOnly?: boolean
  onPaint?: () => void
  onHistoryChange?: () => void
  onZoomChange?: (pct: number) => void
  onLayerLoadError?: (layerId: string) => void
  disabled?: boolean
}

export const CanvasStage = forwardRef<CanvasStageHandle, Props>(function CanvasStage(
  { layers, width, height, activeLayerId, brushMode, brushSize, showBaseOnly, onPaint, onHistoryChange, onZoomChange, onLayerLoadError, disabled },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const records = useRef<Map<string, LayerRecord>>(new Map())
  const layersRef = useRef<Layer[]>(layers)
  const activeRef = useRef<string | null>(activeLayerId)
  const showBaseRef = useRef<boolean>(Boolean(showBaseOnly))

  const panRef = useRef({ x: 0, y: 0 })
  const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const paintingRef = useRef<{ layerId: string; mode: BrushMode; sizeImagePx: number; last: { x: number; y: number } | null } | null>(null)
  const cursorRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number>(0)
  const drawRef = useRef<(() => void) | null>(null)
  const spaceDownRef = useRef(false)

  const undoRef = useRef<{ layerId: string; snap: HTMLCanvasElement }[]>([])
  const redoRef = useRef<{ layerId: string; snap: HTMLCanvasElement }[]>([])

  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const [ready, setReady] = useState(false)

  layersRef.current = layers
  activeRef.current = activeLayerId
  showBaseRef.current = Boolean(showBaseOnly)

  const scheduleRedraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => drawRef.current?.())
  }, [])

  // ── Sincroniza imagens/máscaras com a prop `layers` ──────────────────────────
  useEffect(() => {
    const map = records.current
    const seen = new Set<string>()
    let pending = 0
    let cancelled = false

    const markReady = () => {
      if (cancelled) return
      const allLoaded = layers.every((l) => map.get(l.id)?.loaded || map.get(l.id)?.failed)
      if (allLoaded) setReady(true)
    }

    for (const layer of layers) {
      seen.add(layer.id)
      let rec = map.get(layer.id)
      if (!rec) {
        rec = { img: null, mask: null, loaded: false, failed: false, dirty: false }
        map.set(layer.id, rec)
      }
      // (Re)carrega a imagem se ainda não temos ou a URL mudou.
      if (!rec.img || rec.img.dataset.url !== layer.url) {
        pending++
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.dataset.url = layer.url
        img.onload = () => {
          rec!.img = img
          rec!.loaded = true
          rec!.failed = false
          // Cria a máscara da camada (a base nunca tem máscara).
          if (!layer.isBase && !rec!.mask) {
            rec!.mask = makeMaskCanvas(width, height)
            if (layer.maskUrl) {
              loadMaskInto(rec!.mask, layer.maskUrl, () => { rec!.dirty = true; scheduleRedraw() })
            } else {
              fillMask(rec!.mask, layer.maskFill)
              rec!.dirty = layer.maskFill === 'empty' // empty exige persistir explicitamente
            }
          }
          pending--
          scheduleRedraw()
          markReady()
        }
        img.onerror = () => {
          rec!.failed = true
          rec!.loaded = true
          pending--
          onLayerLoadError?.(layer.id)
          markReady()
        }
        img.src = layer.url
      }
    }

    // Remove registros de camadas excluídas.
    for (const id of Array.from(map.keys())) {
      if (!seen.has(id)) map.delete(id)
    }

    if (pending === 0) { markReady(); scheduleRedraw() }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, width, height])

  // ── Geometria fit + zoom + pan (base = width/height da composição) ───────────
  const getTransform = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !width || !height) return null
    const cw = canvas.width
    const ch = canvas.height
    const fit = Math.min(cw / width, ch / height)
    const scale = fit * zoomRef.current
    const drawW = width * scale
    const drawH = height * scale
    const baseX = (cw - drawW) / 2
    const baseY = (ch - drawH) / 2
    return { scale, offsetX: baseX + panRef.current.x, offsetY: baseY + panRef.current.y }
  }, [width, height])

  // ── Composição (núcleo reutilizado por tela e export) ────────────────────────
  const composite = useCallback(
    (dctx: CanvasRenderingContext2D, dest: { x: number; y: number; w: number; h: number }, baseOnly: boolean) => {
      const list = layersRef.current
      const scaleToDest = dest.w / width // px da base → px do destino (feather)
      dctx.imageSmoothingQuality = 'high'
      for (const layer of list) {
        const rec = records.current.get(layer.id)
        if (!rec || !rec.img || rec.failed || !layer.visible) continue
        if (baseOnly && !layer.isBase) continue

        if (layer.isBase || !rec.mask) {
          dctx.globalAlpha = layer.isBase ? 1 : clamp01(layer.opacity)
          dctx.globalCompositeOperation = layer.isBase ? 'source-over' : BLEND_OP[layer.blendMode]
          dctx.drawImage(rec.img, dest.x, dest.y, dest.w, dest.h)
          continue
        }

        // Camada com máscara: pré-compõe imagem × máscara num canvas temporário.
        const tw = Math.max(1, Math.round(dest.w))
        const th = Math.max(1, Math.round(dest.h))
        const tmp = document.createElement('canvas')
        tmp.width = tw
        tmp.height = th
        const tctx = tmp.getContext('2d')
        if (!tctx) continue
        tctx.imageSmoothingQuality = 'high'
        tctx.drawImage(rec.img, 0, 0, tw, th)
        tctx.globalCompositeOperation = 'destination-in'
        if (layer.feather > 0) tctx.filter = `blur(${Math.max(0.1, layer.feather * scaleToDest)}px)`
        tctx.drawImage(rec.mask, 0, 0, tw, th)
        tctx.filter = 'none'

        dctx.globalAlpha = clamp01(layer.opacity)
        dctx.globalCompositeOperation = BLEND_OP[layer.blendMode]
        dctx.drawImage(tmp, dest.x, dest.y)
      }
      dctx.globalAlpha = 1
      dctx.globalCompositeOperation = 'source-over'
    },
    [width, height],
  )

  const drawToScreen = useCallback(() => {
    const canvas = canvasRef.current
    const t = getTransform()
    if (!canvas || !t) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    composite(ctx, { x: t.offsetX, y: t.offsetY, w: width * t.scale, h: height * t.scale }, showBaseRef.current)

    // anel do cursor (pincel)
    const cur = cursorRef.current
    const paintable = isPaintable(activeRef.current, layersRef.current)
    if (cur && paintable && !disabled && !spaceDownRef.current && !showBaseRef.current) {
      ctx.beginPath()
      ctx.arc(cur.x, cur.y, (brushSize * (canvas.width / canvas.getBoundingClientRect().width)) / 2, 0, Math.PI * 2)
      ctx.strokeStyle = brushMode === 'hide' ? 'rgba(255,255,255,0.9)' : 'rgba(48,209,88,0.95)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }, [brushMode, brushSize, composite, disabled, getTransform, width, height])

  // Mantém o desenhador atual acessível ao scheduleRedraw (evita closure velha)
  // e re-renderiza sempre que qualquer dep de drawToScreen muda (ex.: brushSize).
  useEffect(() => { drawRef.current = drawToScreen; scheduleRedraw() }, [drawToScreen, scheduleRedraw])

  // resize: só recalcula o bitmap — máscaras (px da imagem) não deslocam.
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
  }, [scheduleRedraw, ready])

  useEffect(() => { scheduleRedraw() }, [scheduleRedraw, zoom, ready, showBaseOnly, brushMode, brushSize, layers, activeLayerId])

  // Surfacing do zoom para a UI (evita ler o ref durante o render do pai).
  useEffect(() => { onZoomChange?.(Math.round(zoom * 100)) }, [zoom, onZoomChange])

  // ── Zoom por scroll, centrado no cursor ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const prev = zoomRef.current
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor))
      if (next === prev) return
      const t = getTransform()
      const rect = canvas.getBoundingClientRect()
      if (t) {
        const px = (e.clientX - rect.left) * (canvas.width / rect.width)
        const py = (e.clientY - rect.top) * (canvas.height / rect.height)
        const k = next / prev
        const ox = t.offsetX - panRef.current.x
        const oy = t.offsetY - panRef.current.y
        panRef.current = { x: px - (px - panRef.current.x - ox) * k - ox, y: py - (py - panRef.current.y - oy) * k - oy }
      }
      if (next === MIN_ZOOM) panRef.current = { x: 0, y: 0 }
      zoomRef.current = next
      setZoom(next)
      scheduleRedraw()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [getTransform, scheduleRedraw])

  // ── Espaço = pan temporário ─────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDownRef.current = true }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDownRef.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // ── Coordenadas de tela → imagem normalizada (0–1) ───────────────────────────
  const toImageCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      const t = getTransform()
      if (!canvas || !t) return null
      const rect = canvas.getBoundingClientRect()
      const px = (clientX - rect.left) * (canvas.width / rect.width)
      const py = (clientY - rect.top) * (canvas.height / rect.height)
      return { x: (px - t.offsetX) / t.scale / width, y: (py - t.offsetY) / t.scale / height }
    },
    [getTransform, width, height],
  )

  // ── Pintura na máscara da camada ativa ───────────────────────────────────────
  const stampSegment = (mask: HTMLCanvasElement, from: { x: number; y: number } | null, to: { x: number; y: number }, mode: BrushMode, sizeImagePx: number) => {
    const m = mask.getContext('2d')
    if (!m) return
    m.globalCompositeOperation = mode === 'hide' ? 'destination-out' : 'source-over'
    m.strokeStyle = '#ffffff'
    m.fillStyle = '#ffffff'
    m.lineCap = 'round'
    m.lineJoin = 'round'
    m.lineWidth = sizeImagePx
    if (!from) {
      m.beginPath()
      m.arc(to.x * mask.width, to.y * mask.height, sizeImagePx / 2, 0, Math.PI * 2)
      m.fill()
    } else {
      m.beginPath()
      m.moveTo(from.x * mask.width, from.y * mask.height)
      m.lineTo(to.x * mask.width, to.y * mask.height)
      m.stroke()
    }
    m.globalCompositeOperation = 'source-over'
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || disabled) return
    canvas.setPointerCapture(e.pointerId)
    const isPan = spaceDownRef.current || e.button === 1
    if (isPan) {
      panDragRef.current = { startX: e.clientX, startY: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
      return
    }
    if (showBaseRef.current) return
    const layerId = activeRef.current
    if (!isPaintable(layerId, layersRef.current)) return
    const rec = records.current.get(layerId!)
    if (!rec || !rec.mask) return

    // snapshot p/ undo
    pushUndo(layerId!, rec.mask)

    const t = getTransform()
    const p = toImageCoords(e.clientX, e.clientY)
    if (!p || !t) return
    const dpr = canvas.width / canvas.getBoundingClientRect().width
    const sizeImagePx = (brushSize * dpr) / t.scale
    paintingRef.current = { layerId: layerId!, mode: brushMode, sizeImagePx, last: null }
    stampSegment(rec.mask, null, p, brushMode, sizeImagePx)
    paintingRef.current.last = p
    rec.dirty = true
    scheduleRedraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    cursorRef.current = { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) }

    if (panDragRef.current) {
      const d = panDragRef.current
      const dpr = canvas.width / rect.width
      panRef.current = { x: d.panX + (e.clientX - d.startX) * dpr, y: d.panY + (e.clientY - d.startY) * dpr }
    } else if (paintingRef.current) {
      const pnt = paintingRef.current
      const rec = records.current.get(pnt.layerId)
      const p = toImageCoords(e.clientX, e.clientY)
      if (rec?.mask && p) {
        stampSegment(rec.mask, pnt.last, p, pnt.mode, pnt.sizeImagePx)
        pnt.last = p
      }
    }
    scheduleRedraw()
  }

  const endStroke = () => {
    panDragRef.current = null
    if (paintingRef.current) {
      paintingRef.current = null
      onPaint?.()
    }
    scheduleRedraw()
  }

  // ── Undo/redo ────────────────────────────────────────────────────────────────
  const pushUndo = (layerId: string, mask: HTMLCanvasElement) => {
    undoRef.current.push({ layerId, snap: snapshot(mask) })
    if (undoRef.current.length > UNDO_DEPTH) undoRef.current.shift()
    redoRef.current = []
    onHistoryChange?.()
  }

  // ── API imperativa ───────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    exportComposite: (format, quality = 0.92) => {
      const out = document.createElement('canvas')
      out.width = width
      out.height = height
      const octx = out.getContext('2d')
      if (!octx) return Promise.resolve(null)
      if (format === 'jpg') { octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, width, height) }
      try {
        composite(octx, { x: 0, y: 0, w: width, h: height }, false)
      } catch (err) {
        console.warn('[CanvasStage] export falhou (CORS/taint?)', err)
        return Promise.resolve(null)
      }
      return new Promise((resolve) => out.toBlob(resolve, format === 'jpg' ? 'image/jpeg' : 'image/png', quality))
    },
    exportThumbnail: (maxDim) => {
      const scale = Math.min(1, maxDim / Math.max(width, height))
      const tw = Math.max(1, Math.round(width * scale))
      const th = Math.max(1, Math.round(height * scale))
      const out = document.createElement('canvas')
      out.width = tw
      out.height = th
      const octx = out.getContext('2d')
      if (!octx) return Promise.resolve(null)
      octx.fillStyle = '#0a0a0a'
      octx.fillRect(0, 0, tw, th)
      try {
        composite(octx, { x: 0, y: 0, w: tw, h: th }, false)
      } catch {
        return Promise.resolve(null)
      }
      return new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.7))
    },
    getLayerMaskBlob: (layerId) => {
      const rec = records.current.get(layerId)
      if (!rec || !rec.mask || !rec.dirty) return Promise.resolve(null)
      // PNG: branco = visível sobre preto.
      const out = document.createElement('canvas')
      out.width = rec.mask.width
      out.height = rec.mask.height
      const octx = out.getContext('2d')
      if (!octx) return Promise.resolve(null)
      octx.fillStyle = '#000000'
      octx.fillRect(0, 0, out.width, out.height)
      octx.drawImage(rec.mask, 0, 0)
      return new Promise((resolve) => out.toBlob(resolve, 'image/png'))
    },
    hasMask: (layerId) => {
      const rec = records.current.get(layerId)
      return Boolean(rec?.mask && rec.dirty)
    },
    invertMask: (layerId) => {
      const rec = records.current.get(layerId)
      if (!rec?.mask) return
      pushUndo(layerId, rec.mask)
      invertMaskCanvas(rec.mask)
      rec.dirty = true
      scheduleRedraw()
    },
    clearMask: (layerId, fill) => {
      const rec = records.current.get(layerId)
      if (!rec?.mask) return
      pushUndo(layerId, rec.mask)
      fillMask(rec.mask, fill)
      rec.dirty = fill === 'empty'
      scheduleRedraw()
    },
    undo: () => {
      const item = undoRef.current.pop()
      if (!item) return
      const rec = records.current.get(item.layerId)
      if (rec?.mask) {
        redoRef.current.push({ layerId: item.layerId, snap: snapshot(rec.mask) })
        restore(rec.mask, item.snap)
        rec.dirty = true
      }
      onHistoryChange?.()
      scheduleRedraw()
    },
    redo: () => {
      const item = redoRef.current.pop()
      if (!item) return
      const rec = records.current.get(item.layerId)
      if (rec?.mask) {
        undoRef.current.push({ layerId: item.layerId, snap: snapshot(rec.mask) })
        restore(rec.mask, item.snap)
        rec.dirty = true
      }
      onHistoryChange?.()
      scheduleRedraw()
    },
    canUndo: () => undoRef.current.length > 0,
    canRedo: () => redoRef.current.length > 0,
    resetView: () => { zoomRef.current = 1; setZoom(1); panRef.current = { x: 0, y: 0 }; scheduleRedraw() },
    zoomPct: () => Math.round(zoomRef.current * 100),
  }), [composite, scheduleRedraw, width, height, onHistoryChange])

  const paintable = isPaintable(activeLayerId, layers) && !showBaseOnly
  const cursorStyle = disabled
    ? 'not-allowed'
    : spaceDownRef.current
      ? 'grab'
      : paintable
        ? 'none'
        : 'default'

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
        onPointerLeave={() => { cursorRef.current = null; endStroke() }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: cursorStyle }}
      />
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          Carregando imagens…
        </div>
      )}
    </div>
  )
})

// ── Helpers de máscara (módulo) ───────────────────────────────────────────────
function makeMaskCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

function fillMask(mask: HTMLCanvasElement, fill: 'full' | 'empty') {
  const ctx = mask.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, mask.width, mask.height)
  if (fill === 'full') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, mask.width, mask.height)
  }
}

function invertMaskCanvas(mask: HTMLCanvasElement) {
  const ctx = mask.getContext('2d')
  if (!ctx) return
  const id = ctx.getImageData(0, 0, mask.width, mask.height)
  const d = id.data
  for (let i = 3; i < d.length; i += 4) d[i] = 255 - d[i]
  ctx.putImageData(id, 0, 0)
}

/** Carrega um PNG (branco=visível) numa máscara alfa (branco opaco / preto transparente). */
function loadMaskInto(mask: HTMLCanvasElement, url: string, done: () => void) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    try {
      const tmp = document.createElement('canvas')
      tmp.width = img.naturalWidth
      tmp.height = img.naturalHeight
      const tctx = tmp.getContext('2d')
      if (!tctx) return
      tctx.drawImage(img, 0, 0)
      const id = tctx.getImageData(0, 0, tmp.width, tmp.height)
      const d = id.data
      for (let i = 0; i < d.length; i += 4) {
        const lum = d[i]
        d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = lum
      }
      tctx.putImageData(id, 0, 0)
      const mctx = mask.getContext('2d')
      if (!mctx) return
      mctx.clearRect(0, 0, mask.width, mask.height)
      mctx.drawImage(tmp, 0, 0, mask.width, mask.height)
      done()
    } catch {
      console.warn('[CanvasStage] máscara persistida indisponível (CORS)')
    }
  }
  img.src = url
}

function snapshot(c: HTMLCanvasElement): HTMLCanvasElement {
  const s = document.createElement('canvas')
  s.width = c.width
  s.height = c.height
  s.getContext('2d')?.drawImage(c, 0, 0)
  return s
}

function restore(mask: HTMLCanvasElement, snap: HTMLCanvasElement) {
  const ctx = mask.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, mask.width, mask.height)
  ctx.drawImage(snap, 0, 0)
}

function isPaintable(layerId: string | null, layers: Layer[]): boolean {
  if (!layerId) return false
  const l = layers.find((x) => x.id === layerId)
  return Boolean(l && !l.isBase && l.visible)
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isNaN(n) ? 1 : n))
}
