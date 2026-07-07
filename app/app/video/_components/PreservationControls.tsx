'use client'

// Bloco de preservação dentro dos Ajustes avançados. Duas partes:
//   1. Garantias sempre ativas (geometria, materiais, mobiliário, sem
//      deformações) — informativas, porque o promptBuilder injeta essas
//      diretivas em TODA geração. Comunicar > esconder.
//   2. Toggle "Evitar pessoas" — opcional, reforça cena desabitada.

const ALWAYS_ON: string[] = [
  'Geometria e proporções do projeto',
  'Materiais e acabamentos',
  'Mobiliário e composição',
  'Sem deformações ou mudanças no projeto',
]

interface Props {
  avoidPeople: boolean
  onToggleAvoidPeople: (v: boolean) => void
  disabled?: boolean
}

export default function PreservationControls({ avoidPeople, onToggleAvoidPeople, disabled }: Props) {
  return (
    <div>
      <Label>Preservação do projeto</Label>

      <div style={{
        padding:      '10px 12px',
        borderRadius: 9,
        background:   'var(--color-surface-subtle)',
        border:       '1px solid var(--color-border)',
        marginBottom: 8,
      }}>
        <div style={{
          fontSize:      10.5,
          color:         'var(--color-text-tertiary)',
          marginBottom:  8,
          lineHeight:    1.45,
        }}>
          Sempre ativo em todas as gerações:
        </div>
        <ul style={{
          margin: 0, padding: 0, listStyle: 'none',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          {ALWAYS_ON.map(item => (
            <li key={item} style={{
              display:    'flex',
              alignItems: 'center',
              gap:        7,
              fontSize:   11,
              color:      'var(--color-text-secondary)',
              lineHeight: 1.4,
            }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"
                stroke="var(--color-accent-green)" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M3 8.5 L6.5 12 L13 4.5"/>
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => !disabled && onToggleAvoidPeople(!avoidPeople)}
        disabled={disabled}
        role="switch"
        aria-checked={avoidPeople}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            10,
          width:          '100%',
          textAlign:      'left',
          padding:        '10px 12px',
          borderRadius:   9,
          border:         `1px solid ${avoidPeople ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
          background:     avoidPeople ? 'var(--color-surface)' : 'transparent',
          cursor:         disabled ? 'not-allowed' : 'pointer',
          transition:     'border-color 0.15s, background 0.15s',
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{
            display:       'block',
            fontSize:      11.5,
            fontWeight:    500,
            letterSpacing: '-0.01em',
            color:         'var(--color-text-primary)',
          }}>
            Evitar pessoas
          </span>
          <span style={{
            display:    'block',
            fontSize:   10.5,
            color:      'var(--color-text-tertiary)',
            marginTop:  2,
            lineHeight: 1.4,
          }}>
            Reforça que a cena permaneça sem figuras humanas.
          </span>
        </span>

        {/* Switch visual */}
        <span style={{
          width:        30,
          height:       18,
          borderRadius: 20,
          flexShrink:   0,
          position:     'relative',
          background:   avoidPeople ? 'var(--color-accent-green)' : 'var(--color-surface-hover)',
          border:       '0.5px solid var(--color-border-strong)',
          transition:   'background 0.18s',
        }}>
          <span style={{
            position:     'absolute',
            top:          2,
            left:         avoidPeople ? 13 : 2,
            width:        13,
            height:       13,
            borderRadius: '50%',
            background:   avoidPeople ? '#ffffff' : 'var(--color-text-tertiary)',
            transition:   'left 0.18s, background 0.18s',
          }} />
        </span>
      </button>
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
