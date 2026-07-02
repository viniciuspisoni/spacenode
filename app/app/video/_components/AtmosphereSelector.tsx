'use client'

// Chips de atmosfera. Cada chip injeta no campo livre `atmosphere`
// que vira parte do prompt no servidor.

interface AtmosphereChip {
  id:    string
  label: string
  value: string  // texto que vai pro prompt
}

const ATMOSPHERES: AtmosphereChip[] = [
  { id: 'default',     label: 'Sem ajuste',         value: ''                                          },
  { id: 'goldenHour',  label: 'Fim de tarde',       value: 'golden hour warm light, long soft shadows' },
  { id: 'morning',     label: 'Luz da manhã',       value: 'morning soft natural light, cool tones'    },
  { id: 'night',       label: 'Noturna',            value: 'night scene with warm interior lighting'   },
  { id: 'overcast',    label: 'Neutra/nublada',     value: 'overcast diffuse natural light'            },
  { id: 'cozy',        label: 'Aconchegante',       value: 'warm cozy atmosphere, soft ambient light'  },
]

interface Props {
  value:    string             // o texto cru (não o id do chip)
  onChange: (v: string) => void
  disabled?: boolean
}

export default function AtmosphereSelector({ value, onChange, disabled }: Props) {
  return (
    <div>
      <Label>Atmosfera</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ATMOSPHERES.map(a => {
          const active = value.trim() === a.value.trim()
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => !disabled && onChange(a.value)}
              disabled={disabled}
              style={{
                padding:       '6px 12px',
                borderRadius:  20,
                fontSize:      11,
                letterSpacing: '-0.005em',
                border:        `1px solid ${active ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                background:    active ? 'var(--color-surface-hover)' : 'transparent',
                color:         active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                cursor:        disabled ? 'not-allowed' : 'pointer',
                transition:    'all 0.15s',
              }}
            >
              {a.label}
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
