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
    <section style={{ padding: '52px 40px 0', maxWidth: 880, margin: '0 auto' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 1,
        border: '0.5px solid var(--color-border)',
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        {PROPS.map((p, i) => (
          <div
            key={p.metric}
            style={{
              padding: '22px 20px',
              background: 'var(--color-bg-elevated)',
              borderRight: i < PROPS.length - 1 ? '0.5px solid var(--color-border)' : 'none',
            }}
          >
            <div style={{
              fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em', marginBottom: 6,
            }}>
              {p.metric}
            </div>
            <p style={{
              fontSize: 11, color: 'var(--color-text-tertiary)',
              lineHeight: 1.6, margin: 0, letterSpacing: '-0.005em',
            }}>
              {p.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
