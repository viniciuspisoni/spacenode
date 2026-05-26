import React from 'react'

const PROPS = [
  {
    metric: 'Mais velocidade',
    desc: 'De dias para segundos. Entregue variações antes do fim da reunião.',
  },
  {
    metric: 'Mais impacto visual',
    desc: 'Fotorrealismo de alto padrão que eleva a percepção do seu projeto.',
  },
  {
    metric: 'Mais aprovação',
    desc: 'Clientes que visualizam decidem mais rápido e com mais confiança.',
  },
  {
    metric: 'Menos retrabalho',
    desc: 'Itere visualmente antes de executar. Mude antes de construir.',
  },
]

export function ValueProps() {
  return (
    <section className="spn-value-props">
      <div className="spn-value-grid">
        {PROPS.map((p) => (
          <div key={p.metric} className="spn-value-cell">
            <div style={{
              fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em', marginBottom: 6,
            }}>
              {p.metric}
            </div>
            <p style={{
              fontSize: 12, color: 'var(--color-text-tertiary)',
              lineHeight: 1.6, margin: 0, letterSpacing: '-0.005em',
            }}>
              {p.desc}
            </p>
          </div>
        ))}
      </div>

      <style jsx>{`
        .spn-value-props {
          padding: 52px 40px 0;
          max-width: 880px;
          margin: 0 auto;
        }
        .spn-value-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          border: 0.5px solid var(--color-border);
          border-radius: 16px;
          overflow: hidden;
        }
        .spn-value-cell {
          padding: 22px 20px;
          background: var(--color-bg-elevated);
          border-right: 0.5px solid var(--color-border);
        }
        .spn-value-cell:last-child { border-right: none; }

        @media (max-width: 768px) {
          .spn-value-props {
            padding: 40px 20px 0;
          }
          .spn-value-grid {
            grid-template-columns: 1fr 1fr;
            border-radius: 14px;
          }
          .spn-value-cell {
            padding: 18px 16px;
            border-right: 0.5px solid var(--color-border);
            border-bottom: 0.5px solid var(--color-border);
          }
          .spn-value-cell:nth-child(2n) { border-right: none; }
          .spn-value-cell:nth-last-child(-n+2) { border-bottom: none; }
        }

        @media (max-width: 380px) {
          .spn-value-grid {
            grid-template-columns: 1fr;
          }
          .spn-value-cell {
            border-right: none !important;
            border-bottom: 0.5px solid var(--color-border) !important;
          }
          .spn-value-cell:last-child {
            border-bottom: none !important;
          }
        }
      `}</style>
    </section>
  )
}
