'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

// O primeiro render vem do acervo selecionado pelo dono para o carrossel;
// os demais já estão publicados na galeria da landing.
const slides = [
  { src: '/cliente-nathalia-apartamento-integrado.jpg', scene: 'Apartamento integrado', credit: 'Nathalia Costa' },
  { src: '/proj-sala-jantar-render.jpg', scene: 'Sala de jantar', credit: 'Paula Miolla' },
  { src: '/proj-living-jantar-render.jpg', scene: 'Living integrado', credit: 'Bruna Plentz' },
  { src: '/proj-cozinha-ilha-render.jpg', scene: 'Cozinha com ilha', credit: 'Nathalia Costa' },
] as const

export default function FinalCTA() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (paused || reducedMotion) return
    const timer = window.setInterval(() => {
      if (!document.hidden) setActive(index => (index + 1) % slides.length)
    }, 5500)
    return () => window.clearInterval(timer)
  }, [paused, reducedMotion, active])

  return (
    <section
      id="fecho"
      className="spn-final"
      data-cta-position="final"
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
      }}
    >
      <div className="spn-final-media">
        {slides.map((slide, index) => (
          <div
            key={slide.src}
            className={`spn-final-slide${index === active ? ' is-active' : ''}`}
            aria-hidden={index !== active}
          >
            <Image
              src={slide.src}
              alt={index === active ? slide.scene : ''}
              fill
              sizes="100vw"
              loading="lazy"
              style={{ objectFit: 'cover', objectPosition: 'center center' }}
            />
          </div>
        ))}
      </div>
      <div className="spn-final-veil" />

      <div className="spn-final-copy">
        <span className="spn-final-eyebrow">
          <span className="spn-final-dot" />
          próximo projeto
        </span>

        <h2 className="spn-final-title">
          Tem um projeto para apresentar?{' '}
          <span className="spn-final-title-dim">Faça o primeiro teste com ele.</span>
        </h2>

        <div className="spn-final-ctas">
          <a href="/login?mode=signup&next=%2Fapp%2Fgenerate" className="spn-final-primary">
            Testar no meu projeto grátis
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        <p className="spn-final-microcopy">80 Nodes grátis · sem cartão · planos a partir de R$ 99/mês</p>
      </div>

      <div className="spn-final-gallery" aria-label="Projetos de usuários SpaceNode">
        <p className="spn-final-credit">{slides[active].scene} <span>· {slides[active].credit}</span></p>
        <div
          className="spn-final-controls"
          role="group"
          aria-label="Escolher projeto"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {slides.map((slide, index) => (
            <button
              key={slide.src}
              type="button"
              className={`spn-final-dot-button${index === active ? ' is-active' : ''}`}
              aria-label={`Mostrar ${slide.scene}, projeto de ${slide.credit}`}
              aria-current={index === active ? 'true' : undefined}
              onClick={() => setActive(index)}
            >
              <span />
            </button>
          ))}
        </div>
      </div>

      <style jsx>{`
        .spn-final {
          position: relative;
          z-index: 1;
          isolation: isolate;
          min-height: 880px;
          display: flex;
          justify-content: center;
          padding: 80px 24px 0;
          overflow: hidden;
        }
        .spn-final-media {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 64%;
          z-index: 0;
        }
        .spn-final-slide {
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 900ms ease;
        }
        .spn-final-slide.is-active { opacity: 1; }
        .spn-final-veil {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: linear-gradient(
            180deg,
            var(--color-bg) 0%,
            var(--color-bg) 42%,
            rgba(10, 10, 10, 0.58) 52%,
            rgba(10, 10, 10, 0.12) 64%,
            rgba(10, 10, 10, 0.12) 88%,
            var(--color-bg) 100%
          );
        }
        .spn-final-copy {
          position: relative;
          z-index: 2;
          text-align: center;
          max-width: 680px;
          align-self: flex-start;
        }
        .spn-final-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 18px;
        }
        .spn-final-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--color-accent);
          box-shadow: 0 0 8px var(--color-accent-glow);
        }
        .spn-final-title {
          font-size: clamp(28px, 4.6vw, 44px);
          font-weight: 300;
          letter-spacing: -0.04em;
          line-height: 1.12;
          margin: 0 auto 34px;
          color: var(--color-text-primary);
        }
        .spn-final-title-dim { color: var(--color-text-tertiary); }
        .spn-final-ctas {
          display: flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .spn-final-primary,
        .spn-final-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: var(--r-inner);
          text-decoration: none;
          font-weight: 500;
          letter-spacing: -0.01em;
          min-height: 52px;
          transition: transform 200ms var(--ease), box-shadow 200ms var(--ease),
            color 200ms var(--ease), border-color 200ms var(--ease);
        }
        .spn-final-primary {
          padding: 15px 28px;
          font-size: 14px;
          background: var(--color-inverse);
          color: var(--color-inverse-foreground);
          box-shadow: var(--shadow-float);
        }
        .spn-final-primary:hover { transform: translateY(-1px); }
        .spn-final-secondary {
          padding: 15px 22px;
          font-size: 13px;
          color: var(--color-text-secondary);
        }
        .spn-final-secondary:hover {
          color: var(--color-text-primary);
          border-color: var(--glass-line-strong);
        }
        .spn-final-primary:focus-visible,
        .spn-final-secondary:focus-visible {
          outline: 1.5px solid var(--color-border-focus);
          outline-offset: 2px;
        }
        .spn-final-microcopy {
          font-size: 12px;
          color: var(--color-text-tertiary);
          margin: 0;
        }
        .spn-final-gallery {
          position: absolute;
          z-index: 2;
          left: 24px;
          right: 24px;
          bottom: 9%;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
        }
        .spn-final-credit {
          margin: 0;
          color: #fff;
          font-size: 12px;
          line-height: 1.5;
          text-shadow: 0 1px 8px #000, 0 1px 2px #000;
        }
        .spn-final-credit span { color: rgba(255,255,255,.8); }
        .spn-final-controls { display: flex; gap: 4px; }
        .spn-final-dot-button {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border: 0;
          background: transparent;
          cursor: pointer;
        }
        .spn-final-dot-button span {
          width: 18px;
          height: 3px;
          border-radius: 2px;
          background: rgba(255,255,255,.45);
          box-shadow: 0 1px 5px #000;
          transition: background 200ms ease;
        }
        .spn-final-dot-button.is-active span,
        .spn-final-dot-button:hover span { background: #fff; }
        .spn-final-dot-button:focus-visible {
          outline: 2px solid #fff;
          outline-offset: 2px;
          border-radius: 4px;
        }

        @media (max-width: 768px) {
          .spn-final {
            min-height: 720px;
            padding: 56px 20px 0;
          }
          /* Os CTAs empilham no mobile: o bloco de texto desce até ~45% da
             seção, contra ~38% no desktop. Sem este degradê próprio, a
             microcopy cairia em cima do render. */
          .spn-final-veil {
            background: linear-gradient(
              180deg,
              var(--color-bg) 0%,
              var(--color-bg) 50%,
              rgba(10, 10, 10, 0.55) 60%,
              rgba(10, 10, 10, 0.12) 70%,
              rgba(10, 10, 10, 0.12) 90%,
              var(--color-bg) 100%
            );
          }
          .spn-final-title { font-size: 27px; margin-bottom: 26px; }
          .spn-final-gallery { left: 20px; right: 20px; bottom: 11%; align-items: center; }
          .spn-final-credit { max-width: 55%; }
          .spn-final-ctas {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .spn-final-primary,
          .spn-final-secondary {
            width: 100%;
            padding: 16px 22px;
            font-size: 15px;
            min-height: 54px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-final-slide { transition: none; }
          .spn-final-primary,
          .spn-final-secondary { transition: none; }
          .spn-final-primary:hover { transform: none; }
        }
      `}</style>
    </section>
  )
}
