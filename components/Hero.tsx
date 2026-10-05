'use client'

import { BeforeAfter } from '@/components/landing/BeforeAfter'
import { SELLABLE_PLANS } from '@/lib/plans'

export default function Hero() {
  return (
    <section className="spn-hero" data-cta-position="hero">
      <div className="spn-hero-copy">
        <span className="spn-hero-badge spn-glass--raised">Para arquitetos e designers de interiores</span>
        <h1 className="spn-hero-title">Seu projeto está pronto. Falta a imagem para apresentar.</h1>
        <p className="spn-hero-sub">
          Transforme um print do SketchUp em uma imagem para a apresentação ao cliente.
          Compare com o original e teste no projeto em que você já está trabalhando.
        </p>
        <a href="/login?mode=signup&next=%2Fapp%2Fgenerate" className="spn-hero-primary">
          Testar no meu projeto grátis
          <span aria-hidden="true">→</span>
        </a>
        <p className="spn-hero-note">80 Nodes grátis · sem cartão · em português</p>
        <p className="spn-hero-price">Para continuar: planos a partir de R$ {SELLABLE_PLANS[0].monthlyPrice}/mês.</p>
      </div>
      <figure className="spn-hero-proof">
        <div className="spn-hero-frame spn-glass">
          <BeforeAfter
            base="/proj-living-estante-base.jpg"
            render="/proj-living-estante-render.jpg"
            aspect="16 / 9"
            priority
            sizes="(max-width: 900px) 92vw, (max-width: 1248px) 48vw, 570px"
            caption="Living com estante"
          />
        </div>
        <figcaption className="spn-hero-caption">
          <strong>Projeto real · muda arquitetura</strong>
          <span>Arraste para comparar o print e o resultado. Publicado com autorização.</span>
        </figcaption>
      </figure>
      <style jsx>{`
        .spn-hero { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr 1.12fr; align-items: center; gap: 40px; padding: 48px 24px 64px; max-width: 1200px; margin: 0 auto; }
        .spn-hero-copy { min-width: 0; }
        .spn-hero-badge { display: inline-flex; padding: 7px 12px; border-radius: var(--radius-full); font-size: 10.5px; line-height: 1.5; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--color-text-secondary); margin-bottom: 20px; }
        .spn-hero-title { font-size: clamp(36px, 3.8vw, 52px); font-weight: 500; letter-spacing: -.035em; line-height: 1.08; margin: 0 0 20px; color: var(--color-text-primary); text-wrap: balance; }
        .spn-hero-sub { font-size: 16px; color: var(--color-text-secondary); line-height: 1.6; margin: 0 0 24px; max-width: 480px; }
        .spn-hero-primary { display: inline-flex; align-items: center; justify-content: center; gap: 12px; border-radius: var(--r-inner); text-decoration: none; font-weight: 500; min-height: 52px; padding: 15px 24px; font-size: 14px; background: var(--color-inverse); color: var(--color-inverse-foreground); box-shadow: var(--shadow-float); transition: transform 200ms var(--ease); }
        .spn-hero-primary:hover { transform: translateY(-1px); }
        .spn-hero-primary:focus-visible { outline: 1.5px solid var(--color-border-focus); outline-offset: 3px; }
        .spn-hero-note { font-size: 12px; line-height: 1.6; color: var(--color-text-secondary); margin: 12px 0 4px; }
        .spn-hero-price { font-size: 12px; line-height: 1.6; color: var(--color-text-tertiary); margin: 0; }
        .spn-hero-proof { min-width: 0; margin: 0; }
        .spn-hero-frame { padding: 7px; border-radius: calc(var(--r-inner) + 7px); box-shadow: var(--shadow-float); }
        .spn-hero-caption { display: grid; gap: 6px; padding: 14px 4px 0; font-size: 12px; line-height: 1.5; color: var(--color-text-secondary); }
        .spn-hero-caption strong { font-weight: 500; color: var(--color-text-primary); }
        @media (max-width: 900px) {
          .spn-hero { grid-template-columns: 1fr; gap: 24px; padding: 28px 16px 48px; }
          .spn-hero-copy { max-width: 620px; margin: 0 auto; text-align: center; }
          .spn-hero-title { font-size: clamp(32px, 6vw, 46px); }
          .spn-hero-sub { margin-left: auto; margin-right: auto; font-size: 15px; }
          .spn-hero-proof { width: 100%; max-width: 680px; margin: 0 auto; }
          .spn-hero-caption { text-align: center; }
        }
        @media (max-width: 480px) {
          .spn-hero { padding-top: 20px; gap: 20px; }
          .spn-hero-badge { font-size: 9px; margin-bottom: 14px; }
          .spn-hero-title { font-size: 32px; margin-bottom: 14px; }
          .spn-hero-sub { margin-bottom: 18px; }
          .spn-hero-primary { width: 100%; padding: 16px 18px; }
        }
        @media (prefers-reduced-motion: reduce) { .spn-hero-primary { transition: none; } .spn-hero-primary:hover { transform: none; } }
      `}</style>
    </section>
  )
}
