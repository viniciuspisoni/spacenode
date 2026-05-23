'use client'

// Caixa de prompt do usuário — agora chamada "Direção da cena" no copy.
// Inclui dica didática como placeholder e botão opcional "Usar sugestão"
// quando há prompt sugerido pela análise.

interface Props {
  value:           string
  onChange:        (v: string) => void
  suggestion?:     string
  onUseSuggestion?: () => void
  disabled?:       boolean
}

export default function VideoPromptBox({
  value, onChange, suggestion, onUseSuggestion, disabled,
}: Props) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <Label>
          Direção da cena
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.55, marginLeft: 6 }}>
            (opcional)
          </span>
        </Label>
        {suggestion && onUseSuggestion && suggestion !== value && (
          <button
            type="button"
            onClick={onUseSuggestion}
            style={{
              fontSize: 10, color: '#86efac',
              background: 'none', border: 'none',
              padding: 0, cursor: 'pointer',
              letterSpacing: '-0.005em',
            }}
          >
            Usar sugestão
          </button>
        )}
      </div>

      <textarea
        value={value}
        onChange={e => !disabled && onChange(e.target.value)}
        placeholder="Ex: câmera avançando lentamente pela sala, mantendo geometria, materiais e iluminação originais."
        rows={3}
        disabled={disabled}
        style={{
          width:        '100%',
          background:   'rgba(255,255,255,0.04)',
          border:       '1px solid rgba(255,255,255,0.09)',
          borderRadius: 8,
          padding:      '10px 12px',
          fontSize:     12,
          color:        '#ffffff',
          resize:       'none',
          outline:      'none',
          fontFamily:   'inherit',
          lineHeight:   1.55,
          boxSizing:    'border-box',
          opacity:      disabled ? 0.5 : 1,
        }}
      />
    </div>
  )
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize:    10, fontWeight: 600, letterSpacing: '0.1em',
    textTransform:'uppercase' as const,
    color:       'rgba(255,255,255,0.40)',
  }}>
    {children}
  </div>
)
