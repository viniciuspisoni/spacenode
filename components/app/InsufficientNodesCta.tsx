'use client'

// Substitui o CTA desabilitado quando o saldo não cobre a geração.
//
// Um botão apagado é um beco sem saída: o usuário entende que não pode gerar,
// mas não recebe caminho nenhum. Aqui o bloqueio vira ação — mostra a conta,
// leva pra /app/billing e, quando existe, oferece a saída que não custa nada
// (uma configuração mais barata que cabe no saldo atual).
//
// Princípios herdados do InsufficientBalancePanel (Spaces):
//   - Sempre mostrar a matemática
//   - Sem urgência manufaturada
//   - Sempre oferecer a alternativa que NÃO gera receita

import Link from 'next/link'
import { PLANS } from '@/lib/plans'

interface Props {
  /** Custo da geração configurada, em nodes. */
  needed: number
  /** Saldo atual do pagador, em nodes. */
  available: number
  /** Configuração mais barata que cabe no saldo. Omitir quando não existe. */
  alternative?: { label: string; onClick: () => void }
}

export default function InsufficientNodesCta({ needed, available, alternative }: Props) {
  const missing  = Math.max(0, needed - available)
  const cheapest = PLANS.reduce((min, p) => (p.monthlyPrice < min.monthlyPrice ? p : min), PLANS[0])
  const progress = needed > 0 ? Math.min(100, (available / needed) * 100) : 0

  return (
    <div className="spn-glass" style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: 16, borderRadius: 'var(--r-card)',
    }}>
      <div>
        <div style={{
          fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
          color: 'var(--color-text-primary)', marginBottom: 4,
        }}>
          Faltam {missing} node{missing === 1 ? '' : 's'} pra gerar
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
          Esta geração custa {needed} · você tem {available}
        </div>
      </div>

      <div style={{ height: 4, borderRadius: 999, background: 'var(--glass-line-strong)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: 'var(--color-text-quaternary)',
          transition: 'width 400ms var(--ease)',
        }} />
      </div>

      {/* O CTA do sistema. O preço vai no .spn-cta-meta — era um span com
          --color-text-tertiary sobre o fundo inverso, ou seja, cinza claro
          sobre claro no tema claro. */}
      <Link href="/app/billing" className="spn-cta" style={{ textDecoration: 'none', justifyContent: 'space-between' }}>
        <span>ver planos</span>
        <span className="spn-cta-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>a partir de R$ {cheapest.monthlyPrice}/mês</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </Link>

      {alternative && (
        <div style={{
          fontSize: 11, color: 'var(--color-text-tertiary)',
          lineHeight: 1.6, letterSpacing: '-0.005em',
        }}>
          Ou{' '}
          <button
            type="button"
            onClick={alternative.onClick}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--color-text-primary)', textDecoration: 'underline',
              fontSize: 11, fontFamily: 'inherit', letterSpacing: 'inherit',
            }}
          >
            {alternative.label}
          </button>
          {' '}e gere agora com o saldo atual.
        </div>
      )}
    </div>
  )
}
