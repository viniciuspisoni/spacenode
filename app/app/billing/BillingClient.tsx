'use client'

import { useState } from 'react'
import { ANNUAL_BILLING_ENABLED, SELLABLE_PLANS, getPlanById, type PaidPlanId, type PlanId, type BillingCycle } from '@/lib/plans'
import { getPlanDisplayName } from '@/lib/plan-display'
import { EXTRA_NODE_PACKS, type ExtraPackSize } from '@/lib/extra-nodes'
import { RowIcon, Segmented, SettingGroup, SettingRow, Sheet, summarize } from '@/components/app/glass'
import {
  NODES_POLICY_COPY,
  NODES_ROLLOVER_COPY,
  graceDaysLeft,
} from '@/lib/billing/nodes'
import {
  isLaunchOfferOpen,
  launchOfferPrice,
  launchOfferDeadlineLabel,
  formatBRL,
  LAUNCH_OFFER_HEADLINE,
  LAUNCH_OFFER_PITCH,
} from '@/lib/launch-offer'

/** Desfecho do checkout recém-concluído. Ver readCheckoutNotice em page.tsx. */
export interface CheckoutNotice {
  kind:    'ok' | 'pending'
  message: string
}

export interface ExtraPackRow {
  id:              string
  pack_size:       number
  nodes_initial:   number
  nodes_remaining: number
  purchased_at:    string
  /** 'infinity' (sem validade) nos packs pós-unificação; data nos legados. */
  expires_at:      string
  status:          string
}

interface BillingClientProps {
  plan:    string
  balance: { plan: number; extra: number; total: number }
  /**
   * Fim da janela de validade pós-cancelamento (ISO), quando os Nodes mensais
   * acumulados expiram. null = assinatura ativa, saldo sem prazo.
   */
  nodesExpireAt?: string | null
  extras:  ExtraPackRow[]
  /** true = saldo exibido é a bolsa do workspace (membro de escritório). */
  pooled?: boolean
  /** true = nunca assinou, então cai na oferta de lançamento (50% no 1º mês). */
  offerEligible?: boolean
  /** Resultado do checkout que trouxe o usuário de volta pra cá, se houve. */
  notice?: CheckoutNotice | null
}

type CheckoutPayload =
  | { type: 'plan';  id: PaidPlanId; billing: BillingCycle }
  | { type: 'extra'; id: ExtraPackSize }

async function startCheckout(payload: CheckoutPayload): Promise<{ url?: string; error?: string }> {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 401) { window.location.href = '/login'; return {} }
  return await res.json() as { url?: string; error?: string }
}

/** Packs pós-unificação vêm com expires_at = 'infinity' (sem validade);
 *  data finita só nos comprados antes de 2026-08-31 e ainda não migrados. */
function hasExpiry(date: string): boolean {
  return Number.isFinite(new Date(date).getTime())
}

