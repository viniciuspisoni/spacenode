'use client'

// Painel de saldo insuficiente (Variante A — substitui action area do EixosPanel
// quando user seleciona variações mas não tem nodes suficientes).
//
// Princípios do briefing:
//   - Sem urgência manufaturada
//   - Sempre mostrar a matemática
//   - Sempre oferecer alternativa que NÃO gera receita (ajustar, esperar)
//   - Recomendação honesta (não empurrar Pro se Starter cobre)

import { useState } from 'react'
import Link from 'next/link'
import { recommendPlan, getPlanById, type PlanId } from '@/lib/plans'

interface Props {
  count:        number
  costPer:      number
  total:        number
  available:    number
  currentPlan:  PlanId
  onReduceTo:   (count: number) => void
}

export function InsufficientBalancePanel({ count, costPer, total, available, currentPlan, onReduceTo }: Props) {
  const [submittingAvulso, setSubmittingAvulso] = useState(false)
  const missing  = Math.max(0, total - available)
  const fitCount = costPer > 0 ? Math.floor(available / costPer) : 0
  const recommended = recommendPlan(total)
  const currentPlanObj = getPlanById(currentPlan)
  const upgradeNeeded  = recommended.nodes > (currentPlanObj?.nodes ?? 0)

  async function handleAvulso() {
    setSubmittingAvulso(true)
    try {
      const res = await fetch('/api/billing/avulso-checkout', { method: 'POST' })
      const data = await res.json()
      if (data?.error === 'available_in_august') {
        alert('A compra avulsa de Lumens estará disponível em agosto.')
      } else if (data?.url) {
        window.location.href = data.url
      }
    } finally {
      setSubmittingAvulso(false)
    }
  }

  return (
    <div style={{
      padding: 18, borderRadius: 12,
      background: 'rgba(186,117,23,0.06)',
      border: '0.5px solid rgba(186,117,23,0.3)',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {/* Sua seleção · preservada */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#46d191', background: 'rgba(29,158,117,0.18)',
          padding: '4px 8px', borderRadius: 4,
        }}>
          ✓ Salvo
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', letterSpacing: '-0.005em' }}>
          Sua seleção de {count} variaç{count === 1 ? 'ão' : 'ões'} está preservada.
        </span>
      </div>

      {/* Diagnóstico */}
      <div style={{
        padding: '14px 16px', borderRadius: 10,
        background: 'var(--color-bg-elevated)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8,
          letterSpacing: '-0.005em',
        }}>
          <span>Necessário</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{total} nodes</span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12,
        }}>
          <span>Você tem</span>
          <span>{available} nodes</span>
        </div>
        {/* progress bar */}
        <div style={{
          height: 6, borderRadius: 999, background: 'var(--color-surface)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${total > 0 ? Math.min(100, (available / total) * 100) : 0}%`,
            background: '#BA7517',
            transition: 'width 0.4s',
          }} />
        </div>
        <div style={{
          marginTop: 10, fontSize: 11, color: '#e0a766', fontWeight: 500,
        }}>
          Faltam {missing} nodes pra essa geração.
        </div>
      </div>

      {/* Opções: Avulso (recommended) + Upgrade */}
      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      }}>
        <div style={{
          padding: '14px 16px', borderRadius: 10,
          background: 'var(--color-bg-elevated)',
          border: '1.5px solid var(--color-text-primary)',
          display: 'flex', flexDirection: 'column', gap: 10,
          position: 'relative',
        }}>
          <span style={{
            position: 'absolute', top: -9, left: 14,
            fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
            background: 'var(--color-text-primary)', color: 'var(--color-bg)',
            padding: '3px 7px', borderRadius: 4,
          }}>
            Recomendado
          </span>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
            Pacote avulso
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.55 }}>
            500 nodes por R$ 89, válidos 90 dias. Sem mexer no seu plano.
          </div>
          <button
            onClick={handleAvulso}
            disabled={submittingAvulso}
            className="spn-action spn-action--primary"
            style={{ width: '100%', padding: '9px 14px', fontSize: 12 }}
          >
            {submittingAvulso ? '…' : 'Comprar pacote · R$ 89'}
          </button>
          <div className="spn-upsell-note" style={{ fontSize: 10, padding: 0 }}>
            disponível em agosto
          </div>
        </div>

        {upgradeNeeded && (
          <div style={{
            padding: '14px 16px', borderRadius: 10,
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border-strong)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
              Upgrade {recommended.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.55 }}>
              {recommended.nodes} nodes/mês por R$ {recommended.monthlyPrice}/mês.
              Vale se você gera muito mais do que cabe no plano atual.
            </div>
            <Link
              href="/app/billing"
              className="spn-action spn-action--ghost"
              style={{ width: '100%', padding: '9px 14px', fontSize: 12, textAlign: 'center' }}
            >
              Ver detalhes →
            </Link>
          </div>
        )}
      </div>

      {/* Sugestão de ajuste */}
      {fitCount > 0 && fitCount < count && (
        <div style={{
          paddingTop: 10, borderTop: '0.5px solid var(--color-border)',
          fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.6,
        }}>
          Ou{' '}
          <button
            onClick={() => onReduceTo(fitCount)}
            style={{
              background: 'none', color: 'var(--color-text-primary)',
              textDecoration: 'underline', fontSize: 11, padding: 0, cursor: 'pointer',
            }}
          >
            reduza para {fitCount} variaç{fitCount === 1 ? 'ão' : 'ões'}
          </button>
          {' '}e gere agora com o saldo atual.
        </div>
      )}
    </div>
  )
}
