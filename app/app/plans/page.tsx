'use client'

import { useState, useCallback } from 'react'

const PLANS = [
  { name: 'Starter', nodes: 300 },
  { name: 'Pro',     nodes: 500 },
  { name: 'Studio',  nodes: 1000 },
]

const CheckIcon = () => (
  <svg
    width="14" height="14" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, color: '#30b46c' }}
  >
    <path d="M2 7l3.5 3.5L12 3.5"/>
  </svg>
)

function PlanCard({
  name, nodes, rendersHD, renders2K, renders4K,
  monthly, annual, annualTotal, featured, badge,
  features, meterPct, billing, planId, ctaLabel, microcopy, ctaNote,
}: {
  name: string; nodes: string; rendersHD: number; renders2K: number; renders4K: number
  monthly: number; annual: number; annualTotal: string; featured?: boolean; badge?: string
  features: string[]; meterPct: number; billing: 'monthly' | 'annual'; planId: string
  ctaLabel: string; microcopy: string; ctaNote?: string
}) {
  const [hovered, setHovered] = useState(false)
  const price = billing === 'annual' ? annual : monthly

  const baseShadow = featured
    ? '0 8px 40px rgba(0,0,0,0.28)'
    : '0 1px 4px rgba(0,0,0,0.05)'
  const hoverShadow = featured
    ? '0 20px 64px rgba(0,0,0,0.44)'
    : '0 12px 48px rgba(0,0,0,0.10)'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: featured ? '#1a1a1a' : '#ffffff',
        border: `0.5px solid ${featured ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        borderTop: featured ? '2px solid #30b46c' : '0.5px solid rgba(0,0,0,0.07)',
        borderRadius: 16, padding: '32px 28px 28px',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
        boxShadow: hovered ? hoverShadow : baseShadow,
        transform: hovered ? 'translateY(-5px)' : 'translateY(0)',
        transition: 'box-shadow 0.24s, transform 0.24s',
      }}
    >
      {badge && (
        <div style={{
          position: 'absolute', top: 22, right: 22,
          fontSize: 9, fontWeight: 600, letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          background: 'rgba(48,180,108,0.12)', color: '#30b46c',
          padding: '4px 10px', borderRadius: 20,
          border: '0.5px solid rgba(48,180,108,0.22)',
        }}>
          {badge}
        </div>
      )}

      {/* Plan name */}
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.2em',
        textTransform: 'uppercase' as const,
        color: featured ? 'rgba(255,255,255,0.35)' : '#86868b',
        marginBottom: 22,
      }}>
        {name}
      </div>

      {/* Node count */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 4 }}>
        <span style={{
          fontSize: 46, fontWeight: 500,
          color: featured ? '#fafafa' : '#1a1a1a',
          letterSpacing: '-0.04em', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums' as const,
        }}>
          {nodes}
        </span>
        <span style={{ fontSize: 11, color: featured ? 'rgba(255,255,255,0.32)' : '#86868b' }}>
          nodes / mês
        </span>
      </div>

      {/* Renders breakdown */}
      <p style={{
        fontSize: 11, letterSpacing: '-0.005em', marginBottom: 20, lineHeight: 1.6,
        color: featured ? 'rgba(255,255,255,0.25)' : '#aaa',
      }}>
        <span style={{ color: featured ? 'rgba(255,255,255,0.7)' : '#1a1a1a', fontWeight: 500 }}>{rendersHD} HD</span>
        {' · '}
        <span style={{ color: featured ? 'rgba(255,255,255,0.7)' : '#1a1a1a', fontWeight: 500 }}>{renders2K} 2K</span>
        {' · '}
        <span style={{ color: featured ? 'rgba(255,255,255,0.7)' : '#1a1a1a', fontWeight: 500 }}>{renders4K} 4K</span>
        {' '}renders/mês
      </p>

      {/* Price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 400, color: featured ? 'rgba(255,255,255,0.32)' : '#86868b' }}>R$</span>
        <span style={{
          fontSize: 28, fontWeight: 500,
          color: featured ? '#fafafa' : '#1a1a1a',
          letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums' as const,
        }}>
          {price}
        </span>
        <span style={{ fontSize: 11, color: featured ? 'rgba(255,255,255,0.28)' : '#86868b' }}>/mês</span>
      </div>

      {/* Annual billing note */}
      {billing === 'annual' && (
        <p style={{
          fontSize: 10, letterSpacing: '-0.005em', marginBottom: 4,
          color: featured ? 'rgba(255,255,255,0.28)' : '#86868b',
        }}>
          R$ {annualTotal} cobrado anualmente
        </p>
      )}

      {/* Microcopy */}
      <p style={{
        fontSize: 11, letterSpacing: '-0.005em',
        marginBottom: 22, marginTop: billing === 'annual' ? 2 : 2,
        color: featured ? 'rgba(255,255,255,0.45)' : '#30b46c',
        fontWeight: featured ? 400 : 500,
      }}>
        {microcopy}
      </p>

      {/* Progress bar */}
      <div style={{ marginBottom: 22 }}>
        <div style={{
          height: 2, borderRadius: 2, overflow: 'hidden',
          background: featured ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: featured ? '#30b46c' : '#1a1a1a',
            width: `${meterPct}%`,
          }} />
        </div>
      </div>

      <div style={{ height: 0.5, background: featured ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', marginBottom: 22 }} />

      {/* Features */}
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 32, flex: 1, listStyle: 'none', padding: 0 }}>
        {features.map(f => (
          <li key={f} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12, letterSpacing: '-0.005em',
            color: featured ? 'rgba(255,255,255,0.68)' : '#1a1a1a',
          }}>
            <CheckIcon />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <form action="/api/stripe/checkout" method="POST">
        <input type="hidden" name="plan" value={planId} />
        <input type="hidden" name="billing" value={billing} />
        <button
          type="submit"
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 9,
            fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
            letterSpacing: '-0.01em', cursor: 'pointer',
            transition: 'opacity 0.15s', border: 'none',
            background: featured ? '#fafafa' : '#1a1a1a',
            color: featured ? '#1a1a1a' : '#fafafa',
          }}
        >
          {ctaLabel}
        </button>
      </form>
      {ctaNote && (
        <p style={{
          marginTop: 10, fontSize: 10, textAlign: 'center',
          color: featured ? 'rgba(255,255,255,0.3)' : '#aaa',
          letterSpacing: '-0.005em', lineHeight: 1.5,
        }}>
          {ctaNote}
        </p>
      )}
    </div>
  )
}

function QualityCard({ res, engine, cost, desc, tag, tagStyle }: {
  res: string; engine: string; cost: number; desc: string; tag: string
  tagStyle: React.CSSProperties
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff', border: '0.5px solid rgba(0,0,0,0.07)',
        borderRadius: 12, padding: '20px 22px',
        transition: 'box-shadow 0.2s, transform 0.2s',
        boxShadow: hovered ? '0 8px 28px rgba(0,0,0,0.07)' : '0 1px 3px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.02em', marginBottom: 3 }}>{res}</div>
      <div style={{ fontSize: 10, color: '#86868b', letterSpacing: '-0.005em', marginBottom: 12 }}>{engine}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 12 }}>
        <span style={{ fontSize: 28, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' as const }}>{cost}</span>
        <span style={{ fontSize: 10, color: '#86868b', lineHeight: 1.4 }}>nodes<br />por render</span>
      </div>
      <div style={{ height: 0.5, background: 'rgba(0,0,0,0.06)', marginBottom: 12 }} />
      <div style={{ fontSize: 11, color: '#86868b', lineHeight: 1.6 }}>{desc}</div>
      <span style={{
        display: 'inline-block', marginTop: 12, fontSize: 9, fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase' as const,
        padding: '3px 9px', borderRadius: 20, ...tagStyle,
      }}>
        {tag}
      </span>
    </div>
  )
}

const QUALITY_CARDS = [
  {
    res: 'HD · draft', engine: 'Iteração rápida', cost: 4,
    desc: 'Conceito, iterações rápidas e apresentações internas. Geração em segundos.',
    tag: 'rascunho', tagStyle: { background: 'rgba(134,134,139,0.1)', color: '#86868b' } as React.CSSProperties,
  },
  {
    res: '2K · entrega', engine: 'Qualidade profissional', cost: 8,
    desc: 'Portfólio, aprovação de projeto e apresentação ao cliente. Resultado de entrega.',
    tag: 'portfólio', tagStyle: { background: 'rgba(37,99,235,0.1)', color: '#2563eb' } as React.CSSProperties,
  },
  {
    res: '4K · final', engine: 'Máxima fidelidade', cost: 20,
    desc: 'Entrega final para incorporadoras, impressão e material de marketing de alto impacto.',
    tag: 'entrega final', tagStyle: { background: 'rgba(48,180,108,0.15)', color: '#30b46c' } as React.CSSProperties,
  },
]

export default function PlansPage() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [renders, setRenders] = useState(40)
  const [qualityCost, setQualityCost] = useState(4)

  const totalNodes      = renders * qualityCost
  const recommended     = PLANS.find(p => p.nodes >= totalNodes) ?? PLANS[PLANS.length - 1]
  const recommendedName = totalNodes > PLANS[PLANS.length - 1].nodes ? 'Studio+' : recommended.name
  const qualityLabel    = qualityCost === 4 ? 'HD' : qualityCost === 8 ? '2K' : '4K'

  const handleRenders = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRenders(parseInt(e.target.value))
  }, [])

  const trustLine = billing === 'annual'
    ? 'Compromisso de 12 meses • Melhor preço • Upgrade instantâneo'
    : 'Cancelamento fácil • Upgrade instantâneo • Sem fidelidade'

  return (
    <div style={{
      flex: 1, height: '100%', overflowY: 'auto', background: '#f2f2f2',
      fontFamily: "'Geist', system-ui, sans-serif", letterSpacing: '-0.011em',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 32px 96px' }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.22em',
            textTransform: 'uppercase' as const, color: '#86868b', marginBottom: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <span style={{ display: 'block', width: 32, height: 0.5, background: '#d0d0d0', flexShrink: 0 }} />
            planos
            <span style={{ display: 'block', width: 32, height: 0.5, background: '#d0d0d0', flexShrink: 0 }} />
          </div>
          <h2 style={{
            fontSize: 36, fontWeight: 500, color: '#1a1a1a',
            letterSpacing: '-0.04em', lineHeight: 1.12, marginBottom: 14,
          }}>
            Escolha o plano ideal para<br />sua criação visual
          </h2>
          <p style={{
            fontSize: 14, color: '#86868b', letterSpacing: '-0.01em',
            lineHeight: 1.65, maxWidth: 420, margin: '0 auto 32px',
          }}>
            Mais Nodes, mais velocidade e acesso aos motores premium da SPACENODE. Para arquitetos e designers de interiores.
          </p>

          {/* ── Billing toggle ── */}
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            background: '#fff', border: '0.5px solid rgba(0,0,0,0.07)',
            borderRadius: 40, padding: 4,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            <button
              onClick={() => setBilling('monthly')}
              style={{
                fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
                letterSpacing: '-0.01em',
                color: billing === 'monthly' ? '#fafafa' : '#86868b',
                background: billing === 'monthly' ? '#1a1a1a' : 'transparent',
                border: 'none', borderRadius: 32, padding: '9px 20px',
                cursor: 'pointer', transition: 'background 0.2s, color 0.2s',
                whiteSpace: 'nowrap' as const,
              }}
            >
              Mensal
            </button>
            <button
              onClick={() => setBilling('annual')}
              style={{
                fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
                letterSpacing: '-0.01em',
                color: billing === 'annual' ? '#fafafa' : '#86868b',
                background: billing === 'annual' ? '#1a1a1a' : 'transparent',
                border: 'none', borderRadius: 32, padding: '9px 20px',
                cursor: 'pointer', transition: 'background 0.2s, color 0.2s',
                whiteSpace: 'nowrap' as const,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              Anual
              <span style={{
                fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
                background: billing === 'annual' ? 'rgba(48,180,108,0.2)' : '#30b46c',
                color: billing === 'annual' ? '#30b46c' : '#fff',
                padding: '2px 8px', borderRadius: 20,
                border: billing === 'annual' ? '0.5px solid rgba(48,180,108,0.3)' : 'none',
                transition: 'all 0.2s',
              }}>
                Pague 10, use 12
              </span>
            </button>
          </div>
        </div>

        {/* ── Plan cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, alignItems: 'start' }}>
          <PlanCard
            name="Starter" nodes="300" rendersHD={75} renders2K={37} renders4K={15}
            monthly={89} annual={75} annualTotal="890"
            features={['Saída até HD', 'Histórico 30 dias', 'Suporte por e-mail']}
            meterPct={30} billing={billing} planId="starter"
            ctaLabel="Assinar Starter" microcopy="Perfeito para começar"
          />
          <PlanCard
            name="Pro" nodes="500" rendersHD={125} renders2K={62} renders4K={25}
            monthly={149} annual={125} annualTotal="1.490"
            featured badge="recomendado"
            features={['Saída até 2K', 'Histórico ilimitado', 'Suporte por e-mail']}
            meterPct={50} billing={billing} planId="pro"
            ctaLabel="Assinar Pro" microcopy="Melhor custo-benefício"
          />
          <PlanCard
            name="Studio" nodes="1.000" rendersHD={250} renders2K={125} renders4K={50}
            monthly={299} annual={249} annualTotal="2.990"
            features={['Saída até 4K', 'Histórico ilimitado', 'Suporte prioritário']}
            meterPct={100} billing={billing} planId="studio"
            ctaLabel="Assinar Studio" microcopy="Para operação intensa"
            ctaNote="Precisa de volume maior? Fale com a gente."
          />
        </div>

        {/* ── Dynamic trust line ── */}
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <p style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.005em', transition: 'opacity 0.2s' }}>
            {trustLine}
          </p>
        </div>

        {/* ── Annual legal note ── */}
        {billing === 'annual' && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <p style={{ fontSize: 10, color: '#c0c0c0', letterSpacing: '-0.005em' }}>
              Plano anual com renovação ao final do período.
            </p>
          </div>
        )}

        {/* ── Quality table ── */}
        <div style={{ marginTop: 64 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
            textTransform: 'uppercase' as const, color: '#86868b',
            textAlign: 'center', marginBottom: 18,
          }}>
            consumo por qualidade
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {QUALITY_CARDS.map(q => <QualityCard key={q.res} {...q} />)}
          </div>
        </div>

        {/* ── Calculator ── */}
        <div style={{
          marginTop: 56, background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.07)', borderRadius: 16,
          padding: '32px 36px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.02em', marginBottom: 5 }}>
              Descubra quantos Nodes você precisa
            </div>
            <div style={{ fontSize: 12, color: '#86868b' }}>
              Ajuste os controles e veja o plano ideal para o seu fluxo de trabalho.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 24 }}>
            <div>
              <label style={{
                display: 'block', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.14em', textTransform: 'uppercase' as const,
                color: '#86868b', marginBottom: 10,
              }}>
                Renders por mês
              </label>
              <div style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.03em', marginBottom: 8 }}>
                {renders} renders
              </div>
              <input
                type="range" min="5" max="200" step="5" value={renders}
                onChange={handleRenders}
                style={{ width: '100%', marginBottom: 8, cursor: 'pointer', accentColor: '#1a1a1a' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#bbb' }}>
                <span>5</span><span>200+</span>
              </div>
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.14em', textTransform: 'uppercase' as const,
                color: '#86868b', marginBottom: 10,
              }}>
                Qualidade predominante
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[{ label: 'HD', cost: 4 }, { label: '2K', cost: 8 }, { label: '4K', cost: 20 }].map(q => (
                  <button
                    key={q.label}
                    onClick={() => setQualityCost(q.cost)}
                    style={{
                      padding: '10px 6px', borderRadius: 8, fontFamily: 'inherit',
                      fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' as const,
                      border: `0.5px solid ${qualityCost === q.cost ? '#1a1a1a' : 'rgba(0,0,0,0.09)'}`,
                      background: qualityCost === q.cost ? '#1a1a1a' : '#f7f7f7',
                      color: qualityCost === q.cost ? '#fafafa' : '#86868b',
                    }}
                  >
                    {q.label}
                    <small style={{ display: 'block', fontSize: 9, fontWeight: 400, opacity: 0.6, marginTop: 2 }}>
                      {q.cost} nodes
                    </small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dynamic helper */}
          <div style={{
            background: 'rgba(48,180,108,0.06)', border: '0.5px solid rgba(48,180,108,0.18)',
            borderRadius: 10, padding: '13px 16px', marginBottom: 16,
            fontSize: 12, color: '#1a1a1a', lineHeight: 1.5,
          }}>
            Para <strong>{renders} renders/mês</strong> em <strong>{qualityLabel}</strong>, o plano ideal é{' '}
            <strong style={{ color: '#30b46c' }}>{recommendedName}</strong>
            {totalNodes > PLANS[PLANS.length - 1].nodes && (
              <span style={{ color: '#86868b', fontWeight: 400 }}> — entre em contato para um plano personalizado</span>
            )}
            .
          </div>

          <div style={{
            background: '#f7f7f7', borderRadius: 10, padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap' as const, gap: 16,
          }}>
            {([
              { label: 'renders / mês',     value: renders,                            green: false },
              { label: 'nodes / render',    value: qualityCost,                        green: false },
              { label: 'nodes necessários', value: totalNodes.toLocaleString('pt-BR'), green: false },
              { label: 'plano ideal',       value: recommendedName,                    green: true  },
            ] as const).map((item, i, arr) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                    {item.label}
                  </span>
                  <span style={{
                    fontSize: 17, fontWeight: 500, letterSpacing: '-0.03em',
                    fontVariantNumeric: 'tabular-nums' as const,
                    color: item.green ? '#30b46c' : '#1a1a1a',
                  }}>
                    {item.value}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ width: 0.5, height: 30, background: 'rgba(0,0,0,0.08)' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Final CTA section ── */}
        <div style={{
          marginTop: 56, background: '#1a1a1a', borderRadius: 20,
          padding: '52px 40px', textAlign: 'center',
        }}>
          <h3 style={{
            fontSize: 26, fontWeight: 500, color: '#fafafa',
            letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 32,
          }}>
            Pronto para elevar suas apresentações visuais?
          </h3>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            <form action="/api/stripe/checkout" method="POST">
              <input type="hidden" name="plan" value="pro" />
              <input type="hidden" name="billing" value={billing} />
              <button type="submit" style={{
                fontFamily: 'inherit', fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
                padding: '13px 28px', borderRadius: 9, border: 'none',
                background: '#fafafa', color: '#1a1a1a', cursor: 'pointer',
              }}>
                Assinar agora
              </button>
            </form>
            <a href="/app/generate" style={{
              display: 'inline-flex', alignItems: 'center',
              fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
              padding: '13px 28px', borderRadius: 9,
              border: '0.5px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: 'rgba(255,255,255,0.7)',
              textDecoration: 'none',
            }}>
              Testar plataforma
            </a>
          </div>
        </div>

        {/* ── Footer note ── */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <p style={{ fontSize: 11, color: '#bbb', lineHeight: 1.8 }}>
            Nodes renovam mensalmente e não acumulam para o mês seguinte.<br />
            Dúvidas?{' '}
            <a href="mailto:contato@spacenode.app"
              style={{ color: '#1a1a1a', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              fale com a gente.
            </a>
          </p>
        </div>

      </div>
    </div>
  )
}
