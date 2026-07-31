'use client'

import { useState } from 'react'
import {
  REFERRALS_FOR_FREE_MONTH,
  REFERRED_PERCENT_OFF,
  REFERRER_PERCENT_OFF,
  REFERRAL_FINE_PRINT,
  REWARD_HOLD_DAYS,
} from '@/lib/referral/config'
import { referralShareMessage } from '@/lib/referral/codes'
import { rewardStatusLabel, type RewardRow, type RewardSummary } from '@/lib/referral/rewards'

interface Props {
  code:        string | null
  link:        string | null
  programOpen: boolean
  startLabel:  string
  invitesSent: number
  signups:     number
  confirmed:   number
  summary:     RewardSummary
  rewards:     RewardRow[]
  pooled:      boolean
}

type CopyTarget = 'link' | 'code' | null

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Registra o compartilhamento (best-effort — o contador não vale um erro na tela). */
function pingInvite(channel: string): void {
  void fetch('/api/referrals/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel }),
  }).catch(() => {})
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('pt-BR')
}

export function IndicacoesClient({
  code, link, programOpen, startLabel,
  invitesSent, signups, confirmed, summary, rewards, pooled,
}: Props) {
  const [copied, setCopied] = useState<CopyTarget>(null)
  const [invites, setInvites] = useState(invitesSent)

  const registerShare = (channel: string) => {
    pingInvite(channel)
    setInvites(n => n + 1)
  }

  const handleCopy = async (target: 'link' | 'code') => {
    const text = target === 'link' ? link : code
    if (!text) return
    if (!(await writeClipboard(text))) return
    setCopied(target)
    window.setTimeout(() => setCopied(null), 2000)
    registerShare(target === 'link' ? 'copy_link' : 'copy_code')
  }

  const handleShare = async () => {
    if (!link) return
    const text = referralShareMessage(link)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'SpaceNode', text, url: link })
        registerShare('share')
        return
      } catch {
        // Cancelou o diálogo nativo — não conta como convite.
        return
      }
    }
    if (await writeClipboard(text)) {
      setCopied('link')
      window.setTimeout(() => setCopied(null), 2000)
      registerShare('share')
    }
  }

  return (
    <div style={{
      flex: 1, height: '100%', overflowY: 'auto', background: 'var(--color-bg)',
      fontFamily: "'Geist', system-ui, sans-serif", letterSpacing: '-0.011em',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 32px 96px' }}>

        {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{
            fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)',
            letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 10,
          }}>
            Indicações
          </h1>
          <p style={{
            fontSize: 13, color: 'var(--color-text-tertiary)',
            lineHeight: 1.6, letterSpacing: '-0.005em', maxWidth: 560,
          }}>
            Quem entra pelo seu convite tem {REFERRED_PERCENT_OFF}% na primeira
            mensalidade. Você recebe {REFERRER_PERCENT_OFF}% na próxima
            mensalidade a cada indicação confirmada.
          </p>
        </div>

        {/* Programa ainda não vigente — informação, não contagem regressiva. */}
        {!programOpen && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border)',
            borderRadius: 12, padding: '14px 18px', marginBottom: 24,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
              textTransform: 'uppercase', whiteSpace: 'nowrap', paddingTop: 2,
              color: 'var(--color-text-tertiary)',
            }}>
              a partir de
            </span>
            <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-primary)' }}>
              O programa entra em vigor em {startLabel}. Seu código já está
              reservado e pode ser compartilhado — os descontos passam a valer
              na data, sem você precisar fazer nada.
            </span>
          </div>
        )}

        {pooled && (
          <p style={{
            fontSize: 12.5, color: 'var(--color-text-tertiary)',
            lineHeight: 1.6, letterSpacing: '-0.005em', marginBottom: 24,
          }}>
            Você faz parte de um workspace. O convite é seu, e o desconto entra
            na mensalidade da sua própria assinatura quando você tiver uma.
          </p>
        )}

        {/* ── 1. Link e código ───────────────────────────────────────────── */}
        <Section>
          <SectionLabel>seu convite</SectionLabel>
          {code && link ? (
            <div style={{
              background: 'var(--color-bg-elevated)', borderRadius: 16,
              border: '0.5px solid var(--color-border)', boxShadow: 'var(--shadow-sm)',
              padding: '24px 28px',
            }}>
              <FieldRow label="Link">
                <code style={{
                  fontSize: 13, color: 'var(--color-text-primary)',
                  fontFamily: 'inherit', wordBreak: 'break-all',
                }}>
                  {link}
                </code>
              </FieldRow>
              <FieldRow label="Código">
                <code style={{
                  fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)',
                  letterSpacing: '0.14em', fontFamily: 'inherit',
                }}>
                  {code}
                </code>
              </FieldRow>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
                <ActionButton primary onClick={() => handleCopy('link')}>
                  {copied === 'link' ? 'copiado' : 'copiar link'}
                </ActionButton>
                <ActionButton onClick={() => handleCopy('code')}>
                  {copied === 'code' ? 'copiado' : 'copiar código'}
                </ActionButton>
                <ActionButton onClick={handleShare}>compartilhar</ActionButton>
              </div>
            </div>
          ) : (
            <div style={{
              background: 'var(--color-bg-elevated)', borderRadius: 12,
              border: '0.5px solid var(--color-border)', padding: '24px 28px',
              fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.6,
            }}>
              Seu código de indicação está sendo preparado. Atualize a página em
              alguns instantes.
            </div>
          )}
        </Section>

        {/* ── 2. Números ─────────────────────────────────────────────────── */}
        <Section>
          <SectionLabel>resultado</SectionLabel>
          <div style={{
            background: 'var(--color-bg-elevated)', borderRadius: 16, padding: '28px 32px',
            border: '0.5px solid var(--color-border)', boxShadow: 'var(--shadow-sm)',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 28,
          }}>
            <Metric label="Convites enviados"     value={invites}   detail="compartilhamentos" />
            <Metric label="Cadastros realizados"  value={signups}   detail="contas criadas" />
            <Metric label="Assinaturas confirmadas" value={confirmed} detail="primeira mensalidade paga" />
            <Metric
              label="Desconto disponível"
              value={summary.availablePercent}
              suffix="%"
              detail={
                summary.pendingPercent > 0
                  ? `+${summary.pendingPercent}% aguardando prazo`
                  : 'na próxima mensalidade'
              }
              green
            />
          </div>
        </Section>

        {/* ── 3. Progresso até a mensalidade grátis ──────────────────────── */}
        <Section>
          <SectionLabel>próxima mensalidade gratuita</SectionLabel>
          <div style={{
            background: 'var(--color-bg-elevated)', borderRadius: 16, padding: '24px 28px',
            border: '0.5px solid var(--color-border)', boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              gap: 16, flexWrap: 'wrap', marginBottom: 14,
            }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-primary)', letterSpacing: '-0.005em' }}>
                <strong style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                  {summary.progressCount}
                </strong>
                <span style={{ color: 'var(--color-text-tertiary)' }}> de {REFERRALS_FOR_FREE_MONTH} indicações</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
                {summary.progressRemaining === 0
                  ? 'mensalidade fechada'
                  : `faltam ${summary.progressRemaining} para uma mensalidade inteira`}
              </div>
            </div>

            {/* Barra segmentada: cada segmento é uma indicação confirmada. */}
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: REFERRALS_FOR_FREE_MONTH }, (_, i) => (
                <div key={i} style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: i < summary.progressCount
                    ? 'var(--color-accent-green)'
                    : 'var(--color-surface-hover)',
                }} />
              ))}
            </div>

            {summary.freeMonthsBanked > 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 14, lineHeight: 1.6 }}>
                {summary.freeMonthsBanked === 1
                  ? 'Uma mensalidade inteira já está garantida.'
                  : `${summary.freeMonthsBanked} mensalidades inteiras já estão garantidas.`}
                {' '}O excedente entra nas mensalidades seguintes.
              </p>
            )}
          </div>
        </Section>

        {/* ── 4. Histórico ───────────────────────────────────────────────── */}
        <Section>
          <SectionLabel>histórico de recompensas</SectionLabel>
          {rewards.length === 0 ? (
            <div style={{
              background: 'var(--color-bg-elevated)', borderRadius: 12,
              border: '0.5px solid var(--color-border)', padding: '24px 28px',
              fontSize: 12.5, color: 'var(--color-text-tertiary)', lineHeight: 1.6,
            }}>
              Nenhuma recompensa ainda. Ela aparece aqui quando um indicado paga
              a primeira mensalidade — liberada {REWARD_HOLD_DAYS} dias depois,
              quando encerra o prazo de reembolso.
            </div>
          ) : (
            <div style={{
              background: 'var(--color-bg-elevated)', borderRadius: 12,
              border: '0.5px solid var(--color-border)', boxShadow: 'var(--shadow-sm)',
              overflowX: 'auto',
            }}>
              {rewards.map((r, i) => (
                <div key={r.id} style={{
                  padding: '16px 22px',
                  borderTop: i === 0 ? 'none' : '0.5px solid var(--color-border)',
                  display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 1fr',
                  gap: 16, alignItems: 'center', minWidth: 520,
                }}>
                  <div style={{
                    fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {r.percent_off}%
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {rewardStatusLabel(r.status)}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
                    {r.status === 'pending'
                      ? `liberada em ${formatDate(r.available_at)}`
                      : r.status === 'consumed'
                        ? `usada em ${formatDate(r.consumed_at)}`
                        : r.status === 'applied'
                          ? 'reservada na fatura em aberto'
                          : `disponível desde ${formatDate(r.available_at)}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', textAlign: 'right' }}>
                    {formatDate(r.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <p style={{
          marginTop: 32, fontSize: 11, color: 'var(--color-text-quaternary)',
          lineHeight: 1.7, maxWidth: 620,
        }}>
          {REFERRAL_FINE_PRINT}
        </p>
      </div>
    </div>
  )
}

// ── Helpers de UI (mesma gramática de /app/billing) ──────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <section style={{ marginBottom: 40 }}>{children}</section>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
      textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '84px 1fr', gap: 16,
      alignItems: 'baseline', padding: '9px 0',
    }}>
      <span style={{
        fontSize: 10, color: 'var(--color-text-tertiary)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        {label}
      </span>
      {children}
    </div>
  )
}

function Metric({ label, value, detail, suffix, green = false }: {
  label: string; value: number; detail: string; suffix?: string; green?: boolean
}) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: 'var(--color-text-tertiary)',
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 500,
        color: green ? 'var(--color-accent-green)' : 'var(--color-text-primary)',
        letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
      }}>
        {value.toLocaleString('pt-BR')}
        {suffix && <span style={{ fontSize: 16, marginLeft: 1 }}>{suffix}</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{detail}</div>
    </div>
  )
}

function ActionButton({ children, onClick, primary = false }: {
  children: React.ReactNode; onClick: () => void; primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px', borderRadius: 8,
        fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
        letterSpacing: '-0.005em', cursor: 'pointer',
        border: primary ? 'none' : '0.5px solid var(--color-border-strong)',
        background: primary ? 'var(--color-inverse)' : 'var(--color-surface)',
        color:      primary ? 'var(--color-inverse-foreground)' : 'var(--color-text-primary)',
      }}
    >
      {children}
    </button>
  )
}
