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
//   cleanup      — pincel da área de remoção (overlay de aviso)
//   geometry     — corte interativo com alças + grade de terços
//   elements     — selecionar/mover/escalar/rotacionar; pincel de máscara
//
// Traços em coordenadas NORMALIZADAS da imagem (0–1) — resize-safe, herdado
// do modelo v1. Espaço = pan temporário; scroll = zoom no cursor.

import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from 'react'
import type {
  CropRect, ElementTransform, FinalizeDoc, LocalAdjustment, MaskShape, MaskStroke,
} from '@/lib/finalizar/types'
import { FinalizeRenderer } from '@/lib/finalizar/engine/renderer'
import { computeHistogram, type Histogram } from '@/lib/finalizar/engine/color-math'
import { computeSkyMask, MASK_SCALE, type LiveStroke } from '@/lib/finalizar/engine/masks'

const MIN_ZOOM = 1
const MAX_ZOOM = 8
const WORK_LONG_SIDE = 2304

export type ViewportTool = 'adjust' | 'color' | 'masks' | 'cleanup' | 'geometry' | 'elements'

export interface BrushSettings {
  /** Diâmetro em px de TELA. */
  size: number
  hardness: number
  flow: number
  erase: boolean
}

export type StrokeTarget = { kind: 'local'; id: string } | { kind: 'element'; id: string } | { kind: 'cleanup' }

export interface CanvasViewportHandle {
  fit(): void
  zoomBy(factor: number): void
  thumbnail(maxDim: number): Promise<Blob | null>
  resultHistogram(): Histogram | null
  /** Máscara de céu heurística (branco=céu) na resolução de máscara, ou null. */
  makeSkyMask(): HTMLCanvasElement | null
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
  showMaskOverlay: boolean
  cleanupStrokes: MaskStroke[]
  wbPicking: boolean
  onZoomChange: (pct: number) => void
  onStrokeCommit: (target: StrokeTarget, stroke: MaskStroke) => void
  onShapeChange: (localId: string, shape: MaskShape) => void
  onElementChange: (id: string, t: ElementTransform, commit: boolean) => void
  onCropChange: (crop: CropRect) => void
  onPickWb: (rgb: [number, number, number]) => void
  onSelectElement: (id: string | null) => void
  onError: (msg: string) => void
  /** Disparado quando a imagem base termina de carregar (histograma etc.). */
  onBaseReady?: () => void
}

type DragState =
  | { kind: 'pan'; pointerId: number; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'stroke'; pointerId: number; target: StrokeTarget; stroke: LiveStroke }
  | { kind: 'shape'; pointerId: number; localId: string; shapeKind: 'linear' | 'radial'; start: { x: number; y: number } }
  | { kind: 'crop'; pointerId: number; mode: string; start: { x: number; y: number }; crop0: CropRect; ratio: number | null }
  | { kind: 'element-move'; pointerId: number; id: string; start: { x: number; y: number }; t0: ElementTransform }
  | { kind: 'element-scale'; pointerId: number; id: string; t0: ElementTransform; center: { x: number; y: number }; startDist: number }
  | { kind: 'element-rotate'; pointerId: number; id: string; t0: ElementTransform; center: { x: number; y: number }; startAngle: number }

