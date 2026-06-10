'use client'

// Seletor de INTENÇÃO do modo Editar (Google-first, "intenção primeiro").
//
// Ao entrar no Editar o usuário não cai direto no prompt: primeiro escolhe o
// tipo de edição (8 cartões) e a interface se adapta (máscara obrigatória ou
// não, campos de referência, toggle de geometria, botões rápida/premium).
// Nenhum nome técnico de modelo aparece.
//
// Usado pelos DOIS fluxos: RetocarStandaloneFlow (/app/editar) e
// RetocarOverlay (modal "Editar vista" do Spaces) — o overlay usa `compact`.

import { EDIT_INTENTS, VALID_EDIT_INTENTS, type EditIntent } from '@/lib/spaces/edit-intents'

export function EditIntentPicker({ onPick, compact = false, exclude = [] }: {
  onPick:   (intent: EditIntent) => void
  /** Layout denso (overlay do Spaces). */
  compact?: boolean
  /** Intenções a esconder num contexto (ex.: overlay sem upload de imagem principal). */
  exclude?: EditIntent[]
}) {
  const intents = VALID_EDIT_INTENTS.filter(i => !exclude.includes(i))
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: compact ? 8 : 10,
    }}>
      {intents.map(i => {
        const meta = EDIT_INTENTS[i]
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              gap: compact ? 4 : 7,
              padding: compact ? '10px 12px' : '14px 16px',
              background: 'var(--color-bg-elevated)',
              border: '0.5px solid var(--color-border-strong)',
              borderRadius: 12,
              cursor: 'pointer', textAlign: 'left',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s, background 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(29,158,117,0.55)'
              e.currentTarget.style.background = 'rgba(29,158,117,0.05)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--color-border-strong)'
              e.currentTarget.style.background = 'var(--color-bg-elevated)'
            }}
          >
            <span aria-hidden style={{
              fontSize: compact ? 13 : 16, lineHeight: 1,
              color: 'var(--color-text-tertiary)',
            }}>
              {meta.icon}
            </span>
            <span style={{
              fontSize: compact ? 12 : 13.5, fontWeight: 500,
              color: 'var(--color-text-primary)', letterSpacing: '-0.01em',
            }}>
              {meta.label}
            </span>
            {!compact && (
              <span style={{
                fontSize: 11, color: 'var(--color-text-tertiary)',
                lineHeight: 1.45, letterSpacing: '-0.005em',
              }}>
                {meta.description}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Chip da intenção ativa + ação "trocar" (header do editor). */
export function ActiveIntentChip({ intent, onChange, disabled }: {
  intent:   EditIntent
  onChange: () => void
  disabled: boolean
}) {
  const meta = EDIT_INTENTS[intent]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '6px 12px', borderRadius: 999,
        background: 'rgba(29,158,117,0.10)', border: '0.5px solid rgba(29,158,117,0.4)',
        fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
        letterSpacing: '-0.005em',
      }}>
        <span aria-hidden style={{ fontSize: 12, color: '#1D9E75' }}>{meta.icon}</span>
        {meta.label}
      </span>
      <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        style={{
          fontSize: 11, color: 'var(--color-text-tertiary)',
          background: 'none', border: 'none', padding: '4px 2px',
          textDecoration: 'underline', cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1, fontFamily: 'inherit',
        }}
      >
        Trocar tipo de edição
      </button>
    </div>
  )
}