function daysUntil(date: string): number {
  const ms = new Date(date).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export function BillingClient({ plan, balance, nodesExpireAt, extras, pooled, offerEligible, notice }: BillingClientProps) {
  // Extras para qualquer plano pago (Starter incluso desde 2026-08-31).
  const isExtraBlocked = plan === 'free'
  // Assinante de um plano aposentado (Office desde 2026-08-31, Starter desde
  // 2026-09-12): a vitrine não o exibe, mas os benefícios seguem até troca ou
  // cancelamento — rotulado como plano legado. Quem sai de um desses planos
  // não pode recontratá-lo (isSellablePlanId barra no checkout).
  const legacyPlan   = getPlanById(plan as PlanId)
  const isLegacyPlan = Boolean(legacyPlan?.legacy)
  // Starter pede o rótulo "Legacy" (em inglês, por decisão de produto);
  // os demais legados usam o rótulo genérico em português.
  const legacyBadge  = plan === 'starter' ? 'Legacy' : 'plano legado'
  const [billing, setBilling] = useState<BillingCycle>('monthly')
  const [loading, setLoading] = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  // Os packs já comprados são consulta, não decisão: viram uma linha que
  // mostra o total e abrem a folha com o extrato de cada um.
  const [extractOpen, setExtractOpen] = useState(false)

  const handlePlan = async (id: PaidPlanId) => {
    setLoading(`plan-${id}`); setError(null)
    const r = await startCheckout({ type: 'plan', id, billing })
    if (r.error) { setError(r.error); setLoading(null); return }
    if (r.url) window.location.assign(r.url)
  }
  const handleExtra = async (id: ExtraPackSize) => {
    setLoading(`extra-${id}`); setError(null)
    const r = await startCheckout({ type: 'extra', id })
    if (r.error) { setError(r.error); setLoading(null); return }
    if (r.url) window.location.assign(r.url)
  }
  // Billing Portal do Stripe — trocar cartão, ver faturas, cancelar.
  // Só para o pagador (membro de workspace não tem assinatura própria).
  const handlePortal = async () => {
    setLoading('portal'); setError(null)
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    if (res.status === 401) { window.location.href = '/login'; return }
    const r = await res.json() as { url?: string; error?: string }
    if (r.error) { setError(r.error); setLoading(null); return }
    if (r.url) window.location.assign(r.url)
  }
  const canManage = plan !== 'free' && !pooled
  // Só no mensal: o desconto é da primeira mensalidade.
  const showOffer = Boolean(offerEligible) && billing === 'monthly' && isLaunchOfferOpen()
  // Cancelou e ainda tem saldo acumulado: a contagem regressiva da janela.
  const graceLeft = graceDaysLeft(nodesExpireAt)
  const inGrace   = graceLeft > 0 && balance.plan > 0

  return (
    // Sem fundo chapado: é o <Ambient/> do shell que pinta atrás, e é ele que
    // dá ao vidro algo para refratar.
    <div style={{
      flex: 1, height: '100%', overflowY: 'auto',
      fontFamily: "'Geist', system-ui, sans-serif", letterSpacing: '-0.011em',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 32px 96px' }}>

        {/* ── 0. Retorno do checkout ─────────────────────────────────────── */}
        {notice && (
          <div
            className={notice.kind === 'ok' ? undefined : 'spn-glass'}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              // Verde é ESTADO: "pago" é um estado, não uma ação — por isso
              // continua verde. "Processando" não é estado de sucesso: vidro.
              background: notice.kind === 'ok' ? 'var(--color-accent-green-bg)' : undefined,
              border: notice.kind === 'ok' ? '0.5px solid var(--color-accent-green-border)' : undefined,
              borderRadius: 'var(--r-card)', padding: '14px 18px', marginBottom: 24,
            }}
          >
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
              textTransform: 'uppercase', whiteSpace: 'nowrap', paddingTop: 2,
              color: notice.kind === 'ok'
                ? 'var(--color-accent-green)'
                : 'var(--color-text-tertiary)',
            }}>
              {notice.kind === 'ok' ? 'pago' : 'processando'}
            </span>
            <span style={{
              fontSize: 12.5, lineHeight: 1.6, letterSpacing: '-0.005em',
              color: 'var(--color-text-primary)',
            }}>
              {notice.message}
            </span>
          </div>
        )}

        {/* ── 1. Saldo atual ─────────────────────────────────────────────── */}
        <Section>
          <SectionLabel>saldo</SectionLabel>
          <div className="spn-glass" style={{
            borderRadius: 'var(--r-card)', padding: '28px 32px',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 28,
          }}>
            <BalanceItem
              label="Nodes mensais"
              value={balance.plan}
              detail={
                inGrace
                  ? `expiram em ${graceLeft} dia${graceLeft === 1 ? '' : 's'}`
                  : `${getPlanDisplayName(plan)} · acumulam a cada renovação`
              }
            />
            <BalanceItem label="Nodes extras"  value={balance.extra} detail={balance.extra > 0 ? `${extras.length} pack${extras.length === 1 ? '' : 's'} · sem validade` : 'sem validade'} />
            <BalanceItem label="Total disponível" value={balance.total} detail="nodes" green />
          </div>

          {/* Extrato dos packs: uma linha em vez de uma tabela sempre aberta. */}
          {extras.length > 0 && (
            <SettingGroup>
              <SettingRow
                icon={<RowIcon name="scale" />}
                title="Meus packs"
                value={summarize([
                  `${extras.length} pack${extras.length === 1 ? '' : 's'}`,
                  `${balance.extra.toLocaleString('pt-BR')} nodes restantes`,
                ])}
                onOpen={() => setExtractOpen(true)}
                controls="billing-extrato"
              />
            </SettingGroup>
          )}

          {/* A regra do acúmulo, onde o usuário olha o saldo. Mesmo tratamento
              da nota de workspace logo abaixo — as duas são rodapé do saldo. */}
          {inGrace ? (
            <p style={{
              fontSize: 12.5, color: 'var(--color-text-secondary)',
              lineHeight: 1.6, letterSpacing: '-0.005em', marginTop: 12,
            }}>
              Sua assinatura foi encerrada. Os Nodes que você já tinha continuam
              disponíveis por mais <strong style={{ color: 'var(--color-text-primary)' }}>
              {graceLeft} dia{graceLeft === 1 ? '' : 's'}</strong> — depois disso o
              saldo mensal expira. Reassine dentro do prazo e o saldo é preservado
              integralmente.
            </p>
          ) : (
            <p style={{
              fontSize: 12.5, color: 'var(--color-text-tertiary)',
              lineHeight: 1.6, letterSpacing: '-0.005em', marginTop: 12,
            }}>
              {NODES_POLICY_COPY}
            </p>
          )}

          {pooled && (
            <p style={{
              fontSize: 12.5, color: 'var(--color-text-tertiary)',
              lineHeight: 1.6, letterSpacing: '-0.005em', marginTop: 12,
            }}>
              Você faz parte de um workspace — este é o saldo da conta principal,
              compartilhado por toda a equipe.
            </p>
          )}
        </Section>

        {/* ── 2. Plano ───────────────────────────────────────────────────── */}
        <Section>
          <SectionLabel>plano</SectionLabel>
          <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Mensal/anual reconfigura todo preço abaixo: é o eixo da tela e
                fica na superfície, como segmentado. */}
            {ANNUAL_BILLING_ENABLED && (
              <Segmented
                label="Ciclo de cobrança"
                value={billing}
                onChange={setBilling}
                items={[{ value: 'monthly', label: 'Mensal' }, { value: 'annual', label: 'Anual' }]}
              />
            )}
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Plano atual: <strong style={{ color: 'var(--color-text-primary)' }}>{getPlanDisplayName(plan)}{isLegacyPlan && ` · ${legacyBadge}`}</strong>
            </span>
            {canManage && (
              <button
                onClick={handlePortal}
                disabled={loading === 'portal'}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 11, color: 'var(--color-text-secondary)',
                  textDecoration: 'underline', textUnderlineOffset: 2,
                  letterSpacing: '-0.005em', fontFamily: 'inherit',
                }}
              >
                {loading === 'portal' ? 'Abrindo…' : 'Gerenciar assinatura →'}
              </button>
            )}
          </div>
          {showOffer && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              background: 'var(--color-accent-green-bg)',
              border: '0.5px solid var(--color-accent-green-border)',
              borderRadius: 'var(--r-card)', padding: '14px 18px', marginBottom: 14,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: 'var(--color-accent-green)',
              }}>
                {LAUNCH_OFFER_HEADLINE}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)', letterSpacing: '-0.005em' }}>
                {LAUNCH_OFFER_PITCH}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
                até {launchOfferDeadlineLabel()}
              </span>
            </div>
          )}
          {isLegacyPlan && legacyPlan && (
            <div className="spn-glass" style={{
              borderRadius: 'var(--r-card)', padding: '14px 18px', marginBottom: 14,
              fontSize: 12.5, color: 'var(--color-text-secondary)',
              lineHeight: 1.6, letterSpacing: '-0.005em',
            }}>
              O plano <strong style={{ color: 'var(--color-text-primary)' }}>{legacyPlan.name}</strong> foi
              aposentado para novas assinaturas, mas o seu segue valendo: os{' '}
              {legacyPlan.nodes.toLocaleString('pt-BR')} nodes mensais e todos os benefícios
              continuam até você trocar de plano ou cancelar. Se cancelar, não será possível
              contratar o {legacyPlan.name} novamente — a próxima assinatura escolhe entre{' '}
              {SELLABLE_PLANS.map(p => p.name).join(', ')}.
            </div>
          )}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12, alignItems: 'stretch',
          }}>
            {SELLABLE_PLANS.map(p => {
              const current = p.id === plan
              const price = billing === 'annual' ? p.annualMonthlyPrice : p.monthlyPrice
              return (
                <div key={p.id} className="spn-glass" style={{
                  borderRadius: 'var(--r-card)', padding: '20px 18px',
                  // Verde marca o plano ATUAL — estado, nunca ação.
                  borderColor: current ? 'var(--color-accent-green)' : undefined,
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div className="spn-field-label">
                    {p.name}{current && <span style={{ color: 'var(--color-accent-green)', marginLeft: 6 }}>· atual</span>}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.04em', marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {p.nodes.toLocaleString('pt-BR')}
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 4, fontWeight: 400 }}>nodes/mês</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, marginBottom: 4 }}>
                    R$ {formatBRL(showOffer ? launchOfferPrice(price) : price)}
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>/mês</span>
                    {showOffer && (
                      <span style={{
                        fontSize: 11, fontWeight: 400, marginLeft: 6,
                        textDecoration: 'line-through', color: 'var(--color-text-tertiary)',
                      }}>
                        R$ {formatBRL(price)}
                      </span>
                    )}
                  </div>
                  {showOffer && (
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
                      <span style={{ color: 'var(--color-accent-green)', fontWeight: 500 }}>no 1º mês</span>
                      {' '}· depois R$ {formatBRL(price)}/mês
                    </div>
                  )}
                  {billing === 'annual' && (
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
                      R$ {p.annualTotal.toLocaleString('pt-BR')} cobrado anualmente
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5, flex: 1, margin: '8px 0 16px' }}>
                    {p.description}
                  </p>
                  {current ? (
                    // Plano atual não é botão: é um estado. Um botão morto é
                    // uma promessa de ação que não existe.
                    <div style={{
                      textAlign: 'center', padding: '11px 14px', borderRadius: 'var(--r-inner)',
                      fontSize: 12, fontWeight: 500,
                      background: 'var(--color-accent-green-bg)', color: 'var(--color-accent-green)',
                    }}>
                      plano atual
                    </div>
                  ) : (
                    <button
                      className="spn-cta"
                      onClick={() => handlePlan(p.id)}
                      disabled={loading !== null}
                      style={{ opacity: loading && loading !== `plan-${p.id}` ? 0.5 : undefined }}
                    >
                      {loading === `plan-${p.id}` ? 'redirecionando…' : `assinar ${p.name.toLowerCase()}`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <p style={{
            fontSize: 11, color: 'var(--color-text-tertiary)',
            lineHeight: 1.6, marginTop: 12,
          }}>
            {NODES_ROLLOVER_COPY} O que não for usado no mês entra no saldo do mês seguinte.
          </p>
        </Section>

        {/* ── 3. Nodes extras ────────────────────────────────────────────── */}
        <Section>
          <SectionLabel>nodes extras · avulsos, sem validade</SectionLabel>
          {isExtraBlocked ? (
            <div className="spn-empty">
              <strong style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                Nodes extras disponíveis para assinantes.
              </strong>
              <br />
              Assine qualquer plano para comprar nodes avulsos que não expiram.
            </div>
          ) : (
            <>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 14, lineHeight: 1.5 }}>
                Pague uma vez, use quando precisar — não expiram. Consumidos automaticamente quando os Nodes mensais acabarem.
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}>
                {EXTRA_NODE_PACKS.map(pack => (
                  <div key={pack.id} className="spn-glass" style={{
                    borderRadius: 'var(--r-card)', padding: 18,
                    display: 'flex', flexDirection: 'column',
                  }}>
                    <div className="spn-field-label">{pack.name}</div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.04em', marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {pack.nodes.toLocaleString('pt-BR')}
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 4, fontWeight: 400 }}>nodes</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, marginBottom: 12 }}>
                      R$ {pack.price}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 14 }}>
                      Sem validade · R$ {pack.pricePerNode.toFixed(3)}/node
                    </div>
                    {/* Secundário ao plano: o avulso é a saída de quem já
                        assina, não a decisão principal desta tela. */}
                    <button
                      className="spn-ghost"
                      onClick={() => handleExtra(pack.id)}
                      disabled={loading !== null}
                      style={{
                        marginTop: 'auto', width: '100%',
                        opacity: loading && loading !== `extra-${pack.id}` ? 0.5 : undefined,
                      }}
                    >
                      {loading === `extra-${pack.id}` ? 'redirecionando…' : 'comprar'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>

        {error && <div className="spn-error" style={{ marginTop: 16 }}>{error}</div>}

        <p style={{ marginTop: 32, textAlign: 'center', fontSize: 11, color: 'var(--color-text-quaternary)', lineHeight: 1.7 }}>
          Cobranças seguras pelo Stripe. Cancele quando quiser.
        </p>
      </div>

      {/* ── Extrato dos packs ─────────────────────────────────────────────── */}
      <Sheet open={extractOpen} title="Meus packs de nodes" onClose={() => setExtractOpen(false)}>
        <div className="spn-group spn-glass" id="billing-extrato">
          {extras.map((p) => {
            const expiring = hasExpiry(p.expires_at)
            const days = expiring ? daysUntil(p.expires_at) : 0
            const pct  = p.nodes_initial > 0 ? (p.nodes_remaining / p.nodes_initial) * 100 : 0
            return (
              <div key={p.id} style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--glass-line)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    Pack {p.pack_size.toLocaleString('pt-BR')}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {p.nodes_remaining.toLocaleString('pt-BR')}
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 4, fontWeight: 400 }}>
                      / {p.nodes_initial.toLocaleString('pt-BR')}
                    </span>
                  </span>
                </div>
                <div style={{ height: 2, background: 'var(--glass-line-strong)', borderRadius: 2, margin: '8px 0 6px', overflow: 'hidden' }}>
                  {/* Verde = quanto ainda existe. Estado, não ação. */}
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-accent-green)', borderRadius: 2 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  <span>Comprado em {new Date(p.purchased_at).toLocaleDateString('pt-BR')}</span>
                  <span>
                    {expiring
                      ? <>Expira em <strong style={{ color: days <= 7 ? 'var(--color-error)' : 'var(--color-text-primary)' }}>{days} dia{days === 1 ? '' : 's'}</strong></>
                      : 'Sem validade'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        <p className="spn-hint">
          Os packs são consumidos na ordem em que foram comprados, e só depois
          que os nodes mensais do plano acabam.
        </p>
      </Sheet>
    </div>
  )
}

// ── Helpers de UI ────────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <section style={{ marginBottom: 40, display: 'grid', gap: 12 }}>{children}</section>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="spn-field-label" style={{ marginBottom: 0 }}>{children}</div>
}

function BalanceItem({ label, value, detail, green = false }: {
  label: string; value: number; detail: string; green?: boolean
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 500, color: green ? 'var(--color-accent-green)' : 'var(--color-text-primary)',
        letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
      }}>
        {value.toLocaleString('pt-BR')}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{detail}</div>
    </div>
  )
}
