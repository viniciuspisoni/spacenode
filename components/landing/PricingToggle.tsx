'use client'

import { useState, useCallback } from 'react'
import { ENGINES, ENGINE_ORDER, type Resolution } from '@/lib/engines'
import { PLANS, recommendPlan, type PaidPlanId, type BillingCycle } from '@/lib/plans'
import { LUMEN_PACKS } from '@/lib/lumens'
import { SUPPORT_EMAIL, supportWhatsAppUrl } from '@/lib/support'

// UI-specific data por plano: features, badge, breakdown de renders.
// Renders calculados com engine padrão por resolução: HD→Pulsar (10 nodes),
// 2K→Vega (20), 4K→Vega (40). meterPct é proporcional ao maior plano (Office=100%).
interface PlanDisplay {
  rendersHD: number
  renders2K: number
  renders4K: number
  monthlyAnnualLabel: string
  meterPct: number
  featured: boolean
  badge: string
  features: string[]
}

const PLAN_DISPLAY: Record<PaidPlanId, PlanDisplay> = {
  starter: {
    rendersHD: 75,  renders2K: 37,  renders4K: 18,
    monthlyAnnualLabel: '890', meterPct: 9, featured: false, badge: '',
    features: ['Acesso a todos os motores', 'Renders em HD, 2K e 4K', 'Suporte por e-mail'],
  },
  pro: {
    rendersHD: 180, renders2K: 90,  renders4K: 45,
    monthlyAnnualLabel: '1.990', meterPct: 23, featured: true, badge: 'recomendado',
    features: ['Acesso a todos os motores', 'Lumens avulsos disponíveis', 'Suporte por e-mail'],
  },
  studio: {
    rendersHD: 350, renders2K: 175, renders4K: 87,
    monthlyAnnualLabel: '3.490', meterPct: 44, featured: false, badge: '',
    features: ['Acesso a todos os motores', 'Lumens avulsos disponíveis', 'Suporte prioritário'],
  },
  office: {
    rendersHD: 800, renders2K: 400, renders4K: 200,
    monthlyAnnualLabel: '6.990', meterPct: 100, featured: false, badge: '',
    features: ['Acesso a todos os motores', 'Lumens avulsos disponíveis', 'Suporte prioritário'],
  },
}

async function startCheckout(id: PaidPlanId, billing: BillingCycle) {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'plan', id, billing }),
  })
  if (res.status === 401) { window.location.href = '/login?mode=signup'; return }
  if (!res.ok) return
  const data = await res.json()
  if (data.url) window.location.href = data.url
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--color-accent-green)' }}>
    <path d="M2 7l3.5 3.5L12 3.5"/>
  </svg>
)

