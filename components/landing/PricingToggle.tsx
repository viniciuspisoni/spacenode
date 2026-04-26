'use client'

import { useState, useCallback } from 'react'

const PLANS_DATA = [
  { name: 'Starter', nodes: 300 },
  { name: 'Pro',     nodes: 500 },
  { name: 'Studio',  nodes: 1000 },
]

async function startCheckout(plan: string, billing: 'monthly' | 'annual') {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, billing }),
  })
  if (res.status === 401) { window.location.href = '/login'; return }
  const data = await res.json()
  if (data.url) window.location.href = data.url
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#30b46c' }}>
    <path d="M2 7l3.5 3.5L12 3.5"/>
  </svg>
)

const plans = [
  {
    key: 'starter', name: 'Starter', nodes: '300', rendersHD: 75, renders2K: 37, renders4K: 15,
    monthly: 89, annual: 75, annualTotal: '890',
    features: ['Saída até HD', 'Histórico 30 dias', 'Suporte por e-mail'],
    meterPct: 30, featured: false, badge: '',
  },
  {
    key: 'pro', name: 'Pro', nodes: '500', rendersHD: 125, renders2K: 62, renders4K: 25,
    monthly: 149, annual: 125, annualTotal: '1.490',
    features: ['Saída até 2K', 'Histórico ilimitado', 'Suporte por e-mail'],
    meterPct: 50, featured: true, badge: 'recomendado',
  },
  {
    key: 'studio', name: 'Studio', nodes: '1.000', rendersHD: 250, renders2K: 125, renders4K: 50,
    monthly: 299, annual: 249, annualTotal: '2.990',
    features: ['Saída até 4K', 'Histórico ilimitado', 'Suporte prioritário'],
    meterPct: 100, featured: false, badge: '',
  },
]

const qualityCards = [
  {
    res: 'HD · draft', engine: 'Iteração rápida', cost: 4,
    desc: 'Conceito, iterações rápidas e apresentações internas. Geração em segundos.',
    tag: 'rascunho', tagBg: 'rgba(134,134,139,0.1)', tagColor: '#86868b',
  },
  {
    res: '2K · entrega', engine: 'Qualidade profissional', cost: 8,
    desc: 'Portfólio, aprovação de projeto e apresentação ao cliente. Resultado de entrega.',
    tag: 'portfólio', tagBg: 'rgba(37,99,235,0.1)', tagColor: '#2563eb',
  },
  {
    res: '4K · final', engine: 'Máxima fidelidade', cost: 20,
    desc: 'Entrega final para incorporadoras, impressão e material de marketing de alto impacto.',
    tag: 'entrega final', tagBg: 'rgba(48,180,108,0.15)', tagColor: '#30b46c',
  },
]

