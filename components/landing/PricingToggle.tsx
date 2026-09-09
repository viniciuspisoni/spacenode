'use client'

import { useState, useCallback } from 'react'
import { ANNUAL_BILLING_ENABLED, SELLABLE_PLANS, recommendPlan, type SellablePlanId, type PaidPlanId, type BillingCycle } from '@/lib/plans'
import { EXTRA_NODE_PACKS } from '@/lib/extra-nodes'
import { SUPPORT_EMAIL, supportWhatsAppUrl } from '@/lib/support'
import { formatBRL } from '@/lib/launch-offer'

// A vitrine (Starter / Pro / Studio) vem de SELLABLE_PLANS — o Office é
// legado (2026-08-31): fora de venda, mas segue no catálogo p/ assinantes
// existentes (billing/webhook).
//
// A tabela "consumo por motor de IA" saiu na reforma de vidro (2026-09-09):
// era a única parte da landing que exigia saber o nome dos motores para ser
// lida. Quem precisa do detalhe encontra no app, na hora de gerar.

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

// Renders calculados com engine padrão por resolução: HD→Pulsar (10 nodes),
// 2K→Vega (20), 4K→Vega (40). meterPct é proporcional ao maior plano
// exibido (Studio=100%). Nodes extras valem p/ qualquer plano pago.
const PLAN_DISPLAY: Record<SellablePlanId, PlanDisplay> = {
  starter: {
    rendersHD: 75,  renders2K: 37,  renders4K: 18,
    monthlyAnnualLabel: '890', meterPct: 21, featured: false, badge: '',
    features: ['Acesso a todos os motores', 'Nodes extras disponíveis', 'Suporte por e-mail'],
  },
  pro: {
    rendersHD: 180, renders2K: 90,  renders4K: 45,
    monthlyAnnualLabel: '1.990', meterPct: 51, featured: true, badge: 'recomendado',
    features: ['Acesso a todos os motores', 'Nodes extras disponíveis', 'Suporte por e-mail'],
  },
  studio: {
    rendersHD: 350, renders2K: 175, renders4K: 87,
    monthlyAnnualLabel: '3.490', meterPct: 100, featured: false, badge: '',
    features: ['Acesso a todos os motores', 'Nodes extras disponíveis', 'Suporte prioritário'],
  },
}

async function startCheckout(id: PaidPlanId, billing: BillingCycle) {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'plan', id, billing }),
  })
  if (res.status === 401) { window.location.href = '/login?mode=signup'; return }
  // Já assinante (guarda anti-cobrança-dupla) — plano se gerencia no billing.
  if (res.status === 409) { window.location.href = '/app/billing'; return }
  if (!res.ok) return
  const data = await res.json()
  if (data.url) window.location.href = data.url
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--color-accent-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
    <path d="M2 7l3.5 3.5L12 3.5" />
  </svg>
)