function PlanCard({ planId, billing, loading, onSelect }: {
  planId: PaidPlanId
  billing: BillingCycle
  loading: string | null
  onSelect: (id: PaidPlanId) => void
}) {
  const plan = PLANS.find(p => p.id === planId)!
  const d = PLAN_DISPLAY[planId]
  const [hovered, setHovered] = useState(false)
  const price = billing === 'annual' ? plan.annualMonthlyPrice : plan.monthlyPrice
  const f = d.featured

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: f ? '#1a1a1a' : 'var(--color-bg-elevated)',
        border: `0.5px solid ${f ? 'rgba(255,255,255,0.1)' : 'var(--color-border-strong)'}`,
        borderTop: f ? '2px solid #30d158' : '0.5px solid var(--color-border-strong)',
        borderRadius: 14, padding: '28px 24px 24px',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
        boxShadow: hovered ? (f ? '0 8px 40px rgba(0,0,0,0.5)' : '0 4px 24px rgba(0,0,0,0.2)') : 'none',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'box-shadow 0.2s, transform 0.2s',
      }}
    >
      {d.badge && (
        <div style={{
          position: 'absolute', top: 16, right: 16,
          fontSize: 9, fontWeight: 500, letterSpacing: '0.14em',
          textTransform: 'uppercase' as const,
          background: 'rgba(48,209,88,0.15)', color: 'var(--color-accent-green)',
          padding: '3px 8px', borderRadius: 20,
          border: '0.5px solid rgba(48,209,88,0.25)',
        }}>
          {d.badge}
        </div>
      )}

      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
        textTransform: 'uppercase' as const,
        color: f ? 'rgba(255,255,255,0.4)' : 'var(--color-text-tertiary)',
        marginBottom: 20,
      }}>
        {plan.name}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 3 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: f ? 'rgba(255,255,255,0.5)' : 'var(--color-text-tertiary)' }}>R$</span>
        <span style={{
          fontSize: 42, fontWeight: 500,
          color: f ? '#fafafa' : 'var(--color-text-primary)',
          letterSpacing: '-0.04em', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums' as const,
        }}>
          {price}
        </span>
        <span style={{ fontSize: 13, color: f ? 'rgba(255,255,255,0.4)' : 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
          /mês
        </span>
      </div>

      {billing === 'annual' ? (
        <p style={{ fontSize: 10.5, letterSpacing: '-0.005em', marginBottom: 14, color: f ? 'rgba(255,255,255,0.3)' : 'var(--color-text-tertiary)' }}>
          R$ {d.monthlyAnnualLabel} cobrado anualmente
        </p>
      ) : (
        <div style={{ marginBottom: 14 }} />
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
        <span style={{
          fontSize: 15, fontWeight: 500,
          color: f ? 'rgba(255,255,255,0.7)' : 'var(--color-text-primary)',
          letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' as const,
        }}>
          {plan.nodes.toLocaleString('pt-BR')}
        </span>
        <span style={{ fontSize: 11, color: f ? 'rgba(255,255,255,0.35)' : 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
          nodes / mês
        </span>
      </div>

      <p style={{
        fontSize: 10.5, letterSpacing: '-0.005em', marginBottom: 20,
        lineHeight: 1.55,
        color: f ? 'rgba(255,255,255,0.28)' : 'var(--color-text-tertiary)',
      }}>
        <span style={{ color: f ? 'rgba(255,255,255,0.75)' : 'var(--color-text-primary)', fontWeight: 500 }}>{d.rendersHD} renders HD</span>
        &nbsp;·&nbsp;
        <span style={{ color: f ? 'rgba(255,255,255,0.75)' : 'var(--color-text-primary)', fontWeight: 500 }}>{d.renders2K} renders 2K</span>
        &nbsp;·&nbsp;
        <span style={{ color: f ? 'rgba(255,255,255,0.75)' : 'var(--color-text-primary)', fontWeight: 500 }}>{d.renders4K} renders 4K</span>
      </p>

      <div style={{ marginBottom: 20 }}>
        <div style={{
          height: 2, borderRadius: 2, overflow: 'hidden',
          background: f ? 'rgba(255,255,255,0.08)' : 'var(--color-border-strong)',
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: f ? 'var(--color-accent-green)' : 'var(--color-text-primary)',
            width: `${d.meterPct}%`,
          }} />
        </div>
      </div>

      <div style={{ height: 0.5, background: f ? 'rgba(255,255,255,0.08)' : 'var(--color-border-strong)', marginBottom: 20 }} />

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, flex: 1, listStyle: 'none', padding: 0 }}>
        {d.features.map(feat => (
          <li key={feat} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12, letterSpacing: '-0.005em',
            color: f ? 'rgba(255,255,255,0.7)' : 'var(--color-text-primary)',
          }}>
            <CheckIcon />
            {feat}
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(plan.id)}
        disabled={loading !== null}
        style={{
          width: '100%', padding: '11px 16px', borderRadius: 8,
          fontFamily: 'inherit', fontSize: 12, fontWeight: 500, letterSpacing: '0.01em',
          cursor: loading ? 'wait' : 'pointer', transition: 'all 0.15s',
          border: f ? 'none' : '0.5px solid var(--color-border-strong)',
          background: f ? 'var(--color-text-primary)' : 'var(--color-surface)',
          color: f ? 'var(--color-bg)' : 'var(--color-text-primary)',
          opacity: loading && loading !== plan.id ? 0.5 : 1,
        }}
      >
        {loading === plan.id ? 'Redirecionando...' : plan.cta}
      </button>
    </div>
  )
}

function ConsumptionTable() {
  const resolutions: Resolution[] = ['hd', '2k', '4k']
  const headCellBase = {
    fontSize: 10, fontWeight: 500,
    letterSpacing: '0.14em', textTransform: 'uppercase' as const,
    color: 'var(--color-text-tertiary)',
    padding: '0 16px 14px', borderBottom: '0.5px solid var(--color-border-strong)',
  }
  const bodyCellBase = {
    padding: '14px 16px', fontSize: 13, color: 'var(--color-text-primary)',
    fontVariantNumeric: 'tabular-nums' as const,
    borderBottom: '0.5px solid var(--color-border)',
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...headCellBase, textAlign: 'left' }}>Motor</th>
          {resolutions.map(r => (
            <th key={r} style={{ ...headCellBase, textAlign: 'right' }}>{r.toUpperCase()}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ENGINE_ORDER.map((eid, idx) => {
          const e = ENGINES[eid]
          const isLast = idx === ENGINE_ORDER.length - 1
          const cellStyle = isLast ? { ...bodyCellBase, borderBottom: 'none' } : bodyCellBase
          return (
            <tr key={eid}>
              <td style={{ ...cellStyle, textAlign: 'left' }}>
                <span style={{ fontWeight: 500 }}>{e.name}</span>
                <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8, fontSize: 11 }}>
                  · {e.tagline}
                </span>
              </td>
              {resolutions.map(r => {
                const cost = e.nodes[r]
                return (
                  <td key={r} style={{ ...cellStyle, textAlign: 'right' }}>
                    {cost !== undefined
                      ? <span><span style={{ fontWeight: 500 }}>{cost}</span> <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>nodes</span></span>
                      : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const TOP_PLAN_NODES = PLANS[PLANS.length - 1].nodes

export function PricingToggle() {
  const [billing, setBilling]         = useState<BillingCycle>('monthly')
  const [loading, setLoading]         = useState<string | null>(null)
  const [renders, setRenders]         = useState(40)
  const [qualityCost, setQualityCost] = useState(10)

  const totalNodes      = renders * qualityCost
  const recommended     = recommendPlan(totalNodes)
  const overflow        = totalNodes > TOP_PLAN_NODES
  const overflowAmount  = overflow ? totalNodes - TOP_PLAN_NODES : 0
  const suggestedLumen  = overflow
    ? (LUMEN_PACKS.find(p => p.nodes >= overflowAmount) ?? LUMEN_PACKS[LUMEN_PACKS.length - 1])
    : null

  const handleSelect = async (id: PaidPlanId) => {
    setLoading(id)
    try {
      await startCheckout(id, billing)
    } finally {
      setLoading(null)
    }
  }

  const handleRenders = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRenders(parseInt(e.target.value))
  }, [])

  return (
    <section id="planos" className="spn-pricing" style={{ background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.22em',
            textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)',
            marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <span style={{ display: 'block', width: 32, height: 0.5, background: 'var(--color-border-strong)', flexShrink: 0 }} />
            planos
            <span style={{ display: 'block', width: 32, height: 0.5, background: 'var(--color-border-strong)', flexShrink: 0 }} />
          </div>
          <h2 className="spn-pricing-title">
            escolha seu volume de geração.
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em', lineHeight: 1.6, maxWidth: 520, margin: '0 auto' }}>
            Nodes são os créditos usados para gerar, editar ou ampliar imagens
            na plataforma. Renovam todo mês — e no plano mensal você cancela
            quando quiser.
          </p>

          {/* Billing toggle */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', marginTop: 24,
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 40, padding: 4,
          }}>
            <button
              onClick={() => setBilling('monthly')}
              style={{
                fontFamily: 'inherit', fontSize: 11, fontWeight: 500, letterSpacing: '-0.005em',
                color: billing === 'monthly' ? 'var(--color-bg)' : 'var(--color-text-tertiary)',
                background: billing === 'monthly' ? 'var(--color-text-primary)' : 'transparent',
                border: 'none', borderRadius: 32, padding: '7px 16px',
                cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap' as const,
              }}
            >
              Mensal
            </button>
            <button
              onClick={() => setBilling('annual')}
              style={{
                fontFamily: 'inherit', fontSize: 11, fontWeight: 500, letterSpacing: '-0.005em',
                color: billing === 'annual' ? 'var(--color-bg)' : 'var(--color-text-tertiary)',
                background: billing === 'annual' ? 'var(--color-text-primary)' : 'transparent',
                border: 'none', borderRadius: 32, padding: '7px 16px',
                cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap' as const,
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              Anual
              <span style={{
                fontSize: 9, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
                background: 'rgba(48,209,88,0.15)', color: 'var(--color-accent-green)',
                padding: '2px 7px', borderRadius: 20,
                border: '0.5px solid rgba(48,209,88,0.25)',
              }}>
                2 meses grátis
              </span>
            </button>
          </div>
        </div>

        {/* Plan cards: 4 colunas em desktop, auto-fit em telas menores */}
        <div
          className="spn-pricing-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12, alignItems: 'start',
          }}
        >
          {PLANS.map(p => (
            <PlanCard key={p.id} planId={p.id} billing={billing} loading={loading} onSelect={handleSelect} />
          ))}
        </div>

        {/* Risk-reduction microcopy */}
        <p style={{
          textAlign: 'center', marginTop: 20,
          fontSize: 12, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em',
        }}>
          Ainda em dúvida?{' '}
          <a href="/login?mode=signup" style={{ color: 'var(--color-text-primary)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Comece grátis com 80 nodes
          </a>
          {' '}— assine quando o volume pedir.
        </p>

        {/* Engine × resolution table */}
        <div style={{ marginTop: 40 }}>
          <div style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
            textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)',
            textAlign: 'center', marginBottom: 16,
          }}>
            consumo por motor de IA
          </div>
          <div
            className="spn-pricing-engines"
            style={{
              background: 'var(--color-bg-elevated)',
              border: '0.5px solid var(--color-border-strong)',
              borderRadius: 14, padding: '8px 12px 4px',
            }}
          >
            <ConsumptionTable />
          </div>
        </div>

        {/* Calculator */}
        <div
          className="spn-pricing-calc"
          style={{
            marginTop: 40,
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 14, padding: '28px 32px',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 24, flexWrap: 'wrap' as const, gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                Calculadora de Nodes
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
                Descubra qual plano se encaixa no seu fluxo
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border-strong)',
              color: 'var(--color-text-primary)',
              padding: '8px 14px', borderRadius: 8,
              fontSize: 12, fontWeight: 500, letterSpacing: '-0.01em', whiteSpace: 'nowrap' as const,
            }}>
              {overflow
                ? <>Sugestão:&nbsp;<span style={{ color: 'var(--color-accent-green)', fontWeight: 400 }}>{recommended.name} + {suggestedLumen!.name}</span></>
                : <>Plano recomendado:&nbsp;<span style={{ color: 'var(--color-accent-green)', fontWeight: 400 }}>{recommended.name}</span></>}
            </div>
          </div>

          <div className="spn-pricing-calc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <label style={{
                display: 'block', fontSize: 10, fontWeight: 500, letterSpacing: '0.14em',
                textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', marginBottom: 10,
              }}>
                Renders por mês
              </label>
              <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', marginBottom: 4 }}>
                {renders} renders
              </div>
              <input
                type="range" min="5" max="200" step="5" value={renders}
                onChange={handleRenders}
                style={{ width: '100%', marginBottom: 8, cursor: 'pointer', accentColor: 'var(--color-accent-green)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                <span>5</span><span>200+</span>
              </div>
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: 10, fontWeight: 500, letterSpacing: '0.14em',
                textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', marginBottom: 10,
              }}>
                Qualidade predominante
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {[{ label: 'HD', cost: 10 }, { label: '2K', cost: 20 }, { label: '4K', cost: 40 }].map(q => (
                  <button
                    key={q.label}
                    onClick={() => setQualityCost(q.cost)}
                    style={{
                      padding: '8px 6px', borderRadius: 7, fontFamily: 'inherit',
                      fontSize: 11, fontWeight: 500, letterSpacing: '-0.005em',
                      cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' as const,
                      border: `0.5px solid ${qualityCost === q.cost ? 'var(--color-text-primary)' : 'var(--color-border-strong)'}`,
                      background: qualityCost === q.cost ? 'var(--color-text-primary)' : 'var(--color-surface)',
                      color: qualityCost === q.cost ? 'var(--color-bg)' : 'var(--color-text-tertiary)',
                    }}
                  >
                    {q.label}
                    <small style={{ display: 'block', fontSize: 9, fontWeight: 400, opacity: 0.6, marginTop: 1 }}>{q.cost} nodes</small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Result strip */}
          <div
            className="spn-pricing-result"
            style={{
              background: 'var(--color-surface)', borderRadius: 8, padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap' as const, gap: 12,
            }}
          >
            {([
              { label: 'renders / mês',     value: String(renders),                                       green: false },
              { label: 'nodes / render',    value: String(qualityCost),                                   green: false },
              { label: 'nodes necessários', value: totalNodes.toLocaleString('pt-BR'),                    green: false },
              { label: 'plano ideal',       value: overflow ? `${recommended.name} + ${suggestedLumen!.name}` : recommended.name, green: true },
            ]).map((item, i, arr) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                    {item.label}
                  </span>
                  <span style={{
                    fontSize: 16, fontWeight: 500, letterSpacing: '-0.03em',
                    fontVariantNumeric: 'tabular-nums' as const,
                    color: item.green ? 'var(--color-accent-green)' : 'var(--color-text-primary)',
                  }}>
                    {item.value}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ width: 0.5, height: 28, background: 'var(--color-border-strong)' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em', lineHeight: 1.7 }}>
            Nodes renovam mensalmente e não acumulam para o mês seguinte.<br />
            Lumens (créditos avulsos) ficam disponíveis a partir do plano Pro.<br />
            Dúvidas?{' '}
            <a
              href={supportWhatsAppUrl('Olá! Tenho uma dúvida sobre os planos da SPACENODE.')}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-text-primary)', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              chame no WhatsApp
            </a>
            {' '}ou escreva para{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--color-text-primary)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              {SUPPORT_EMAIL}
            </a>.
          </p>
        </div>

      </div>

      <style jsx>{`
        .spn-pricing {
          padding: 96px 24px;
        }
        .spn-pricing-title {
          font-size: 28px;
          font-weight: 500;
          color: var(--color-text-primary);
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin-bottom: 10px;
        }
        .spn-pricing-engines {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        @media (max-width: 768px) {
          .spn-pricing {
            padding: 72px 20px !important;
          }
          .spn-pricing-title {
            font-size: 24px;
          }
          .spn-pricing-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .spn-pricing-calc {
            padding: 22px 20px !important;
          }
          .spn-pricing-calc-grid {
            grid-template-columns: 1fr !important;
            gap: 22px !important;
          }
          .spn-pricing-result {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 0 !important;
          }
          .spn-pricing-result > div {
            width: 100%;
            justify-content: space-between !important;
            padding: 10px 4px;
            border-bottom: 0.5px solid var(--color-border);
          }
          .spn-pricing-result > div:last-child { border-bottom: none; }
          .spn-pricing-result > div > div:not(:first-child) {
            display: none !important;
          }
        }
      `}</style>
    </section>
  )
}