function PlanCard({ plan, billing, loading, onSelect }: {
  plan: typeof plans[0]; billing: 'monthly' | 'annual'
  loading: string | null; onSelect: (key: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const price = billing === 'annual' ? plan.annual : plan.monthly
  const f = plan.featured

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: f ? '#1a1a1a' : '#ffffff',
        border: `0.5px solid ${f ? '#1a1a1a' : '#e8e8e8'}`,
        borderRadius: 14, padding: '28px 24px 24px',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
        boxShadow: hovered ? (f ? '0 8px 40px rgba(0,0,0,0.28)' : '0 8px 40px rgba(0,0,0,0.08)') : 'none',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'box-shadow 0.2s, transform 0.2s',
      }}
    >
      {plan.badge && (
        <div style={{ position: 'absolute', top: 16, right: 16, fontSize: 9, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' as const, background: '#30b46c', color: '#fff', padding: '3px 8px', borderRadius: 20 }}>
          {plan.badge}
        </div>
      )}

      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: f ? 'rgba(255,255,255,0.45)' : '#86868b', marginBottom: 20 }}>
        {plan.name}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}>
        <span style={{ fontSize: 42, fontWeight: 500, color: f ? '#fafafa' : '#1a1a1a', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' as const }}>{plan.nodes}</span>
        <span style={{ fontSize: 11, color: f ? 'rgba(255,255,255,0.4)' : '#86868b', letterSpacing: '-0.005em' }}>nodes / mês</span>
      </div>

      <p style={{ fontSize: 10.5, letterSpacing: '-0.005em', marginBottom: 14, lineHeight: 1.55, color: f ? 'rgba(255,255,255,0.32)' : '#86868b' }}>
        <span style={{ color: f ? 'rgba(255,255,255,0.78)' : '#1a1a1a', fontWeight: 500 }}>{plan.rendersHD} renders HD</span>
        &nbsp;·&nbsp;
        <span style={{ color: f ? 'rgba(255,255,255,0.78)' : '#1a1a1a', fontWeight: 500 }}>{plan.renders2K} renders 2K</span>
        &nbsp;·&nbsp;
        <span style={{ color: f ? 'rgba(255,255,255,0.78)' : '#1a1a1a', fontWeight: 500 }}>{plan.renders4K} renders 4K</span>
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: billing === 'annual' ? 6 : 20 }}>
        <span style={{ fontSize: 12, fontWeight: 400, color: f ? 'rgba(255,255,255,0.4)' : '#86868b' }}>R$</span>
        <span style={{ fontSize: 22, fontWeight: 500, color: f ? '#fafafa' : '#1a1a1a', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' as const }}>{price}</span>
        <span style={{ fontSize: 11, color: f ? 'rgba(255,255,255,0.35)' : '#86868b', letterSpacing: '-0.005em' }}>/mês</span>
      </div>

      {billing === 'annual' && (
        <p style={{ fontSize: 10, letterSpacing: '-0.005em', marginBottom: 20, color: f ? 'rgba(255,255,255,0.35)' : '#86868b' }}>
          R$ {plan.annualTotal} cobrado anualmente
        </p>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ height: 2, borderRadius: 2, overflow: 'hidden', background: f ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}>
          <div style={{ height: '100%', borderRadius: 2, background: f ? '#30b46c' : '#1a1a1a', width: `${plan.meterPct}%` }} />
        </div>
      </div>

      <div style={{ height: 0.5, background: f ? 'rgba(255,255,255,0.1)' : '#e8e8e8', marginBottom: 20 }} />

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, flex: 1, listStyle: 'none', padding: 0 }}>
        {plan.features.map(feat => (
          <li key={feat} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, letterSpacing: '-0.005em', color: f ? 'rgba(255,255,255,0.75)' : '#1a1a1a' }}>
            <CheckIcon />
            {feat}
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(plan.key)}
        disabled={!!loading}
        style={{
          width: '100%', padding: '11px 16px', borderRadius: 8,
          fontFamily: 'inherit', fontSize: 12, fontWeight: 500, letterSpacing: '0.01em',
          cursor: loading ? 'wait' : 'pointer', transition: 'all 0.15s',
          border: f ? 'none' : '0.5px solid #e8e8e8',
          background: f ? '#fafafa' : '#f2f2f2',
          color: '#1a1a1a',
          opacity: loading && loading !== plan.key ? 0.5 : 1,
        }}
      >
        {loading === plan.key ? 'Redirecionando...' : `começar com ${plan.name.toLowerCase()}`}
      </button>
    </div>
  )
}

