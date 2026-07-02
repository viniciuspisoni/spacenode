'use client'

// 3 modos de fidelidade conforme o brief:
//   - max:      Máxima fidelidade ao projeto    (default)
//   - balanced: Equilíbrio entre fidelidade e cinematicidade
//   - creative: Mais liberdade criativa
//
// Reforça que fidelidade é a vantagem competitiva — o default já é "max".

import type { FidelityMode } from '@/lib/video/promptBuilder'

const MODES: { id: FidelityMode; label: string; description: string }[] = [
  {
    id:          'max',
    label:       'Máxima fidelidade',
    description: 'Preserva geometria, materiais, aberturas e mobiliário',
  },
  {
    id:          'balanced',
    label:       'Equilíbrio',
    description: 'Pequenas adaptações cinematográficas de luz e atmosfera',
  },
  {
    id:          'creative',
    label:       'Mais liberdade',
    description: 'Reinterpreta atmosfera, mantém intenção do projeto',
  },
]

interface Props {
  value:    FidelityMode
  onChange: (v: FidelityMode) => void
  disabled?: boolean
}

export default function FidelityModeSelector({ value, onChange, disabled }: Props) {
  return (
    <div>
      <Label>Fidelidade ao projeto</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MODES.map(m => {
          const active = value === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => !disabled && onChange(m.id)}
              disabled={disabled}
              style={{
                display:       'flex',
                alignItems:    'flex-start',
                gap:           10,
                padding:       '10px 12px',
                borderRadius:  9,
                textAlign:     'left',
                width:         '100%',
                border:        `1px solid ${active ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                background:    active ? 'var(--color-surface)' : 'transparent',
                cursor:        disabled ? 'not-allowed' : 'pointer',
                transition:    'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                background: active ? 'var(--color-text-primary)' : 'var(--color-text-quaternary)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize:      12.5,
                  fontWeight:    500,
                  letterSpacing: '-0.01em',
                  color:         active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}>
                  {m.label}
                </div>
                <div style={{
                  fontSize: 10.5,
                  color:    'var(--color-text-tertiary)',
                  marginTop:3,
                  lineHeight: 1.4,
                }}>
                  {m.description}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize:    10, fontWeight: 600, letterSpacing: '0.1em',
    textTransform:'uppercase' as const,
    color:       'var(--color-text-tertiary)',
    marginBottom: 10,
  }}>
    {children}
  </div>
)
