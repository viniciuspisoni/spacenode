'use client'

import { useCallback, useRef, useState } from 'react'
import Image, { type StaticImageData } from 'next/image'

// Comparador antes/depois — fonte única. Antes vivia duplicado no Demo
// (grande, com teclado) e na Gallery (pequeno, só ponteiro); aqui é um só,
// e o tamanho é só uma variante.
//
// O `before` leva um tratamento leve (contraste/saturação/blur de 0.4px)
// para ler como MODELO e não como foto: sem isso, em miniatura, os dois
// lados parecem dois renders e a comparação perde o argumento.

type Src = string | StaticImageData

export function BeforeAfter({
  before,
  after,
  size = 'sm',
  priority = false,
  sizes,
  caption,
}: {
  before: Src
  after: Src
  size?: 'sm' | 'lg'
  priority?: boolean
  sizes: string
  caption?: string
}) {
  const [pos, setPos] = useState(50)
  const frameRef = useRef<HTMLDivElement>(null)
  const lg = size === 'lg'

  const update = useCallback((clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos(Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100)))
  }, [])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const delta = e.key === 'ArrowLeft' ? -5 : 5
    setPos(p => Math.max(2, Math.min(98, p + delta)))
  }, [])

  return (
    <div
      ref={frameRef}
      className="spn-ba"
      data-lg={lg}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); update(e.clientX) }}
      onPointerMove={e => { if (e.buttons > 0) update(e.clientX) }}
      onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="slider"
      aria-label={caption ? `Comparar modelo e render — ${caption}` : 'Comparar modelo e render'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos)}
    >
      <Image
        src={before}
        alt="Imagem base — modelo do projeto"
        fill
        draggable={false}
        sizes={sizes}
        {...(priority ? { preload: true } : {})}
        style={{
          objectFit: 'cover',
          pointerEvents: 'none',
          filter: 'contrast(0.9) saturate(0.9) brightness(0.95) blur(0.4px)',
        }}
      />
      <Image
        src={after}
        alt="Resultado SpaceNode — render fotorrealista"
        fill
        draggable={false}
        sizes={sizes}
        {...(priority ? { preload: true } : {})}
        style={{
          objectFit: 'cover',
          pointerEvents: 'none',
          clipPath: `inset(0 0 0 ${pos}%)`,
          filter: 'contrast(1.05) saturate(1.05)',
        }}
      />

      <div className="spn-ba-divider" style={{ left: `${pos}%` }}>
        <span className="spn-ba-handle">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
            <path d="M0.5 4h9M3 1.5 0.5 4 3 6.5M7 1.5 9.5 4 7 6.5" stroke="#1a1a1a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      <span className="spn-ba-tag spn-ba-tag--left">base</span>
      <span className="spn-ba-tag spn-ba-tag--right">resultado</span>
      {caption && <span className="spn-ba-caption">{caption}</span>}

      <style jsx>{`
        .spn-ba {
          position: relative;
          aspect-ratio: 4 / 3;
          overflow: hidden;
          border-radius: var(--r-inner);
          cursor: col-resize;
          user-select: none;
          touch-action: pan-y;
          background: var(--color-preview-bg);
        }
        .spn-ba[data-lg='true'] {
          aspect-ratio: 16 / 10;
          border-radius: var(--r-card);
        }
        .spn-ba:focus-visible {
          outline: 1.5px solid var(--border-focus, var(--color-border-focus));
          outline-offset: 2px;
        }
        .spn-ba-divider {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 1.5px;
          background: #fff;
          transform: translateX(-50%);
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.5), 0 0 3px rgba(255, 255, 255, 1);
          pointer-events: none;
        }
        .spn-ba-handle {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2), 0 2px 12px rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .spn-ba[data-lg='true'] .spn-ba-handle {
          width: 34px;
          height: 34px;
        }
        /* Etiquetas e legenda vão sobre IMAGEM — o véu é sempre escuro,
           independente do tema (regra do design system). */
        .spn-ba-tag,
        .spn-ba-caption {
          position: absolute;
          bottom: 8px;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.82);
          background: var(--color-scrim);
          -webkit-backdrop-filter: blur(6px);
          backdrop-filter: blur(6px);
          padding: 4px 8px;
          border-radius: 5px;
          pointer-events: none;
        }
        .spn-ba-tag--left { left: 8px; }
        .spn-ba-tag--right { right: 8px; }
        .spn-ba-caption {
          top: 8px;
          bottom: auto;
          left: 8px;
          letter-spacing: 0.1em;
        }
        .spn-ba[data-lg='true'] .spn-ba-tag,
        .spn-ba[data-lg='true'] .spn-ba-caption {
          bottom: 12px;
          font-size: 10px;
        }
        .spn-ba[data-lg='true'] .spn-ba-tag--left { left: 12px; }
        .spn-ba[data-lg='true'] .spn-ba-tag--right { right: 12px; }
        .spn-ba[data-lg='true'] .spn-ba-caption { top: 12px; left: 12px; }
      `}</style>
    </div>
  )
}
