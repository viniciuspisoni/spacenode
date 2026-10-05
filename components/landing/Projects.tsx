'use client'

import { BeforeAfter } from '@/components/landing/BeforeAfter'

// Números do catálogo em output/banco-imagens-divulgacao/catalogo.csv.
const PROJECTS = [
  { id: 13, scene: 'Fachada residencial', credit: 'Natália Benchimol Maggi' },
  { id: 25, scene: 'Escritório', credit: 'Bruna Plentz' },
  { id: 94, scene: 'Cozinha com marcenaria', credit: 'muda arquitetura' },
  { id: 345, scene: 'Quarto com detalhes amarelos', credit: 'Nathalia Costa' },
  { id: 142, scene: 'Pátio com espelho d’água', credit: 'muda arquitetura' },
  { id: 100, scene: 'Sala de estar', credit: 'Nathalia Costa' },
  { id: 21, scene: 'Sala de estar colorida', credit: 'Bruna Plentz' },
  { id: 174, scene: 'Cozinha com bancada de madeira', credit: 'Natália Benchimol Maggi' },
] as const

export function Projects() {
  return (
    <section id="projetos" className="spn-projects" data-cta-position="proof">
      <div className="spn-projects-head">
        <h2 className="spn-projects-title">projetos reais, de escritórios reais.</h2>
        <p className="spn-projects-sub">
          Arraste cada imagem para comparar a entrada com o resultado.
          Projetos reais de clientes SpaceNode, com crédito a quem projetou.
        </p>
      </div>

      <div className="spn-projects-grid">
        {PROJECTS.map(project => (
          <figure key={project.id} className="spn-projects-item">
            <div className="spn-projects-cell spn-glass">
              <BeforeAfter
                base={`/projetos-aprovados/${project.id}-base.webp`}
                render={`/projetos-aprovados/${project.id}.webp`}
                caption={project.scene}
                aspect="16 / 9"
                sizes="(max-width: 768px) 100vw, (max-width: 1080px) 46vw, 500px"
              />
            </div>
            <figcaption className="spn-projects-caption">
              <span>{project.scene}</span>
              <small>{project.credit}</small>
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="spn-projects-action">
        <p>Agora compare o resultado no seu próprio projeto.</p>
        <a href="/login?mode=signup&next=%2Fapp%2Fgenerate">Testar no meu projeto grátis <span aria-hidden="true">→</span></a>
        <small>80 Nodes grátis · sem cartão</small>
      </div>

      <style jsx>{`
        .spn-projects {
          position: relative;
          z-index: 1;
          padding: 40px 24px 96px;
          max-width: 1080px;
          margin: 0 auto;
        }
        .spn-projects-action { text-align: center; margin-top: 28px; }
        .spn-projects-action p { font-size: 16px; line-height: 1.5; margin: 0 0 16px; color: var(--color-text-secondary); }
        .spn-projects-action a { display: inline-flex; justify-content: center; align-items: center; gap: 12px; min-height: 52px; padding: 15px 24px; border-radius: var(--r-inner); background: var(--color-inverse); color: var(--color-inverse-foreground); text-decoration: none; font-size: 14px; font-weight: 500; }
        .spn-projects-action a:focus-visible { outline: 1.5px solid var(--color-border-focus); outline-offset: 3px; }
        .spn-projects-action small { display: block; margin-top: 12px; color: var(--color-text-tertiary); font-size: 12px; }
        .spn-projects-head {
          text-align: center;
          margin-bottom: 28px;
        }
        .spn-projects-title {
          font-size: clamp(32px, 3.6vw, 48px);
          font-weight: 500;
          letter-spacing: -0.025em;
          line-height: 1.2;
          margin: 0 0 8px;
          color: var(--color-text-primary);
        }
        .spn-projects-sub {
          font-size: 16px;
          line-height: 1.6;
          color: var(--color-text-tertiary);
          margin: 0 auto;
          max-width: 520px;
          letter-spacing: -0.005em;
        }
        .spn-projects-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .spn-projects-item { margin: 0; }
        .spn-projects-cell {
          padding: 7px;
          border-radius: calc(var(--r-inner) + 7px);
        }
        .spn-projects-caption {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 2px 12px;
          padding: 10px 4px 0;
          color: var(--color-text-primary);
          font-size: 13px;
        }
        .spn-projects-caption small {
          color: var(--color-text-tertiary);
          font-size: 11.5px;
        }

        @media (max-width: 768px) {
          .spn-projects { padding: 24px 16px 64px; }
          .spn-projects-grid { grid-template-columns: 1fr; gap: 6px; }
          .spn-projects-caption { padding-bottom: 10px; }
        }
      `}</style>
    </section>
  )
}
