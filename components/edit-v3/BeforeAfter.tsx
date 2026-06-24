'use client'

// BeforeAfter — comparador antes/depois (cortina por pointer events, aspecto
// real). Copiado do padrão validado do Editar (auto-contido, sem dependências).

import { useRef, useState } from 'react'

export function BeforeAfter({ before, after, aspect }: { before: string; after: string; aspect: number }) {
  const [pos, setPos] = useState(50)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef(false)

  const move = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={e => {
        dragRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e.clientX)
      }}
      onPointerMove={e => dragRef.current && move(e.clientX)}
      onPointerUp={() => (dragRef.current = false)}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: String(aspect),
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'ew-resize',
        userSelect: 'none',
        background: '#0a0a0a',
        touchAction: 'none',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt="depois" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt="antes" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 2, background: 'rgba(255,255,255,0.9)', transform: 'translateX(-1px)' }} />
      <span style={cornerLabel('left')}>antes</span>
      <span style={cornerLabel('right')}>depois</span>
    </div>
  )
}

function cornerLabel(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    bottom: 10,
    [side]: 12,
    fontSize: 11,
    letterSpacing: '0.06em',
    color: 'rgba(255,255,255,0.85)',
    background: 'rgba(0,0,0,0.45)',
    padding: '3px 8px',
    borderRadius: 6,
  }
}
