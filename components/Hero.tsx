'use client'

import sketchImg from '@/public/demo-sketch.jpg'
import renderImg from '@/public/demo-render.jpg'
import { BeforeAfter } from '@/components/landing/BeforeAfter'

// Hero da landing em vidro. O antes/depois — que antes era uma seção
// separada logo abaixo — subiu para cá: é a prova mais forte da promessa do
// título ("respeita seu projeto"), e a landing economiza uma seção inteira.
export default function Hero() {
  return (
    <section className="spn-hero">
      <div className="spn-hero-copy">
        <a href="#sketchup" className="spn-hero-badge spn-glass--raised">
          <span className="spn-hero-badge-dot" />
          novo · plugin oficial para SketchUp
        </a>

        <h1 className="spn-hero-title">
          Visualização arquitetônica{' '}
          <span className="spn-hero-title-dim">que respeita seu projeto.</span>
        </h1>

        <p className="spn-hero-sub">
          Do print do modelo ao render fotorrealista — com geometria,
          proporções e intenção do projeto preservadas.
        </p>

        <div className="spn-hero-ctas">
          <a href="/login?mode=signup" className="spn-hero-primary">
            Testar grátis
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href="#projetos" className="spn-hero-secondary spn-glass--raised">
            Ver projetos reais
          </a>
        </div>

        <p className="spn-hero-microcopy">80 nodes grátis · sem cartão · em português</p>
      </div>

      <figure className="spn-hero-frame spn-glass">
        <BeforeAfter
          before={sketchImg}
          after={renderImg}
          size="lg"
          priority
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 92vw, 1000px"
        />
        <figcaption className="spn-hero-figcaption">
          mesma geometria · arraste para comparar
        </figcaption>
      </figure>

      <style jsx>{`
        .spn-hero {
          position: relative;
          z-index: 1;
          padding: 108px 24px 72px;
          max-width: 1080px;
          margin: 0 auto;
        }
        .spn-hero-copy {
          text-align: center;
          max-width: 720px;
          margin: 0 auto 40px;
        }
        .spn-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px 6px 11px;
          border-radius: var(--radius-full);
          font-size: 11.5px;
          font-weight: 500;
          letter-spacing: -0.005em;
          color: var(--color-text-secondary);
          text-decoration: none;
          margin-bottom: 26px;
          transition: color 200ms var(--ease), border-color 200ms var(--ease);
        }
        .spn-hero-badge:hover {
          color: var(--color-text-primary);
          border-color: var(--glass-line-strong);
        }
        .spn-hero-badge-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--color-accent-green);
          box-shadow: 0 0 8px var(--color-accent-green-glow);
        }
        .spn-hero-title {
          font-size: clamp(36px, 5.6vw, 58px);
          font-weight: 300;
          letter-spacing: -0.045em;
          line-height: 1.05;
          margin: 0 auto 20px;
          max-width: 680px;
          color: var(--color-text-primary);
        }
        .spn-hero-title-dim { color: var(--color-text-tertiary); }
        .spn-hero-sub {
          font-size: 16px;
          color: var(--color-text-secondary);
          line-height: 1.55;
          letter-spacing: -0.01em;
          margin: 0 auto 30px;
          max-width: 490px;
        }
        .spn-hero-ctas {
          display: flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .spn-hero-primary,
        .spn-hero-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: var(--r-inner);
          text-decoration: none;
          white-space: nowrap;
          letter-spacing: -0.01em;
          font-weight: 500;
          min-height: 52px;
          padding: 15px 28px;
          font-size: 14px;
          transition: transform 200ms var(--ease), box-shadow 200ms var(--ease),
            color 200ms var(--ease), border-color 200ms var(--ease);
        }
        .spn-hero-primary {
          background: var(--color-inverse);
          color: var(--color-inverse-foreground);
          box-shadow: var(--shadow-float);
        }
        .spn-hero-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        .spn-hero-secondary {
          color: var(--color-text-secondary);
          padding: 15px 22px;
          font-size: 13px;
        }
        .spn-hero-secondary:hover {
          color: var(--color-text-primary);
          border-color: var(--glass-line-strong);
        }
        .spn-hero-primary:focus-visible,
        .spn-hero-secondary:focus-visible,
        .spn-hero-badge:focus-visible {
          outline: 1.5px solid var(--color-border-focus);
          outline-offset: 2px;
        }
        .spn-hero-microcopy {
          font-size: 12px;
          color: var(--color-text-tertiary);
          margin: 0;
        }

        /* A moldura é o vidro; o comparador é o conteúdo que passa por trás
           da borda. O padding de 10px é o que deixa a aresta especular
           visível em volta da imagem. */
        .spn-hero-frame {
          position: relative;
          margin: 0;
          padding: 10px;
          border-radius: calc(var(--r-card) + 10px);
          box-shadow: var(--shadow-float);
        }
        .spn-hero-figcaption {
          display: block;
          text-align: center;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          padding: 12px 0 4px;
        }

        @media (max-width: 768px) {
          .spn-hero { padding: 84px 16px 48px; }
          .spn-hero-copy { margin-bottom: 28px; }
          .spn-hero-badge { font-size: 11px; margin-bottom: 20px; }
          .spn-hero-title {
            font-size: clamp(32px, 9vw, 44px);
            margin-bottom: 16px;
          }
          .spn-hero-sub { font-size: 15px; margin-bottom: 26px; }
          .spn-hero-ctas {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .spn-hero-primary,
          .spn-hero-secondary {
            width: 100%;
            padding: 16px 22px;
            font-size: 15px;
            min-height: 54px;
          }
          .spn-hero-frame { padding: 7px; border-radius: calc(var(--r-card) + 7px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-hero-primary,
          .spn-hero-secondary,
          .spn-hero-badge { transition: none; }
          .spn-hero-primary:hover { transform: none; }
        }
      `}</style>
    </section>
  )
}
