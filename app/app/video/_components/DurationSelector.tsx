'use client'

// Seletor de duração — disponível depende do modelo. Mostra custo em
// nodes embaixo de cada opção. Reusado em todos os 3 modos.

import { getNodeCost, requireVideoModel } from '@/lib/video/models'

interface Props {
  modelId:    string
  value:      string
  onChange:   (v: string) => void
  disabled?:  boolean
}

export default function DurationSelector({ modelId, value, onChange, disabled }: Props) {
  const model = requireVideoModel(modelId)
  return (
    <div>
      <Label>Duração</Label>
      <div style={{ display: 'flex', gap: 8 }}>
        {model.supportedDurations.map(d => {
          const active = value === d
          let cost = 0
          try { cost = getNodeCost(modelId, d) } catch { cost = 0 }
          return (
            <button
              key={d}
              type="button"
              onClick={() => !disabled && onChange(d)}
              disabled={disabled}
              style={{
                flex:         1,
                padding:      '10px 8px',
                borderRadius: 8,
                textAlign:    'center',
                border:       `1px solid ${active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)'}`,
                background:   active ? 'rgba(255,255,255,0.08)' : 'transparent',
                cursor:       disabled ? 'not-allowed' : 'pointer',
                transition:   'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{
                fontSize:      14,
                fontWeight:    600,
                letterSpacing: '-0.01em',
                color:         active ? '#ffffff' : 'rgba(255,255,255,0.55)',
              }}>
                {d}s
              </div>
              <div style={{
                fontSize:      9,
                color:         'rgba(255,255,255,0.32)',
                marginTop:     2,
                letterSpacing: '0.04em',
              }}>
                {cost} nodes
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
    color:       'rgba(255,255,255,0.40)',
    marginBottom: 10,
  }}>
    {children}
  </div>
)
