'use client'
import { useState, useRef, useCallback } from 'react'

const transformations = [
  { before: '/gallery-banheiro-before.jpg',    after: '/gallery-banheiro-after.jpg',    caption: 'Interior · Banheiro' },
  { before: '/gallery-comercial-after.jpg',    after: '/gallery-comercial-before.jpg',  caption: 'Comercial · Fachada urbana' },
  { before: '/gallery-living-before.jpg',      after: '/gallery-living-after.jpg',      caption: 'Interior · Sala de estar' },
  { before: '/gallery-casa-after.jpg',          after: '/gallery-casa-before.jpg',        caption: 'Residencial · Casa contemporânea' },
  { before: '/gallery-coworking-before.jpg',   after: '/gallery-coworking-after.jpg',   caption: 'Coworking' },
  { before: '/gallery-industrial-before.jpg',  after: '/gallery-industrial-after.jpg',  caption: 'Comercial · Interior industrial' },
]

function MiniBeforeAfter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)

  const updatePos = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setPos(Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100)))
  }, [])

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); updatePos(e.clientX) }}
      onPointerMove={(e) => { if (e.buttons > 0) updatePos(e.clientX) }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      style={{
        position: 'relative',
        aspectRatio: '4/3',
        overflow: 'hidden',
        cursor: 'col-resize',
        userSelect: 'none',
        background: 'var(--color-surface)',
      }}
    >
      <img
        src={before}
        alt="antes"
        draggable={false}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%', objectFit: 'cover',
          filter: 'contrast(0.9) saturate(0.9) brightness(0.95) blur(0.4px)',
          pointerEvents: 'none',
        }}
      />
      <img
        src={after}
        alt="depois"
        draggable={false}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%', objectFit: 'cover',
          clipPath: `inset(0 ${100 - pos}% 0 0)`,
          filter: 'contrast(1.05) saturate(1.05)',
          pointerEvents: 'none',
        }}
      />

      {/* Divider */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: `${pos}%`, width: 1.5,
        background: '#ffffff',
        transform: 'translateX(-50%)',
        boxShadow: '0 0 8px rgba(255,255,255,0.5), 0 0 3px rgba(255,255,255,1)',
        pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 26, height: 26, borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.2), 0 2px 12px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M0.5 4h9M3 1.5 0.5 4 3 6.5M7 1.5 9.5 4 7 6.5" stroke="#1a1a1a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Labels */}
      <span style={{
        position: 'absolute', bottom: 10, left: 10,
        fontSize: 8, fontWeight: 600, letterSpacing: '0.18em',
        textTransform: 'uppercase' as const,
        color: 'rgba(255,255,255,0.32)', pointerEvents: 'none',
      }}>
        antes
      </span>
      <span style={{
        position: 'absolute', bottom: 10, right: 10,
        fontSize: 8, fontWeight: 600, letterSpacing: '0.18em',
        textTransform: 'uppercase' as const,
        color: 'rgba(255,255,255,0.88)',
        textShadow: '0 0 8px rgba(255,255,255,0.25)',
        pointerEvents: 'none',
      }}>
        depois
      </span>
    </div>
  )
}

export default function Gallery() {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)

  return (
    <section id="galeria" className="spn-gallery">
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        <div className="spn-gallery-head">
          <div style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.22em',
            textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)',
            marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
            Galeria
            <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          </div>
          <h2 className="spn-gallery-title">
            Projetos reais. Resultados reais.
          </h2>
          <p className="spn-gallery-sub">
            Gerados na SpaceNode por arquitetos e designers. Sem pós-produção.
          </p>
        </div>

        <div className="spn-gallery-grid">
          {transformations.map((t, i) => (
            <div
              key={i}
              onMouseEnter={() => setHoveredCard(i)}
              onMouseLeave={() => setHoveredCard(null)}
              className="spn-gallery-card"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                overflow: 'hidden',
                transform: hoveredCard === i ? 'translateY(-2px)' : 'translateY(0)',
                boxShadow: hoveredCard === i ? '0 8px 32px rgba(0,0,0,0.3)' : 'none',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              <MiniBeforeAfter before={t.before} after={t.after} />
              <div className="spn-gallery-caption">
                {t.caption}
              </div>
            </div>
          ))}
        </div>

      </div>

      <style jsx>{`
        .spn-gallery {
          padding: 100px 48px;
          border-top: 0.5px solid var(--color-border);
        }
        .spn-gallery-head {
          text-align: center;
          max-width: 600px;
          margin: 0 auto 64px;
        }
        .spn-gallery-title {
          font-size: clamp(24px, 4.5vw, 38px);
          font-weight: 400;
          letter-spacing: -0.04em;
          margin: 0 0 16px;
          line-height: 1.15;
          color: var(--color-text-primary);
        }
        .spn-gallery-sub {
          font-size: 15px;
          color: var(--color-text-secondary);
          line-height: 1.55;
        }
        .spn-gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        .spn-gallery-caption {
          padding: 12px 16px;
          font-size: 11px;
          color: var(--color-text-tertiary);
          letter-spacing: -0.005em;
          border-top: 0.5px solid rgba(255,255,255,0.06);
        }

        @media (max-width: 768px) {
          .spn-gallery {
            padding: 72px 20px;
          }
          .spn-gallery-head {
            margin: 0 auto 36px;
          }
          .spn-gallery-title {
            font-size: 24px;
          }
          .spn-gallery-sub {
            font-size: 14px;
          }
          .spn-gallery-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .spn-gallery-caption {
            padding: 12px 14px;
            font-size: 12px;
          }
        }
      `}</style>
    </section>
  )
}