function QualityCard({ res, engine, cost, desc, tag, tagBg, tagColor }: typeof qualityCards[0]) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff', border: '0.5px solid #e8e8e8', borderRadius: 12, padding: '18px 20px',
        boxShadow: hovered ? '0 4px 20px rgba(0,0,0,0.06)' : 'none',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'box-shadow 0.2s, transform 0.2s',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.02em', marginBottom: 4 }}>{res}</div>
      <div style={{ fontSize: 10, color: '#86868b', letterSpacing: '-0.005em', marginBottom: 10 }}>{engine}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 10 }}>
        <span style={{ fontSize: 26, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' as const }}>{cost}</span>
        <span style={{ fontSize: 10, color: '#86868b', lineHeight: 1.3 }}>nodes<br />por render</span>
      </div>
      <div style={{ height: 0.5, background: '#e8e8e8', marginBottom: 10 }} />
      <div style={{ fontSize: 11, color: '#86868b', letterSpacing: '-0.005em', lineHeight: 1.55 }}>{desc}</div>
      <span style={{ display: 'inline-block', marginTop: 10, fontSize: 9, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' as const, padding: '3px 8px', borderRadius: 20, background: tagBg, color: tagColor }}>
        {tag}
      </span>
    </div>
  )
}

export function PricingToggle() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState<string | null>(null)
  const [renders, setRenders] = useState(40)
  const [qualityCost, setQualityCost] = useState(4)

  const totalNodes = renders * qualityCost
  const recommended = PLANS_DATA.find(p => p.nodes >= totalNodes) ?? PLANS_DATA[PLANS_DATA.length - 1]
  const recommendedName = totalNodes > PLANS_DATA[PLANS_DATA.length - 1].nodes ? 'Studio+' : recommended.name

  const handleSelect = async (key: string) => {
    setLoading(key)
    await startCheckout(key, billing)
    setLoading(null)
  }

  const handleRenders = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRenders(parseInt(e.target.value))
  }, [])

  return (
    <section id="planos" style={{ padding: '96px 24px', background: '#f2f2f2' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: '#86868b', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ display: 'block', width: 32, height: 0.5, background: '#e8e8e8', flexShrink: 0 }} />
            planos
            <span style={{ display: 'block', width: 32, height: 0.5, background: '#e8e8e8', flexShrink: 0 }} />
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10 }}>
            Escolha seu volume de geração
          </h2>
          <p style={{ fontSize: 13, color: '#86868b', letterSpacing: '-0.005em', lineHeight: 1.6 }}>
            Nodes renovam mensalmente. Cancele quando quiser.
          </p>

          {/* Billing toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', marginTop: 24, background: '#fff', border: '0.5px solid #e8e8e8', borderRadius: 40, padding: 4 }}>
            <button
              onClick={() => setBilling('monthly')}
              style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 500, letterSpacing: '-0.005em', color: billing === 'monthly' ? '#fafafa' : '#86868b', background: billing === 'monthly' ? '#1a1a1a' : 'transparent', border: 'none', borderRadius: 32, padding: '7px 16px', cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap' as const }}
            >
              Mensal
            </button>
            <button
              onClick={() => setBilling('annual')}
              style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 500, letterSpacing: '-0.005em', color: billing === 'annual' ? '#fafafa' : '#86868b', background: billing === 'annual' ? '#1a1a1a' : 'transparent', border: 'none', borderRadius: 32, padding: '7px 16px', cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: 7 }}
            >
              Anual
              <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const, background: '#30b46c', color: '#fff', padding: '2px 7px', borderRadius: 20 }}>
                2 meses grátis
              </span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'start' }}>
          {plans.map(plan => (
            <PlanCard key={plan.key} plan={plan} billing={billing} loading={loading} onSelect={handleSelect} />
          ))}
        </div>

        {/* Quality table */}
        <div style={{ marginTop: 40 }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#86868b', textAlign: 'center', marginBottom: 16 }}>
            consumo por qualidade
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {qualityCards.map(q => <QualityCard key={q.res} {...q} />)}
          </div>
        </div>

        {/* Calculator */}
        <div style={{ marginTop: 40, background: '#fff', border: '0.5px solid #e8e8e8', borderRadius: 14, padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap' as const, gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.01em' }}>Calculadora de Nodes</div>
              <div style={{ fontSize: 11, color: '#86868b', letterSpacing: '-0.005em' }}>Descubra qual plano se encaixa no seu fluxo</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1a1a1a', color: '#fafafa', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, letterSpacing: '-0.01em', whiteSpace: 'nowrap' as const }}>
              Plano recomendado:&nbsp;<span style={{ color: '#30b46c', fontWeight: 400 }}>{recommendedName}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#86868b', marginBottom: 10 }}>
                Renders por mês
              </label>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.03em', marginBottom: 4 }}>{renders} renders</div>
              <input type="range" min="5" max="200" step="5" value={renders} onChange={handleRenders} style={{ width: '100%', marginBottom: 8, cursor: 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#86868b' }}>
                <span>5</span><span>200+</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#86868b', marginBottom: 10 }}>
                Qualidade predominante
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {[{ label: 'HD', cost: 4 }, { label: '2K', cost: 8 }, { label: '4K', cost: 20 }].map(q => (
                  <button
                    key={q.label}
                    onClick={() => setQualityCost(q.cost)}
                    style={{ padding: '8px 6px', borderRadius: 7, fontFamily: 'inherit', fontSize: 11, fontWeight: 500, letterSpacing: '-0.005em', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' as const, border: `0.5px solid ${qualityCost === q.cost ? '#1a1a1a' : '#e8e8e8'}`, background: qualityCost === q.cost ? '#1a1a1a' : '#f2f2f2', color: qualityCost === q.cost ? '#fafafa' : '#86868b' }}
                  >
                    {q.label}
                    <small style={{ display: 'block', fontSize: 9, fontWeight: 400, opacity: 0.6, marginTop: 1 }}>{q.cost} nodes</small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ background: '#f2f2f2', borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 12 }}>
            {([
              { label: 'renders / mês',     value: String(renders),                          green: false },
              { label: 'nodes / render',    value: String(qualityCost),                      green: false },
              { label: 'nodes necessários', value: totalNodes.toLocaleString('pt-BR'),        green: false },
              { label: 'plano ideal',       value: recommendedName,                           green: true  },
            ]).map((item, i, arr) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, color: '#86868b', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>{item.label}</span>
                  <span style={{ fontSize: 16, fontWeight: 500, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' as const, color: item.green ? '#30b46c' : '#1a1a1a' }}>{item.value}</span>
                </div>
                {i < arr.length - 1 && <div style={{ width: 0.5, height: 28, background: '#e8e8e8' }} />}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <p style={{ fontSize: 11, color: '#86868b', letterSpacing: '-0.005em', lineHeight: 1.7 }}>
            Nodes renovam mensalmente e não acumulam para o mês seguinte.<br />
            Dúvidas?{' '}
            <a href="mailto:contato@spacenode.app" style={{ color: '#1a1a1a', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              fale com a gente.
            </a>
          </p>
        </div>

      </div>
    </section>
  )
}
