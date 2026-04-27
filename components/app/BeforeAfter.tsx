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
      {/* Before — full width, always visible */}
      <img
        src={beforeUrl}
        alt="antes"
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* After — clipped from right */}
      <img
        src={afterUrl}
        alt="depois"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
      />

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-px bg-white/80 shadow-[0_0_6px_rgba(0,0,0,0.5)]"
        style={{ left: `${pos}%` }}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center pointer-events-none">
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path
              d="M1 5h12M5 1 1 5l4 4M9 1l4 4-4 4"
              stroke="#1a1a1a"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <span className="absolute top-3 left-3 text-[10px] font-medium uppercase tracking-[0.15em] text-white/80 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full pointer-events-none">
        {beforeLabel}
      </span>
      <span className="absolute top-3 right-3 text-[10px] font-medium uppercase tracking-[0.15em] text-white/80 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full pointer-events-none">
        {afterLabel}
      </span>
    </div>
  )
}
