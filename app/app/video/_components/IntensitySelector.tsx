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
                border:        `1px solid ${active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)'}`,
                background:    active ? 'rgba(255,255,255,0.08)' : 'transparent',
                color:         active ? '#ffffff' : 'rgba(255,255,255,0.50)',
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
    color:       'rgba(255,255,255,0.40)',
    marginBottom: 10,
  }}>
    {children}
  </div>
)
