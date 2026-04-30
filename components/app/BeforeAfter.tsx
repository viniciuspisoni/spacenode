'use client'

import { useState, useRef, useCallback } from 'react'

interface BeforeAfterProps {
  beforeUrl: string
  afterUrl: string
  beforeLabel?: string
  afterLabel?: string
}

export default function BeforeAfter({
  beforeUrl,
  afterUrl,
  beforeLabel = 'ANTES',
  afterLabel = 'DEPOIS',
}: BeforeAfterProps) {
  const [pos, setPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)

  const updatePos = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const next = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100))
    setPos(next)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[4/3] overflow-hidden rounded-2xl select-none cursor-col-resize"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        updatePos(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0) updatePos(e.clientX)
      }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
    >
      {/* Before — visually softened to read as "raw" */}
      <img
        src={beforeUrl}
        alt="antes"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'contrast(0.9) saturate(0.9) brightness(0.95) blur(0.4px)' }}
        draggable={false}
      />

      {/* After — crisp and premium */}
      <img
        src={afterUrl}
        alt="depois"
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          clipPath: `inset(0 ${100 - pos}% 0 0)`,
          filter: 'contrast(1.05) saturate(1.05)',
        }}
        draggable={false}
      />

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-px bg-white shadow-[0_0_10px_rgba(255,255,255,0.6),0_0_3px_rgba(255,255,255,1)]"
        style={{ left: `${pos}%` }}
      >
        {/* Handle — larger with glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_4px_20px_rgba(0,0,0,0.4)] flex items-center justify-center pointer-events-none">
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
            <path
              d="M1 6h14M5 2 1 6l4 4M11 2l4 4-4 4"
              stroke="#1a1a1a"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* ANTES label — bottom-left, low opacity */}
      <span className="absolute bottom-3 left-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40 pointer-events-none">
        {beforeLabel}
      </span>

      {/* DEPOIS label — bottom-right, stronger */}
      <span className="absolute bottom-3 right-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/80 pointer-events-none">
        {afterLabel}
      </span>
    </div>
  )
}
