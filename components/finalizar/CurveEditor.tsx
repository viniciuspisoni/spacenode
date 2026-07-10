'use client'

// components/finalizar/CurveEditor.tsx — editor interativo da curva de
// luminosidade (curva de pontos, estilo Lightroom simplificado).
//
// Superfície simples: arraste pontos para ajustar tons, clique na curva para
// adicionar um ponto, duplo-clique remove. A suavização (Fritsch–Carlson) vem
// do mesmo curveToLut usado pelo motor — o que se vê aqui é exatamente o que
// o shader aplica.

import { useMemo, useRef, useState } from 'react'
import type { CurvePoint } from '@/lib/finalizar/types'
import { curveToLut } from '@/lib/finalizar/engine/color-math'
import { Chip } from '@/components/finalizar/ui'

const VW = 280
const VH = 200
/** Raio de acerto do ponteiro, em unidades do viewBox. */
const HIT_RADIUS = 10
/** Máximo de pontos na curva (inclui os dois extremos). */
const MAX_POINTS = 16
/** Folga mínima em x entre pontos vizinhos (0..1). */
const X_MARGIN = 0.01
/** Amostras da LUT usadas para desenhar o traçado suave. */
const LUT_SAMPLES = 128

function isIdentityCurve(points: CurvePoint[]): boolean {
  return points.length === 2
    && points[0].x === 0 && points[0].y === 0
    && points[1].x === 1 && points[1].y === 1
}

export interface CurveEditorProps {
  /** Pontos ordenados por x, em 0..1; primeiro/último são os extremos. */
  points: CurvePoint[]
  onChange: (points: CurvePoint[]) => void
  histogram?: { luma: Uint32Array; max: number } | null
}

