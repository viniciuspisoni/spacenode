'use client'

const testimonials = [
  {
    initials: 'CM',
    quote:
      'Em cinco minutos apresento três variações para o cliente que antes levavam uma semana. A SpaceNode virou parte do meu fluxo.',
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
  '80 nodes grátis ao criar conta',
  'Sem cartão de crédito',
  'Suporte em português',
  'Cancele quando quiser',
]

import { useState } from 'react'

export function SocialProof() {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <section className="spn-social">

      <div className="spn-social-head">
        <div style={{
          fontSize: 10, fontWeight: 500, letterSpacing: '0.22em',
          textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)',
          marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Depoimentos
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 className="spn-social-title">
          quem usa, apresenta melhor.
        </h2>
      </div>

      <div className="spn-social-grid">
        {testimonials.map((t) => (
          <div
            key={t.name}
            onMouseEnter={() => setHovered(t.name)}
            onMouseLeave={() => setHovered(null)}
            className="spn-social-card"
            style={{
              transform: hovered === t.name ? 'translateY(-2px)' : 'translateY(0)',
              boxShadow: hovered === t.name ? '0 8px 32px rgba(0,0,0,0.3)' : 'none',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            <p className="spn-social-quote">
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

      <div className="spn-social-trust">
        {trustItems.map((item) => (
          <div key={item} className="spn-social-trust-cell">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M2 6l2.5 2.5L10 3" stroke="var(--color-accent-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', letterSpacing: '-0.005em' }}>
              {item}
            </span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .spn-social {
          padding: 100px 24px;
          max-width: 960px;
          margin: 0 auto;
        }
        .spn-social-head {
          text-align: center;
          margin-bottom: 48px;
        }
        .spn-social-title {
          font-size: 26px;
          font-weight: 400;
          letter-spacing: -0.03em;
          line-height: 1.25;
          color: var(--color-text-primary);
          margin: 0;
        }
        .spn-social-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 48px;
        }
        .spn-social-card {
          padding: 32px 28px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
        }
        .spn-social-quote {
          font-size: 15px;
          font-weight: 400;
          line-height: 1.5;
          color: var(--color-text-primary);
          letter-spacing: -0.02em;
          margin: 0 0 28px;
        }
        .spn-social-trust {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          border: 0.5px solid var(--color-border);
          border-radius: 12px;
          overflow: hidden;
        }
        .spn-social-trust-cell {
          padding: 18px 20px;
          background: rgba(255,255,255,0.02);
          border-right: 0.5px solid rgba(255,255,255,0.06);
          display: flex; align-items: center; gap: 10px;
        }
        .spn-social-trust-cell:last-child { border-right: none; }

        @media (max-width: 768px) {
          .spn-social {
            padding: 72px 20px;
          }
          .spn-social-head {
            margin-bottom: 32px;
          }
          .spn-social-title {
            font-size: 22px;
          }
          .spn-social-grid {
            grid-template-columns: 1fr;
            gap: 12px;
            margin-bottom: 32px;
          }
          .spn-social-card {
            padding: 24px 22px;
          }
          .spn-social-quote {
            font-size: 14.5px;
            margin: 0 0 22px;
          }
          .spn-social-trust {
            grid-template-columns: 1fr 1fr;
          }
          .spn-social-trust-cell {
            padding: 14px 14px;
            border-right: 0.5px solid rgba(255,255,255,0.06);
            border-bottom: 0.5px solid rgba(255,255,255,0.06);
          }
          .spn-social-trust-cell:nth-child(2n) { border-right: none; }
          .spn-social-trust-cell:nth-last-child(-n+2) { border-bottom: none; }
        }
      `}</style>
    </section>
  )
}
