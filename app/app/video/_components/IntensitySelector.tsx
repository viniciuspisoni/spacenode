'use client'

import type { CameraIntensity } from '@/lib/video/cameraPresets'

const INTENSITIES: { id: CameraIntensity; label: string }[] = [
  { id: 'subtle',     label: 'Sutil'   },
  { id: 'normal',     label: 'Normal'  },
  { id: 'pronounced', label: 'Marcado' },
]

interface Props {
  value:     CameraIntensity
  onChange:  (v: CameraIntensity) => void
  disabled?: boolean
}

export default function IntensitySelector({ value, onChange, disabled }: Props) {
  return (
    <div>
      <Label>Intensidade do movimento</Label>
      <div style={{ display: 'flex', gap: 6 }}>
        {INTENSITIES.map(i => {
          const active = value === i.id
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => !disabled && onChange(i.id)}
              disabled={disabled}
              style={{
                flex:          1,
                padding:       '8px 12px',
                borderRadius:  8,
                fontSize:      11,
                letterSpacing: '-0.01em',
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