export function CurveEditor({ points, onChange, histogram }: CurveEditorProps): React.ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const lut = useMemo(() => curveToLut(points, LUT_SAMPLES), [points])

  const curvePath = useMemo(() => {
    let d = ''
    for (let i = 0; i < LUT_SAMPLES; i++) {
      const x = (i / (LUT_SAMPLES - 1)) * VW
      const y = VH - (lut[i] / 255) * VH
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }
    return d
  }, [lut])

  const histPath = useMemo(() => {
    if (!histogram) return null
    const denom = Math.max(1, histogram.max)
    let d = `M0,${VH}`
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * VW
      const v = Math.min(1, histogram.luma[i] / denom)
      d += `L${x.toFixed(1)},${(VH - v * VH).toFixed(1)}`
    }
    return `${d}L${VW},${VH}Z`
  }, [histogram])

  /** Converte coordenadas do cliente para o espaço do viewBox. */
  function toView(e: { clientX: number; clientY: number }): { vx: number; vy: number } {
    const svg = svgRef.current
    if (!svg) return { vx: 0, vy: 0 }
    const r = svg.getBoundingClientRect()
    return {
      vx: ((e.clientX - r.left) / Math.max(1, r.width)) * VW,
      vy: ((e.clientY - r.top) / Math.max(1, r.height)) * VH,
    }
  }

  /** Índice do ponto mais próximo dentro do raio de acerto, ou null. */
  function hitPoint(vx: number, vy: number): number | null {
    let best: number | null = null
    let bestDist = HIT_RADIUS
    for (let i = 0; i < points.length; i++) {
      const dist = Math.hypot(points[i].x * VW - vx, (1 - points[i].y) * VH - vy)
      if (dist < bestDist) { bestDist = dist; best = i }
    }
    return best
  }

  function movePoint(idx: number, vx: number, vy: number): void {
    if (idx < 0 || idx >= points.length) return
    const y = Math.max(0, Math.min(1, 1 - vy / VH))
    let x = Math.max(0, Math.min(1, vx / VW))
    if (idx === 0) x = 0
    else if (idx === points.length - 1) x = 1
    else {
      const lo = points[idx - 1].x + X_MARGIN
      const hi = points[idx + 1].x - X_MARGIN
      x = Math.max(lo, Math.min(hi, x))
    }
    onChange(points.map((p, i) => (i === idx ? { x, y } : p)))
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>): void {
    if (e.button !== 0) return
    const { vx, vy } = toView(e)
    const svg = svgRef.current

    const hit = hitPoint(vx, vy)
    if (hit !== null) {
      setDragIdx(hit)
      setHoverIdx(hit)
      svg?.setPointerCapture(e.pointerId)
      return
    }

    // Clique na própria curva (longe de qualquer ponto) → adiciona um ponto ali.
    if (points.length >= MAX_POINTS) return
    const li = Math.max(0, Math.min(LUT_SAMPLES - 1, Math.round((vx / VW) * (LUT_SAMPLES - 1))))
    const curveVy = VH - (lut[li] / 255) * VH
    if (Math.abs(vy - curveVy) > HIT_RADIUS) return

    const nx = Math.max(0, Math.min(1, vx / VW))
    const ny = lut[li] / 255
    let insertAt = points.length
    for (let i = 0; i < points.length; i++) {
      if (nx < points[i].x) { insertAt = i; break }
    }
    // Extremos são fixos; respeita a folga mínima dos vizinhos.
    if (insertAt === 0 || insertAt === points.length) return
    if (nx - points[insertAt - 1].x < X_MARGIN || points[insertAt].x - nx < X_MARGIN) return

    onChange([...points.slice(0, insertAt), { x: nx, y: ny }, ...points.slice(insertAt)])
    setDragIdx(insertAt)
    setHoverIdx(insertAt)
    svg?.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>): void {
    const { vx, vy } = toView(e)
    if (dragIdx !== null) {
      movePoint(dragIdx, vx, vy)
      return
    }
    setHoverIdx(hitPoint(vx, vy))
  }

  function endDrag(e: React.PointerEvent<SVGSVGElement>): void {
    if (dragIdx === null) return
    setDragIdx(null)
    const svg = svgRef.current
    if (svg?.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId)
  }

  function handleDoubleClick(e: React.MouseEvent<SVGSVGElement>): void {
    const { vx, vy } = toView(e)
    const hit = hitPoint(vx, vy)
    if (hit === null || hit === 0 || hit === points.length - 1) return // extremos não saem
    onChange(points.filter((_, i) => i !== hit))
    setHoverIdx(null)
  }

  const identity = isIdentityCurve(points)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => { if (dragIdx === null) setHoverIdx(null) }}
        onDoubleClick={handleDoubleClick}
        style={{
          display: 'block', width: '100%', height: 'auto', aspectRatio: `${VW} / ${VH}`,
          background: 'var(--color-surface-subtle)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          touchAction: 'none', userSelect: 'none',
          cursor: dragIdx !== null ? 'grabbing' : hoverIdx !== null ? 'grab' : 'crosshair',
        }}
      >
        {/* Grade 4×4 sutil */}
        {[1, 2, 3].map((i) => (
          <line
            key={`gv${i}`}
            x1={(i * VW) / 4} y1={0} x2={(i * VW) / 4} y2={VH}
            style={{ stroke: 'var(--color-border)', strokeWidth: 0.5 }}
          />
        ))}
        {[1, 2, 3].map((i) => (
          <line
            key={`gh${i}`}
            x1={0} y1={(i * VH) / 4} x2={VW} y2={(i * VH) / 4}
            style={{ stroke: 'var(--color-border)', strokeWidth: 0.5 }}
          />
        ))}

        {/* Diagonal de referência (curva neutra) */}
        <line
          x1={0} y1={VH} x2={VW} y2={0}
          style={{ stroke: 'var(--color-border)', strokeWidth: 0.5, strokeDasharray: '3 3' }}
        />

        {/* Histograma de luminosidade atrás da curva */}
        {histPath && (
          <path d={histPath} style={{ fill: 'var(--color-text-quaternary)', opacity: 0.5 }} />
        )}

        {/* Curva suave (mesma LUT do motor) */}
        <path
          d={curvePath}
          style={{ fill: 'none', stroke: 'var(--color-text-primary)', strokeWidth: 1.5 }}
        />

        {/* Pontos de controle */}
        {points.map((p, i) => {
          const active = i === dragIdx || i === hoverIdx
          return (
            <circle
              key={i}
              cx={p.x * VW}
              cy={(1 - p.y) * VH}
              r={4.5}
              style={{
                fill: 'var(--color-bg-elevated)',
                stroke: active ? 'var(--color-accent-green)' : 'var(--color-text-primary)',
                strokeWidth: 1.5,
              }}
            />
          )
        })}
      </svg>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>
          Clique na curva para adicionar · duplo-clique remove
        </span>
        <Chip
          disabled={identity}
          onClick={() => onChange([{ x: 0, y: 0 }, { x: 1, y: 1 }])}
          title="Volta a curva ao estado original"
        >
          Redefinir
        </Chip>
      </div>
    </div>
  )
}