export const CanvasViewport = forwardRef<CanvasViewportHandle, Props>(function CanvasViewport(props, ref) {
  const {
    doc, tool, activeLocalId, activeElementId, brush, maskInteraction, elementMaskMode,
    compare, showMaskOverlay, cleanupStrokes, wbPicking,
    onZoomChange, onStrokeCommit, onShapeChange, onElementChange, onCropChange,
    onPickWb, onSelectElement, onError,
  } = props

  const containerRef = useRef<HTMLDivElement | null>(null)
  const screenRef = useRef<HTMLCanvasElement | null>(null)
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<FinalizeRenderer | null>(null)
  const baseImgRef = useRef<HTMLImageElement | null>(null)
  const [baseReady, setBaseReady] = useState(false)
  const [glOk, setGlOk] = useState(true)

  const docRef = useRef(doc)
  const propsRef = useRef(props)
  docRef.current = doc
  propsRef.current = props

  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
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
      setBaseReady(true)
      scheduleDraw()
      propsRef.current.onBaseReady?.()
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

    if (p.compare && baseImgRef.current) {
      const img = baseImgRef.current
      ctx.drawImage(
        img,
        v.vis.x * img.naturalWidth, v.vis.y * img.naturalHeight,
        v.vis.w * img.naturalWidth, v.vis.h * img.naturalHeight,
        v.ox, v.oy, dw, dh,
      )
    } else {
      ctx.drawImage(
        glCanvas,
        v.vis.x * glCanvas.width, v.vis.y * glCanvas.height,
        v.vis.w * glCanvas.width, v.vis.h * glCanvas.height,
        v.ox, v.oy, dw, dh,
      )
    }

    // ── overlays ──
    if (!p.compare) {
      if (p.tool === 'masks' && p.showMaskOverlay && p.activeLocalId) {
        const local = d.locals.find((l) => l.id === p.activeLocalId)
        if (local) drawMaskOverlay(ctx, v, local)
      }
      if (p.tool === 'cleanup' && (p.cleanupStrokes.length > 0 || dragRef.current?.kind === 'stroke')) {
        drawCleanupOverlay(ctx, v)
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

  // overlays dependem de props de UI
  useEffect(() => {
    scheduleDraw()
  }, [tool, activeLocalId, activeElementId, compare, showMaskOverlay, cleanupStrokes, elementMaskMode, wbPicking, brush, scheduleDraw])

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
    const key = `${local.id}|${JSON.stringify(local.shape)}|${local.strokes.length}|${local.invert}|${mw}`
    let tint = maskTintCache.current?.key === key ? maskTintCache.current.canvas : null
    if (!tint) {
      const analytic = local.shape.kind === 'linear' || local.shape.kind === 'radial' || local.shape.kind === 'luminosity'
        ? analyticShapeCanvas(local, mw, mh)
        : null
      const solved = renderer.masks.solvedLocalMaskPng(local, d.width, d.height, analytic)
      // branco=selecionado → verde translúcido
      tint = document.createElement('canvas')
      tint.width = solved.width
      tint.height = solved.height
      const tctx = tint.getContext('2d')!
      tctx.drawImage(solved, 0, 0)
      tctx.globalCompositeOperation = 'multiply'
      tctx.fillStyle = accentGreen()
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

  function drawCleanupOverlay(ctx: CanvasRenderingContext2D, v: ViewTransform) {
    const renderer = rendererRef.current
    const d = docRef.current
    if (!renderer) return
    const drag = dragRef.current
    const live = drag?.kind === 'stroke' && drag.target.kind === 'cleanup' ? drag.stroke : null
    const pseudo: LocalAdjustment = {
      id: '__cleanup__', name: '', enabled: true, invert: false,
      shape: { kind: 'brush' }, strokes: propsRef.current.cleanupStrokes,
      values: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0, clarity: 0, sharpness: 0 },
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
    for (let i = 0; i < dt.length; i += 4) {
      const add = dt[i]
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
    const painting =
      (p.tool === 'masks' && p.activeLocalId && p.maskInteraction === 'brush')
      || p.tool === 'cleanup'
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
    ctx.strokeStyle = p.brush.erase ? 'rgba(255,255,255,0.95)' : p.tool === 'cleanup' ? 'rgba(224,88,74,0.95)' : accentGreen()
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
      case 'cleanup':
        startStroke(e, { kind: 'cleanup' })
        return
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
        if (drag.target.kind === 'cleanup') {
          // overlay 2D é redesenhado; motor não precisa
        } else {
          needsGlRef.current = true
        }
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
  }), [baseReady, glOk, onZoomChange, scheduleDraw])

  // ── Cursor CSS ───────────────────────────────────────────────────────────

  const painting =
    (tool === 'masks' && activeLocalId && maskInteraction === 'brush')
    || tool === 'cleanup'
    || (tool === 'elements' && activeElementId && elementMaskMode)
  const cursorStyle = wbPicking
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
