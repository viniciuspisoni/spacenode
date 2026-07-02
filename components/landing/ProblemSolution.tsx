const PROBLEMS = [
  'Render tradicional leva horas — e cada variação é um novo render.',
  'IA genérica reinterpreta o projeto: muda geometria, proporções e composição.',
  'Imagens soltas não mantêm coerência entre si.',
  'Ajustes pequenos viram retrabalho e novas horas de espera.',
]

const SOLUTIONS = [
  'Construída para preservar geometria, proporções e perspectiva do projeto.',
  'Coerência entre imagens do mesmo projeto — luz, câmera e atmosfera variam; o projeto, não.',
  'Ajustes pontuais direto na imagem, sem recomeçar.',
  'Velocidade de apresentação sem abrir mão do controle.',
]

const DashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 4 }}>
    <path d="M2.5 6h7" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 4 }}>
    <path d="M2 6.2l2.6 2.6L10 3.4" stroke="var(--color-accent-green)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function ProblemSolution() {
  return (
    <section className="spn-ps">
      <div className="spn-ps-head">
        <div className="spn-ps-eyebrow">
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Por que existe
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 className="spn-ps-title">
          ferramentas genéricas criam imagens.
          <br />
          a SpaceNode trabalha com projetos.
        </h2>
      </div>

      <div className="spn-ps-grid">
        <div className="spn-ps-col">
          <div className="spn-ps-col-label">O problema</div>
          <ul className="spn-ps-list">
            {PROBLEMS.map(item => (
              <li key={item} className="spn-ps-item">
                <DashIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="spn-ps-col spn-ps-col--solution">
          <div className="spn-ps-col-label">A abordagem SpaceNode</div>
          <ul className="spn-ps-list">
            {SOLUTIONS.map(item => (
              <li key={item} className="spn-ps-item spn-ps-item--solution">
                <CheckIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <style jsx>{`
        .spn-ps {
          padding: 96px 24px;
          max-width: 880px;
          margin: 0 auto;
        }
        .spn-ps-head {
          text-align: center;
          margin-bottom: 48px;
        }
        .spn-ps-eyebrow {
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
        .spn-ps-title {
          font-size: clamp(24px, 4.5vw, 34px);
          font-weight: 400;
          letter-spacing: -0.035em;
          line-height: 1.2;
          margin: 0;
          color: var(--color-text-primary);
        }
        .spn-ps-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border: 0.5px solid var(--color-border);
          border-radius: 16px;
          overflow: hidden;
        }
        .spn-ps-col {
          padding: 28px 28px 24px;
          background: transparent;
        }
        .spn-ps-col--solution {
          background: var(--color-bg-elevated);
          border-left: 0.5px solid var(--color-border);
        }
        .spn-ps-col-label {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 20px;
        }
        .spn-ps-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
        }
        .spn-ps-item {
          display: flex;
          gap: 12px;
          padding: 12px 0;
          font-size: 13.5px;
          line-height: 1.55;
          letter-spacing: -0.005em;
          color: var(--color-text-tertiary);
          border-bottom: 0.5px solid var(--color-border);
        }
        .spn-ps-item:last-child {
          border-bottom: none;
        }
        .spn-ps-item--solution {
          color: var(--color-text-secondary);
        }

        @media (max-width: 768px) {
          .spn-ps {
            padding: 72px 20px;
          }
          .spn-ps-head {
            margin-bottom: 32px;
          }
          .spn-ps-grid {
            grid-template-columns: 1fr;
            border-radius: 14px;
          }
          .spn-ps-col {
            padding: 22px 20px 18px;
          }
          .spn-ps-col--solution {
            border-left: none;
            border-top: 0.5px solid var(--color-border);
          }
          .spn-ps-item {
            font-size: 13px;
            padding: 11px 0;
          }
        }
      `}</style>
    </section>
  )
}
