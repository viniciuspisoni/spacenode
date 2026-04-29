const testimonials = [
  {
    initials: 'CM',
    quote:
      'Em cinco minutos apresento três variações para o cliente que antes levavam uma semana. A Spacenode virou parte do meu fluxo.',
    name: 'Camila Mendes',
    role: 'ARQUITETA · PORTO ALEGRE · RS',
  },
  {
    initials: 'TN',
    quote:
      'Antes eu demorava dias para mostrar opções de ambientação. Agora apresento na própria reunião. O cliente fecha mais rápido.',
    name: 'Thais Nogueira',
    role: 'DESIGNER DE INTERIORES · SÃO PAULO · SP',
  },
]

const trustItems = [
  '3 imagens grátis ao criar conta',
  'Sem cartão de crédito',
  'Suporte em português',
  'Cancele quando quiser',
]

export function SocialProof() {
  return (
    <section style={{ padding: '80px 24px', maxWidth: 960, margin: '0 auto' }}>

      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{
          fontSize: 10, fontWeight: 500, letterSpacing: '0.22em',
          textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)',
          marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Depoimentos
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 style={{
          fontSize: 26, fontWeight: 400, letterSpacing: '-0.03em',
          lineHeight: 1.25, color: 'var(--color-text-primary)', margin: 0,
        }}>
          quem usa, apresenta melhor.
        </h2>
      </div>

      {/* Testimonial cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
        marginBottom: 48,
      }}>
        {testimonials.map((t) => (
          <div
            key={t.name}
            style={{
              padding: '28px 26px',
              background: 'var(--color-bg-elevated)',
              border: '0.5px solid var(--color-border-strong)',
              borderRadius: 16,
            }}
          >
            <p style={{
              fontSize: 15, fontWeight: 400, lineHeight: 1.5,
              color: 'var(--color-text-primary)', letterSpacing: '-0.02em',
              margin: '0 0 28px',
            }}>
              &ldquo;{t.quote}&rdquo;
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'var(--color-text-primary)',
                color: 'var(--color-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 500, letterSpacing: '0.06em',
                flexShrink: 0,
              }}>
                {t.initials}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', marginTop: 3 }}>
                  {t.role}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Trust signals strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 1,
        border: '0.5px solid var(--color-border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {trustItems.map((item, i) => (
          <div
            key={item}
            style={{
              padding: '16px 18px',
              background: 'var(--color-bg-elevated)',
              borderRight: i < trustItems.length - 1 ? '0.5px solid var(--color-border)' : 'none',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M2 6l2.5 2.5L10 3" stroke="var(--color-accent-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', letterSpacing: '-0.005em' }}>
              {item}
            </span>
          </div>
        ))}
      </div>

    </section>
  )
}
