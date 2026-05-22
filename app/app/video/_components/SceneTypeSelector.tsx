'use client'

// Chips de tipo de cena para o modo guiado. Pequeno componente
// reaproveitável que casa com o resto do design.

import { SCENE_TYPES, SCENE_TYPE_ORDER, type SceneTypeId } from '@/lib/video/scenes'

interface Props {
  value:     SceneTypeId
  onChange:  (v: SceneTypeId) => void
  disabled?: boolean
}

export default function SceneTypeSelector({ value, onChange, disabled }: Props) {
  return (
    <div>
      <Label>Tipo de cena</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SCENE_TYPE_ORDER.map(id => {
          const s = SCENE_TYPES[id]
          const active = value === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => !disabled && onChange(id)}
              disabled={disabled}
              style={{
                padding:       '6px 12px',
                borderRadius:  20,
                fontSize:      11,
                letterSpacing: '-0.005em',
                border:        `1px solid ${active ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.09)'}`,
                background:    active ? 'rgba(255,255,255,0.10)' : 'transparent',
                color:         active ? '#ffffff' : 'rgba(255,255,255,0.50)',
                cursor:        disabled ? 'not-allowed' : 'pointer',
                transition:    'all 0.15s',
              }}
            >
              {s.label}
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
