// 3 diferenciais — condensa as antigas ValueProps (4 células) e
// ProblemSolution (2 colunas × 4 itens) numa seção só, com os três
// argumentos centrais da marca: fidelidade, coerência, velocidade com
// controle.

const ITEMS = [
  {
    title: 'Fidelidade geométrica',
    desc: 'Construída para preservar geometria, proporções e perspectiva do projeto — nada é reinterpretado.',
  },
  {
    title: 'Coerência entre vistas',
    desc: 'Cada imagem pertence ao mesmo projeto. Luz, câmera e atmosfera variam — a identidade, não.',
  },
  {
    title: 'Velocidade com controle',
    desc: 'Iteração em minutos, com escolhas de arquiteto: motor, resolução, atmosfera e materialidade. Sem prompts.',
  },
]

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M2 6.2l2.6 2.6L10 3.4" stroke="var(--color-accent-green)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function Differentiators() {
  return (
    <section className="spn-diff">
      <div className="spn-diff-head">
        <div className="spn-diff-eyebrow">
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Por que existe
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 className="spn-diff-title">
          ferramentas genéricas criam imagens.
          <br />
          a SpaceNode trabalha com projetos.
        </h2>
      </div>

      <div className="spn-diff-grid">
        {ITEMS.map(item => (
          <div key={item.title} className="spn-diff-card">
            <div className="spn-diff-card-title">
              <CheckIcon />
              {item.title}
            </div>
            <p className="spn-diff-card-desc">{item.desc}</p>
          </div>
        ))}
      </div>

      <style jsx>{`
        .spn-diff {
          padding: 88px 24px;
          max-width: 960px;
          margin: 0 auto;
        }
        .spn-diff-head {
          text-align: center;
          margin-bottom: 44px;
        }
        .spn-diff-eyebrow {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .spn-diff-title {
          font-size: clamp(24px, 4.5vw, 34px);
          font-weight: 400;
          letter-spacing: -0.035em;
          line-height: 1.2;
          margin: 0;
          color: var(--color-text-primary);
        }
        .spn-diff-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .spn-diff-card {
          padding: 26px 24px;
          border: 0.5px solid var(--color-border);
          border-radius: 14px;
          background: var(--color-bg-elevated);
          box-shadow: var(--shadow-sm);
        }
        .spn-diff-card-title {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.015em;
          color: var(--color-text-primary);
          margin-bottom: 10px;
        }
        .spn-diff-card-desc {
          font-size: 13.5px;
          color: var(--color-text-secondary);
          line-height: 1.6;
          letter-spacing: -0.005em;
          margin: 0;
        }

        @media (max-width: 768px) {
          .spn-diff {
            padding: 64px 20px;
          }
          .spn-diff-head {
            margin-bottom: 28px;
          }
          .spn-diff-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .spn-diff-card {
            padding: 20px 18px;
          }
        }
      `}</style>
    </section>
  )
}
