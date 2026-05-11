'use client'

import { useState } from 'react'
import { PLANS, type PaidPlanId, type BillingCycle } from '@/lib/plans'
import { LUMEN_PACKS, LUMEN_VALIDITY_DAYS, type LumenPackSize } from '@/lib/lumens'

export interface LumenPackRow {
  id:              string
  pack_size:       number
  nodes_initial:   number
  nodes_remaining: number
  purchased_at:    string
  expires_at:      string
  status:          string
}

interface BillingClientProps {
  plan:    string
  balance: { plan: number; lumen: number; total: number }
  lumens:  LumenPackRow[]
}

type CheckoutPayload =
  | { type: 'plan';  id: PaidPlanId; billing: BillingCycle }
  | { type: 'lumen'; id: LumenPackSize }

async function startCheckout(payload: CheckoutPayload): Promise<{ url?: string; error?: string }> {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 401) { window.location.href = '/login'; return {} }
  return await res.json() as { url?: string; error?: string }
}

function daysUntil(date: string): number {
  const ms = new Date(date).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export function BillingClient({ plan, balance, lumens }: BillingClientProps) {
  const isLumenBlocked = plan === 'free' || plan === 'starter'
  const [billing, setBilling] = useState<BillingCycle>('monthly')
  const [loading, setLoading] = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  const handlePlan = async (id: PaidPlanId) => {
    setLoading(`plan-${id}`); setError(null)
    const r = await startCheckout({ type: 'plan', id, billing })
    if (r.error) { setError(r.error); setLoading(null); return }
    if (r.url) window.location.assign(r.url)
  }
  const handleLumen = async (id: LumenPackSize) => {
    setLoading(`lumen-${id}`); setError(null)
    const r = await startCheckout({ type: 'lumen', id })
    if (r.error) { setError(r.error); setLoading(null); return }
    if (r.url) window.location.assign(r.url)
  }

  return (
    <div style={{
      flex: 1, height: '100%', overflowY: 'auto', background: '#f2f2f2',
      fontFamily: "'Geist', system-ui, sans-serif", letterSpacing: '-0.011em',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 32px 96px' }}>

        {/* ── 1. Saldo atual ─────────────────────────────────────────────── */}
        <Section>
          <SectionLabel>saldo</SectionLabel>
          <div style={{
            background: '#fff', borderRadius: 16, padding: '28px 32px',
            border: '0.5px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 28,
          }}>
            <BalanceItem label="Plano"   value={balance.plan}  detail={`${plan === 'free' ? 'Gratuito' : capitalize(plan)}`} />
            <BalanceItem label="Lumens"  value={balance.lumen} detail={`${lumens.length} pack${lumens.length === 1 ? '' : 's'} ativo${lumens.length === 1 ? '' : 's'}`} />
            <BalanceItem label="Total disponível" value={balance.total} detail="nodes" green />
          </div>
        </Section>

        {/* ── 2. Plano ───────────────────────────────────────────────────── */}
        <Section>
          <SectionLabel>plano</SectionLabel>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <BillingToggle billing={billing} setBilling={setBilling} />
            <span style={{ fontSize: 11, color: '#86868b' }}>
              Plano atual: <strong style={{ color: '#1a1a1a' }}>{plan === 'free' ? 'Gratuito' : capitalize(plan)}</strong>
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12, alignItems: 'stretch',
          }}>
            {PLANS.map(p => {
              const current = p.id === plan
              const price = billing === 'annual' ? p.annualMonthlyPrice : p.monthlyPrice
              return (
                <div key={p.id} style={{
                  background: '#fff', borderRadius: 12, padding: '20px 18px',
                  border: `0.5px solid ${current ? '#30b46c' : 'rgba(0,0,0,0.07)'}`,
                  display: 'flex', flexDirection: 'column',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#86868b', marginBottom: 12 }}>
                    {p.name}{current && <span style={{ color: '#30b46c', marginLeft: 6 }}>· atual</span>}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.04em', marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {p.nodes.toLocaleString('pt-BR')}
                    <span style={{ fontSize: 10, color: '#86868b', marginLeft: 4, fontWeight: 400 }}>nodes/mês</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500, marginBottom: 4 }}>
                    R$ {price}<span style={{ fontSize: 10, color: '#86868b', fontWeight: 400 }}>/mês</span>
                  </div>
                  {billing === 'annual' && (
                    <div style={{ fontSize: 10, color: '#86868b', marginBottom: 12 }}>
                      R$ {p.annualTotal.toLocaleString('pt-BR')} cobrado anualmente
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: '#86868b', lineHeight: 1.5, flex: 1, margin: '8px 0 16px' }}>
                    {p.description}
                  </p>
                  <button
                    onClick={() => handlePlan(p.id)}
                    disabled={loading !== null || current}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 8,
                      fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
                      cursor: current ? 'default' : (loading ? 'wait' : 'pointer'),
                      border: 'none',
                      background: current ? 'rgba(48,180,108,0.1)' : '#1a1a1a',
                      color:      current ? '#30b46c'              : '#fafafa',
                      opacity:    loading && loading !== `plan-${p.id}` ? 0.5 : 1,
                    }}
                  >
                    {current ? 'plano atual' : (loading === `plan-${p.id}` ? 'redirecionando...' : `assinar ${p.name.toLowerCase()}`)}
                  </button>
                </div>
              )
            })}
          </div>
        </Section>

        {/* ── 3. Lumens ──────────────────────────────────────────────────── */}
        <Section>
          <SectionLabel>lumens · créditos avulsos</SectionLabel>
          {isLumenBlocked ? (
            <div style={{
              background: '#fff', borderRadius: 12, padding: '28px 32px',
              border: '0.5px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: 14, color: '#1a1a1a', marginBottom: 8, fontWeight: 500 }}>
                Lumens disponíveis a partir do plano Pro.
              </p>
              <p style={{ fontSize: 12, color: '#86868b', lineHeight: 1.6 }}>
                Faça upgrade para Pro ou superior para comprar créditos avulsos com validade de 90 dias.
              </p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 11, color: '#86868b', marginBottom: 14, lineHeight: 1.5 }}>
                Pague uma vez, use em até {LUMEN_VALIDITY_DAYS} dias. Consumidos automaticamente quando o saldo do plano acabar.
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}>
                {LUMEN_PACKS.map(pack => (
                  <div key={pack.id} style={{
                    background: '#fff', borderRadius: 12, padding: '18px 18px',
                    border: '0.5px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex', flexDirection: 'column',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#86868b', marginBottom: 8 }}>
                      {pack.name}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.04em', marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {pack.nodes.toLocaleString('pt-BR')}
                      <span style={{ fontSize: 10, color: '#86868b', marginLeft: 4, fontWeight: 400 }}>nodes</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500, marginBottom: 12 }}>
                      R$ {pack.price}
                    </div>
                    <div style={{ fontSize: 10, color: '#86868b', marginBottom: 14 }}>
                      Validade: {LUMEN_VALIDITY_DAYS} dias · R$ {pack.pricePerNode.toFixed(3)}/node
                    </div>
                    <button
                      onClick={() => handleLumen(pack.id)}
                      disabled={loading !== null}
                      style={{
                        marginTop: 'auto', padding: '10px 14px', borderRadius: 8,
                        fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
                        cursor: loading ? 'wait' : 'pointer', border: '0.5px solid rgba(0,0,0,0.09)',
                        background: '#fafafa', color: '#1a1a1a',
                        opacity: loading && loading !== `lumen-${pack.id}` ? 0.5 : 1,
                      }}
                    >
                      {loading === `lumen-${pack.id}` ? 'redirecionando...' : 'comprar'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>

        {/* ── 4. Meus Lumens ativos ──────────────────────────────────────── */}
        {lumens.length > 0 && (
          <Section>
            <SectionLabel>meus lumens ativos</SectionLabel>
            <div style={{
              background: '#fff', borderRadius: 12,
              border: '0.5px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              overflow: 'hidden',
            }}>
              {lumens.map((p, i) => {
                const days = daysUntil(p.expires_at)
                const pct  = p.nodes_initial > 0 ? (p.nodes_remaining / p.nodes_initial) * 100 : 0
                return (
                  <div key={p.id} style={{
                    padding: '16px 22px',
                    borderTop: i === 0 ? 'none' : '0.5px solid rgba(0,0,0,0.06)',
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>
                        Lumen {p.pack_size.toLocaleString('pt-BR')}
                      </div>
                      <div style={{ fontSize: 10, color: '#86868b', marginTop: 2 }}>
                        Comprado em {new Date(p.purchased_at).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums' }}>
                        {p.nodes_remaining.toLocaleString('pt-BR')}
                        <span style={{ fontSize: 10, color: '#86868b', marginLeft: 4, fontWeight: 400 }}>
                          / {p.nodes_initial.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div style={{ height: 2, background: 'rgba(0,0,0,0.06)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: '#30b46c', borderRadius: 2 }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#86868b' }}>
                      Expira em <strong style={{ color: days <= 7 ? '#d63638' : '#1a1a1a' }}>{days} dia{days === 1 ? '' : 's'}</strong>
                    </div>
                    <div style={{ fontSize: 10, color: '#86868b', textAlign: 'right' }}>
                      {new Date(p.expires_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {error && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(214,54,56,0.08)', border: '0.5px solid rgba(214,54,56,0.2)',
            color: '#d63638', fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <p style={{ marginTop: 32, textAlign: 'center', fontSize: 11, color: '#bbb', lineHeight: 1.7 }}>
          Cobranças seguras pelo Stripe. Cancele quando quiser.
        </p>
      </div>
    </div>
  )
}

// ── Helpers de UI ────────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <section style={{ marginBottom: 40 }}>{children}</section>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
      textTransform: 'uppercase', color: '#86868b', marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

function BalanceItem({ label, value, detail, green = false }: {
  label: string; value: number; detail: string; green?: boolean
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#86868b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 500, color: green ? '#30b46c' : '#1a1a1a',
        letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
      }}>
        {value.toLocaleString('pt-BR')}
      </div>
      <div style={{ fontSize: 11, color: '#86868b', marginTop: 2 }}>{detail}</div>
    </div>
  )
}

function BillingToggle({ billing, setBilling }: {
  billing: BillingCycle; setBilling: (b: BillingCycle) => void
}) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', background: '#fff',
      border: '0.5px solid rgba(0,0,0,0.07)', borderRadius: 32, padding: 3,
    }}>
      {(['monthly', 'annual'] as const).map(b => (
        <button
          key={b}
          onClick={() => setBilling(b)}
          style={{
            fontFamily: 'inherit', fontSize: 11, fontWeight: 500, letterSpacing: '-0.005em',
            color: billing === b ? '#fafafa' : '#86868b',
            background: billing === b ? '#1a1a1a' : 'transparent',
            border: 'none', borderRadius: 28, padding: '6px 14px',
            cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap' as const,
          }}
        >
          {b === 'monthly' ? 'Mensal' : 'Anual'}
        </button>
      ))}
    </div>
  )
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}
