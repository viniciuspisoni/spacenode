'use client'

import { useState } from 'react'

async function startCheckout(plan: string, billing: 'monthly' | 'annual') {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, billing }),
  })

  if (res.status === 401) {
    window.location.href = '/login'
    return
  }

  const data = await res.json()
  if (data.url) window.location.href = data.url
}

const plans = [
  {
    name: 'Starter',
    credits: 50,
    monthlyPrice: 89,
    annualMonthlyPrice: 67,
    annualTotal: 804,
    annualSaving: 264,
    featured: false,
    features: ['Motor padrão', 'Saída até 1K', 'Histórico ilimitado', 'Suporte por e-mail'],
    locked: ['Motores avançados'],
    cta: 'Começar com Starter',
  },
  {
    name: 'Pro',
    credits: 150,
    monthlyPrice: 149,
    annualMonthlyPrice: 112,
    annualTotal: 1344,
    annualSaving: 444,
    featured: true,
    features: ['Todos os motores', 'Saída até 2K', 'Histórico ilimitado', 'Suporte por e-mail', 'Motor Flux Dev'],
    locked: [],
    cta: 'Começar com Pro',
  },
  {
    name: 'Studio',
    credits: 500,
    monthlyPrice: 299,
    annualMonthlyPrice: 224,
    annualTotal: 2688,
    annualSaving: 900,
    featured: false,
    features: ['Todos os motores', 'Saída até 4K', 'Histórico ilimitado', 'Suporte prioritário', 'Acesso API (beta)'],
    locked: [],
    cta: 'Começar com Studio',
  },
]

export function PricingToggle() {
  const [isAnnual, setIsAnnual] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  const handleSelect = async (planName: string) => {
    setLoading(planName)
    await startCheckout(planName.toLowerCase(), isAnnual ? 'annual' : 'monthly')
    setLoading(null)
  }

  return (
    <section style={{ padding: '96px 24px', maxWidth: 960, margin: '0 auto' }}>

      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'rgba(255,255,255,0.1)' }} />
          Planos
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'rgba(255,255,255,0.1)' }} />
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10, color: '#fafafa' }}>
          escolha seu volume de geração.
        </h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: '-0.005em', lineHeight: 1.6 }}>
          Créditos renovam mensalmente. Cancele quando quiser. Sem fidelidade.
        </p>
      </div>

      {/* Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 48 }}>
        <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em', color: !isAnnual ? '#fafafa' : 'rgba(255,255,255,0.4)' }}>Mensal</span>
        <button
          onClick={() => setIsAnnual(v => !v)}
          style={{ width: 44, height: 24, background: 'rgba(255,255,255,0.15)', borderRadius: 12, position: 'relative', cursor: 'pointer', flexShrink: 0, border: '0.5px solid rgba(255,255,255,0.15)', padding: 0 }}
        >
          <span style={{
            position: 'absolute', top: 3, left: 3, width: 18, height: 18, background: '#fafafa', borderRadius: '50%',
            transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
            transform: isAnnual ? 'translateX(20px)' : 'translateX(0)',
            display: 'block',
          }} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em', color: isAnnual ? '#fafafa' : 'rgba(255,255,255,0.4)' }}>Anual</span>
        <span style={{
          fontSize: 9, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
          background: 'rgba(48,180,108,0.15)', color: '#30b46c', padding: '3px 8px', borderRadius: 20,
          opacity: isAnnual ? 1 : 0.4, transition: 'opacity 0.2s',
        }}>Economize 25%</span>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'start' }}>
        {plans.map(plan => (
          <div
            key={plan.name}
            style={{
              background: plan.featured ? '#fafafa' : 'rgba(255,255,255,0.04)',
              border: `0.5px solid ${plan.featured ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 14, padding: '28px 24px 24px',
              display: 'flex', flexDirection: 'column',
              position: 'relative', overflow: 'hidden',
            }}
          >
            {plan.featured && (
              <div style={{
                position: 'absolute', top: 16, right: 16,
                fontSize: 9, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase',
                background: '#30b46c', color: '#fff', padding: '3px 8px', borderRadius: 20,
              }}>recomendado</div>
            )}

            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: plan.featured ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)', marginBottom: 20 }}>
              {plan.name}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 40, fontWeight: 500, color: plan.featured ? '#1a1a1a' : '#fafafa', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {plan.credits}
              </span>
              <span style={{ fontSize: 11, color: plan.featured ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)' }}>créditos / mês</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4, marginTop: 2 }}>
              <span style={{ fontSize: 12, color: plan.featured ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)' }}>R$</span>
              <span style={{
                fontSize: 22, fontWeight: 500,
                color: plan.featured ? '#1a1a1a' : '#fafafa',
                letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
                transition: 'opacity 0.15s',
              }}>
                {isAnnual ? plan.annualMonthlyPrice : plan.monthlyPrice}
              </span>
              <span style={{ fontSize: 11, color: plan.featured ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)' }}>/mês</span>
            </div>

            <div style={{ fontSize: 10, color: plan.featured ? '#1a9e5c' : '#30b46c', minHeight: 15, letterSpacing: '-0.005em', marginBottom: 0 }}>
              {isAnnual ? `R$${plan.annualTotal.toLocaleString('pt-BR')}/ano · economize R$${plan.annualSaving}` : ''}
            </div>

            <div style={{ height: '0.5px', background: plan.featured ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)', margin: '20px 0' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, flex: 1 }}>
              {plan.features.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: plan.featured ? '#1a1a1a' : 'rgba(255,255,255,0.7)', letterSpacing: '-0.005em' }}>
                  <span style={{ color: '#30b46c', fontSize: 12, flexShrink: 0 }}>✓</span> {f}
                </div>
              ))}
              {plan.locked.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'rgba(255,255,255,0.2)', letterSpacing: '-0.005em' }}>
                  <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: 12, flexShrink: 0 }}>✓</span> {f}
                </div>
              ))}
            </div>

            <button
              onClick={() => handleSelect(plan.name)}
              disabled={loading === plan.name.toLowerCase()}
              style={{
                width: '100%', padding: '11px 16px', borderRadius: 8,
                fontFamily: 'inherit', fontSize: 12, fontWeight: 500, letterSpacing: '0.01em',
                cursor: loading ? 'wait' : 'pointer',
                background: plan.featured ? '#1a1a1a' : 'rgba(255,255,255,0.06)',
                color: plan.featured ? '#fafafa' : 'rgba(255,255,255,0.8)',
                border: plan.featured ? 'none' : '0.5px solid rgba(255,255,255,0.12)',
                opacity: loading && loading !== plan.name.toLowerCase() ? 0.5 : 1,
              }}
            >
              {loading === plan.name.toLowerCase() ? 'Redirecionando...' : plan.cta}
            </button>
          </div>
        ))}
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 24, lineHeight: 1.6 }}>
        Cada render consome 1 crédito. Créditos não utilizados não acumulam.{' '}
        <a href="mailto:contato@spacenode.app" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Dúvidas? fale com a gente
        </a>
      </p>
    </section>
  )
}
