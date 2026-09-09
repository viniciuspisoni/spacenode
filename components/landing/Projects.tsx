'use client'

import { BeforeAfter } from '@/components/landing/BeforeAfter'

// Projetos reais — sucessora da Gallery (6 pares) e da antiga seção Demo.
// Quatro pares bastam para provar a variedade (residencial, interior,
// comercial, coworking); o quinto e o sexto só custavam scroll.
//
// Gotcha do acervo: nos pares casa/comercial os arquivos estão trocados no
// disco — o RENDER deles é o `-before.jpg` (ver marketing/BRIEF.md).
const PAIRS = [
  { before: '/gallery-casa-after.jpg',       after: '/gallery-casa-before.jpg',      caption: 'Residencial' },
  { before: '/gallery-living-before.jpg',    after: '/gallery-living-after.jpg',     caption: 'Interior' },
  { before: '/gallery-comercial-after.jpg',  after: '/gallery-comercial-before.jpg', caption: 'Comercial' },
  { before: '/gallery-coworking-before.jpg', after: '/gallery-coworking-after.jpg',  caption: 'Coworking' },
]

export function Projects() {
  return (
    <section id="projetos" className="spn-projects">
      <div className="spn-projects-head">
        <h2 className="spn-projects-title">projetos reais, sem pós-produção.</h2>
        <p className="spn-projects-sub">
          Arraste qualquer um: à esquerda o que entrou, à direita o que saiu.
        </p>
      </div>

      <div className="spn-projects-grid">
        {PAIRS.map(pair => (
          <div key={pair.caption} className="spn-projects-cell spn-glass">
            <BeforeAfter
              before={pair.before}
              after={pair.after}
              caption={pair.caption}
              sizes="(max-width: 768px) 100vw, (max-width: 1080px) 46vw, 500px"
            />
          </div>
        ))}
      </div>

      <style jsx>{`
        .spn-projects {
          position: relative;
          z-index: 1;
          padding: 40px 24px 96px;
          max-width: 1080px;
          margin: 0 auto;
        }
        .spn-projects-head {
          text-align: center;
          margin-bottom: 28px;
        }
        .spn-projects-title {
          font-size: clamp(22px, 3.6vw, 30px);
          font-weight: 400;
          letter-spacing: -0.035em;
          line-height: 1.2;
          margin: 0 0 8px;
          color: var(--color-text-primary);
        }
        .spn-projects-sub {
          font-size: 14px;
          color: var(--color-text-tertiary);
          margin: 0;
          letter-spacing: -0.005em;
        }
        .spn-projects-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .spn-projects-cell {
          padding: 7px;
          border-radius: calc(var(--r-inner) + 7px);
        }

        @media (max-width: 768px) {
          .spn-projects { padding: 24px 16px 64px; }
          .spn-projects-grid { grid-template-columns: 1fr; gap: 10px; }
        }
      `}</style>
    </section>
  )
}
