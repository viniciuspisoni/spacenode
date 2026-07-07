'use client'

// Intensidade do movimento — 4 níveis com linguagem de produto.
// Default seguro para arquitetura é 'subtle'; a descrição do nível
// selecionado aparece abaixo para orientar sem poluir.

import type { CameraIntensity } from '@/lib/video/cameraPresets'

const INTENSITIES: { id: CameraIntensity; label: string; description: string }[] = [
  { id: 'subtle',     label: 'Sutil',           description: 'Movimento quase imperceptível — o mais seguro para preservar o projeto.' },
  { id: 'normal',     label: 'Moderado',        description: 'Movimento presente, ainda contido e elegante.' },
  { id: 'cinematic',  label: 'Cinematográfico', description: 'Ritmo de cinema, com profundidade e presença.' },
  { id: 'pronounced', label: 'Dinâmico',        description: 'Mais energia — indicado para redes sociais.' },
]

interface Props {
  value:     CameraIntensity
  onChange:  (v: CameraIntensity) => void
  disabled?: boolean
}

export default function IntensitySelector({ value, onChange, disabled }: Props) {
  const selected = INTENSITIES.find(i => i.id === value)

  return (
    <div>
      <Label>Intensidade do movimento</Label>
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap:                 6,
      }}>
        {INTENSITIES.map(i => {
          const active = value === i.id
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => !disabled && onChange(i.id)}
              disabled={disabled}
              style={{
                padding:       '9px 10px',
                borderRadius:  9,
                fontSize:      11.5,
                fontWeight:    500,
                letterSpacing: '-0.01em',
                textAlign:     'center',
                border:        `1px solid ${active ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                background:    active ? 'var(--color-surface-hover)' : 'transparent',
                color:         active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                cursor:        disabled ? 'not-allowed' : 'pointer',
                transition:    'all 0.15s',
              }}
            >
              {i.label}
            </button>
          )
        })}
      </div>
      {selected && (
        <div style={{
          fontSize:   10.5,
          color:      'var(--color-text-tertiary)',
          marginTop:  8,
          lineHeight: 1.45,
        }}>
          {selected.description}
        </div>
      )}
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