// Antes o plano recomendado se distinguia por ser o único cartão PRETO numa
// landing clara. Com a landing inteira escura isso deixou de existir: agora
// ele é o vidro mais claro da fileira, com a aresta de cima em verde.
function PlanCard({ planId, billing, loading, onSelect }: {
  planId: SellablePlanId
  billing: BillingCycle
  loading: string | null
  onSelect: (id: PaidPlanId) => void
}) {
  const plan = SELLABLE_PLANS.find(p => p.id === planId)!
  const d = PLAN_DISPLAY[planId]
  const price = billing === 'annual' ? plan.annualMonthlyPrice : plan.monthlyPrice

  return (
    <div className="spn-plan spn-glass" data-featured={d.featured}>
      {d.badge && <span className="spn-plan-badge">{d.badge}</span>}

      <span className="spn-plan-name">{plan.name}</span>

      <div className="spn-plan-price">
        <span className="spn-plan-currency">R$</span>
        <span className="spn-plan-amount">{formatBRL(price)}</span>
        <span className="spn-plan-period">/mês</span>
      </div>

      {billing === 'annual' && (
        <p className="spn-plan-annual">R$ {d.monthlyAnnualLabel} cobrado anualmente</p>
      )}

      <div className="spn-plan-nodes">
        <span className="spn-plan-nodes-n">{plan.nodes.toLocaleString('pt-BR')}</span>
        <span className="spn-plan-nodes-l">nodes / mês</span>
      </div>

      <p className="spn-plan-renders">
        <b>{d.rendersHD}</b> HD&nbsp;·&nbsp;<b>{d.renders2K}</b> 2K&nbsp;·&nbsp;<b>{d.renders4K}</b> 4K
      </p>

      <div className="spn-plan-meter">
        <span style={{ width: `${d.meterPct}%` }} />
      </div>

      <ul className="spn-plan-features">
        {d.features.map(feat => (
          <li key={feat}><CheckIcon />{feat}</li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onSelect(plan.id)}
        disabled={loading !== null}
        className="spn-plan-cta"
        style={{ opacity: loading && loading !== plan.id ? 0.5 : 1 }}
      >
        {loading === plan.id ? 'Redirecionando…' : plan.cta}
      </button>

      <style jsx>{`
        .spn-plan {
          position: relative;
          display: flex;
          flex-direction: column;
          padding: 28px 24px 24px;
          border-radius: var(--r-card);
          transition: transform 200ms var(--ease), box-shadow 200ms var(--ease);
        }
        .spn-plan:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-float);
        }
        .spn-plan[data-featured='true'] {
          background: var(--glass-raised);
          border-top: 1.5px solid var(--color-accent-green);
          box-shadow: var(--shadow-float), inset 0 0.5px 0 var(--glass-spec);
        }
        .spn-plan-badge {
          position: absolute;
          top: 16px;
          right: 16px;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          background: var(--color-accent-green-bg);
          color: var(--color-accent-green);
          border: 0.5px solid var(--color-accent-green-border);
          padding: 3px 8px;
          border-radius: var(--radius-full);
        }
        .spn-plan-name {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 20px;
        }
        .spn-plan-price {
          display: flex;
          align-items: baseline;
          gap: 5px;
          margin-bottom: 14px;
        }
        .spn-plan-currency { font-size: 15px; font-weight: 500; color: var(--color-text-tertiary); }
        .spn-plan-amount {
          font-size: 42px;
          font-weight: 500;
          letter-spacing: -0.04em;
          line-height: 1;
          color: var(--color-text-primary);
          font-variant-numeric: tabular-nums;
        }
        .spn-plan-period { font-size: 13px; color: var(--color-text-tertiary); }
        .spn-plan-annual {
          font-size: 10.5px;
          color: var(--color-text-tertiary);
          margin: -10px 0 14px;
        }
        .spn-plan-nodes {
          display: flex;
          align-items: baseline;
          gap: 6px;
          margin-bottom: 10px;
        }
        .spn-plan-nodes-n {
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--color-text-primary);
          font-variant-numeric: tabular-nums;
        }
        .spn-plan-nodes-l { font-size: 11px; color: var(--color-text-tertiary); }
        .spn-plan-renders {
          font-size: 11px;
          line-height: 1.55;
          color: var(--color-text-tertiary);
          margin: 0 0 18px;
        }
        .spn-plan-renders b { color: var(--color-text-primary); font-weight: 500; }
        .spn-plan-meter {
          height: 2px;
          border-radius: 2px;
          overflow: hidden;
          background: var(--glass-line-strong);
          margin-bottom: 20px;
        }
        .spn-plan-meter span {
          display: block;
          height: 100%;
          border-radius: 2px;
          background: var(--color-text-primary);
        }
        .spn-plan[data-featured='true'] .spn-plan-meter span { background: var(--color-accent-green); }
        .spn-plan-features {
          list-style: none;
          padding: 20px 0 0;
          margin: 0 0 26px;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 10px;
          border-top: 0.5px solid var(--glass-line);
        }
        .spn-plan-features li {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          letter-spacing: -0.005em;
          color: var(--color-text-secondary);
        }
        .spn-plan-cta {
          width: 100%;
          padding: 13px 16px;
          min-height: 46px;
          border-radius: var(--r-inner);
          font-family: inherit;
          font-size: 12.5px;
          font-weight: 500;
          letter-spacing: 0.01em;
          cursor: pointer;
          border: 0.5px solid var(--glass-line-strong);
          background: var(--glass-raised);
          color: var(--color-text-primary);
          transition: background 150ms var(--ease), border-color 150ms var(--ease);
        }
        .spn-plan[data-featured='true'] .spn-plan-cta {
          background: var(--color-inverse);
          color: var(--color-inverse-foreground);
          border-color: transparent;
        }
        .spn-plan-cta:hover:not(:disabled) { border-color: var(--color-border-focus); }
        .spn-plan-cta:disabled { cursor: wait; }
        .spn-plan-cta:focus-visible {
          outline: 1.5px solid var(--color-border-focus);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-plan { transition: none; }
          .spn-plan:hover { transform: none; }
        }
      `}</style>
    </div>
  )
}

const TOP_PLAN_NODES = SELLABLE_PLANS[SELLABLE_PLANS.length - 1].nodes
const QUALITIES = [{ label: 'HD', cost: 10 }, { label: '2K', cost: 20 }, { label: '4K', cost: 40 }]

export function PricingToggle() {
  const [billing, setBilling]         = useState<BillingCycle>('monthly')
  const [loading, setLoading]         = useState<string | null>(null)
  const [renders, setRenders]         = useState(40)
  const [qualityCost, setQualityCost] = useState(10)

  const totalNodes     = renders * qualityCost
  const recommended    = recommendPlan(totalNodes)
  const overflow       = totalNodes > TOP_PLAN_NODES
  const overflowAmount = overflow ? totalNodes - TOP_PLAN_NODES : 0
  const suggestedExtra = overflow
    ? (EXTRA_NODE_PACKS.find(p => p.nodes >= overflowAmount) ?? EXTRA_NODE_PACKS[EXTRA_NODE_PACKS.length - 1])
    : null
  const suggestion = overflow ? `${recommended.name} + ${suggestedExtra!.name}` : recommended.name

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
    <section id="planos" className="spn-pricing">
      <div className="spn-pricing-head">
        <h2 className="spn-pricing-title">escolha seu volume de geração.</h2>
        <p className="spn-pricing-sub">
          Nodes são os créditos de geração. Renovam todo mês — e no plano
          mensal você cancela quando quiser.
        </p>

        {/* Billing toggle — some junto com a pausa do ciclo anual */}
        {ANNUAL_BILLING_ENABLED && (
          <div className="spn-pricing-toggle spn-glass">
            <button type="button" onClick={() => setBilling('monthly')} data-on={billing === 'monthly'}>
              Mensal
            </button>
            <button type="button" onClick={() => setBilling('annual')} data-on={billing === 'annual'}>
              Anual
              <span className="spn-pricing-toggle-tag">2 meses grátis</span>
            </button>
          </div>
        )}
      </div>

      <div className="spn-pricing-grid">
        {SELLABLE_PLANS.map(p => (
          <PlanCard key={p.id} planId={p.id} billing={billing} loading={loading} onSelect={handleSelect} />
        ))}
      </div>

      {/* Calculadora: o caminho inverso dos cartões — de quantos renders por
          mês para qual plano. Volume acima do topo cai em Studio + pack. */}
      <div className="spn-calc spn-glass">
        <div className="spn-calc-head">
          <span className="spn-calc-label">quantos renders por mês?</span>
          <span className="spn-calc-pick spn-glass--raised">
            plano ideal <b>{suggestion}</b>
          </span>
        </div>

        <div className="spn-calc-grid">
          <div>
            <div className="spn-calc-value">{renders} renders</div>
            <input
              type="range" min="5" max="200" step="5" value={renders}
              onChange={handleRenders}
              aria-label="Renders por mês"
              className="spn-calc-range"
            />
            <div className="spn-calc-scale"><span>5</span><span>200+</span></div>
          </div>

          <div className="spn-calc-quality">
            {QUALITIES.map(q => (
              <button
                key={q.label}
                type="button"
                onClick={() => setQualityCost(q.cost)}
                data-on={qualityCost === q.cost}
                aria-pressed={qualityCost === q.cost}
              >
                {q.label}
                <small>{q.cost} nodes</small>
              </button>
            ))}
          </div>
        </div>

        <p className="spn-calc-result">
          {renders} renders × {qualityCost} nodes ={' '}
          <b>{totalNodes.toLocaleString('pt-BR')} nodes / mês</b>
        </p>
      </div>

      <p className="spn-pricing-note">
        Precisa de mais volume para o escritório?{' '}
        <a
          href={supportWhatsAppUrl('Olá! Preciso de mais volume de nodes para o meu escritório.')}
          target="_blank"
          rel="noopener noreferrer"
        >
          Fale com a gente
        </a>
        {' '}— ou comece grátis com 80 nodes e assine quando o volume pedir.
        Dúvidas: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <style jsx>{`
        .spn-pricing {
          position: relative;
          z-index: 1;
          padding: 0 24px 96px;
          max-width: 1000px;
          margin: 0 auto;
        }
        .spn-pricing-head {
          text-align: center;
          margin-bottom: 28px;
        }
        .spn-pricing-title {
          font-size: clamp(22px, 3.6vw, 30px);
          font-weight: 400;
          letter-spacing: -0.035em;
          line-height: 1.2;
          margin: 0 0 10px;
          color: var(--color-text-primary);
        }
        .spn-pricing-sub {
          font-size: 14px;
          color: var(--color-text-tertiary);
          line-height: 1.6;
          max-width: 460px;
          margin: 0 auto;
        }
        .spn-pricing-toggle {
          display: inline-flex;
          align-items: center;
          margin-top: 22px;
          border-radius: var(--radius-full);
          padding: 4px;
        }
        .spn-pricing-toggle button {
          display: flex;
          align-items: center;
          gap: 7px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: -0.005em;
          color: var(--color-text-tertiary);
          background: transparent;
          border: none;
          border-radius: var(--radius-full);
          padding: 7px 16px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 180ms var(--ease), color 180ms var(--ease);
        }
        .spn-pricing-toggle button[data-on='true'] {
          background: var(--color-inverse);
          color: var(--color-inverse-foreground);
        }
        .spn-pricing-toggle-tag {
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: var(--color-accent-green-bg);
          color: var(--color-accent-green);
          border: 0.5px solid var(--color-accent-green-border);
          padding: 2px 7px;
          border-radius: var(--radius-full);
        }

        .spn-pricing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
          align-items: stretch;
        }

        .spn-calc {
          margin-top: 12px;
          padding: 24px 26px;
          border-radius: var(--r-card);
        }
        .spn-calc-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 18px;
        }
        .spn-calc-label {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
        }
        .spn-calc-pick {
          font-size: 11px;
          letter-spacing: 0.01em;
          color: var(--color-text-tertiary);
          padding: 7px 13px;
          border-radius: var(--radius-full);
          white-space: nowrap;
        }
        .spn-calc-pick b {
          color: var(--color-accent-green);
          font-weight: 500;
        }
        .spn-calc-grid {
          display: grid;
          grid-template-columns: 1fr 200px;
          gap: 24px;
          align-items: start;
        }
        .spn-calc-value {
          font-size: 20px;
          font-weight: 500;
          letter-spacing: -0.03em;
          color: var(--color-text-primary);
          font-variant-numeric: tabular-nums;
          margin-bottom: 6px;
        }
        .spn-calc-range {
          width: 100%;
          cursor: pointer;
          accent-color: var(--color-accent-green);
        }
        .spn-calc-scale {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: var(--color-text-tertiary);
          margin-top: 4px;
        }
        .spn-calc-quality {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }
        .spn-calc-quality button {
          padding: 9px 6px;
          border-radius: var(--r-inner);
          font-family: inherit;
          font-size: 11px;
          font-weight: 500;
          text-align: center;
          cursor: pointer;
          border: 0.5px solid var(--glass-line-strong);
          background: var(--glass-raised);
          color: var(--color-text-tertiary);
          transition: background 150ms var(--ease), color 150ms var(--ease);
        }
        .spn-calc-quality button[data-on='true'] {
          background: var(--color-inverse);
          color: var(--color-inverse-foreground);
          border-color: transparent;
        }
        .spn-calc-quality small {
          display: block;
          font-size: 9px;
          font-weight: 400;
          opacity: 0.6;
          margin-top: 1px;
        }
        .spn-calc-result {
          margin: 18px 0 0;
          padding-top: 16px;
          border-top: 0.5px solid var(--glass-line);
          font-size: 12.5px;
          color: var(--color-text-tertiary);
          font-variant-numeric: tabular-nums;
        }
        .spn-calc-result b { color: var(--color-text-primary); font-weight: 500; }
        .spn-calc-quality button:focus-visible,
        .spn-calc-range:focus-visible,
        .spn-pricing-toggle button:focus-visible {
          outline: 1.5px solid var(--color-border-focus);
          outline-offset: 2px;
        }

        .spn-pricing-note {
          text-align: center;
          margin: 20px auto 0;
          max-width: 620px;
          font-size: 12px;
          line-height: 1.7;
          color: var(--color-text-tertiary);
        }
        .spn-pricing-note a {
          color: var(--color-text-primary);
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        @media (max-width: 768px) {
          .spn-pricing { padding: 0 16px 64px; }
          .spn-pricing-grid { grid-template-columns: 1fr; }
          .spn-calc { padding: 20px 18px; }
          .spn-calc-grid { grid-template-columns: 1fr; gap: 20px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-pricing-toggle button,
          .spn-calc-quality button { transition: none; }
        }
      `}</style>
    </section>
  )
}
