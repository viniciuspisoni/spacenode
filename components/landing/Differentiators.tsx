// Os três argumentos centrais da marca: fidelidade, coerência, controle.
// Texto encurtado na reforma de vidro (2026-09-09) — o argumento cabe em
// uma linha e meia; o resto era eco do próprio título.
const ITEMS = [
  {
    title: 'Seu projeto como referência',
    desc: 'A imagem parte do que você desenhou. Compare geometria, proporções e perspectiva com o original antes de apresentar.',
  },
  {
    title: 'Alternativas para conversar com o cliente',
    desc: 'Explore luz e materiais para explicar suas escolhas e comparar possibilidades na apresentação.',
  },
  {
    title: 'Comece com o que você já tem',
    desc: 'Use um print e as opções da plataforma para gerar sua primeira imagem. Sem configurar uma cena de render do zero.',
  },
]

// Neutro, como os checks dos planos: aqui ele pontua um argumento, não
// marca um estado de sucesso. Ver PricingToggle.
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M2 6.2l2.6 2.6L10 3.4" stroke="var(--color-text-tertiary)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function Differentiators() {
  return (
    <section className="spn-diff">
      <h2 className="spn-diff-title">
        O cliente precisa entender sua ideia.
        <br />
        <span className="spn-diff-title-dim">Mostre as escolhas do seu projeto.</span>
      </h2>

      <div className="spn-diff-grid">
        {ITEMS.map(item => (
          <div key={item.title} className="spn-diff-card spn-glass">
            <p className="spn-diff-card-title">
              <CheckIcon />
              {item.title}
            </p>
            <p className="spn-diff-card-desc">{item.desc}</p>
          </div>
        ))}
      </div>

      <style jsx>{`
        .spn-diff {
          position: relative;
          z-index: 1;
          padding: 0 24px 96px;
          max-width: 1000px;
          margin: 0 auto;
        }
        .spn-diff-title {
          text-align: center;
          font-size: clamp(32px, 4.2vw, 42px);
          font-weight: 500;
          letter-spacing: -0.035em;
          line-height: 1.2;
          margin: 0 0 32px;
          color: var(--color-text-primary);
        }
        .spn-diff-title-dim { color: var(--color-text-tertiary); }
        .spn-diff-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .spn-diff-card {
          padding: 24px 22px;
          border-radius: var(--r-card);
        }
        .spn-diff-card-title {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.015em;
          color: var(--color-text-primary);
          margin: 0 0 9px;
        }
        .spn-diff-card-desc {
          font-size: 16px;
          color: var(--color-text-secondary);
          line-height: 1.6;
          letter-spacing: -0.005em;
          margin: 0;
        }

        @media (max-width: 768px) {
          .spn-diff { padding: 0 16px 64px; }
          .spn-diff-title { margin-bottom: 20px; }
          .spn-diff-grid { grid-template-columns: 1fr; gap: 10px; }
          .spn-diff-card { padding: 20px 18px; }
        }
      `}</style>
    </section>
  )
}
