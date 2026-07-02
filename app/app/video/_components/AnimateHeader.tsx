'use client'

// Header da tela Animar. Título "Animar projeto" + tabs dos 3 modos.
// Fica fixo no topo do canvas (não no painel lateral) para o usuário
// trocar de modo sem perder contexto da imagem carregada.

import type { AnimateMode } from '../_hooks/useAnimateState'

const MODES: { id: AnimateMode; label: string; description: string }[] = [
  {
    id:          'animate',
    label:       'Animar imagem',
    description: 'Sugestões automáticas a partir da imagem',
  },
  {
    id:          'camera',
    label:       'Câmera arquitetônica',
    description: 'Escolha um movimento de câmera pronto',
  },
  {
    id:          'guided',
    label:       'Cena guiada',
    description: 'Combine frame inicial, final, prompt e estilo',
  },
]

interface Props {
  mode:        AnimateMode
  onChange:    (mode: AnimateMode) => void
}

export default function AnimateHeader({ mode, onChange }: Props) {
  return (
    <div style={{
      padding:       '20px 28px 0',
      flexShrink:    0,
      display:       'flex',
      flexDirection: 'column',
      gap:           14,
    }}>
      <div>
        <div style={{
          fontSize:    18,
          fontWeight:  500,
          color:       'var(--color-text-primary)',
          letterSpacing: '-0.02em',
        }}>
          Animar projeto
        </div>
        <div style={{
          fontSize:      12,
          color:         'var(--color-text-tertiary)',
          marginTop:     3,
          letterSpacing: '-0.005em',
        }}>
          Transforme imagens estáticas em vídeos arquitetônicos com movimento de câmera,
          atmosfera e fidelidade ao projeto.
        </div>
      </div>

      <div style={{
        display:    'flex',
        gap:        4,
        padding:    3,
        background: 'var(--color-surface)',
        border:     '0.5px solid var(--color-border)',
        borderRadius: 10,
        width:      'fit-content',
      }}>
        {MODES.map(m => {
          const active = mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              title={m.description}
              style={{
                padding:      '7px 14px',
                fontSize:     12,
                fontWeight:   500,
                letterSpacing:'-0.01em',
                borderRadius: 8,
                border:       'none',
                background:   active ? 'var(--color-surface-hover)' : 'transparent',
                color:        active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                cursor:       'pointer',
                transition:   'background 0.15s, color 0.15s',
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
