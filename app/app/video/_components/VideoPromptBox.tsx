'use client'

// Direção criativa — campo opcional de texto livre. Complementa (nunca
// substitui) as diretivas de preservação injetadas pelo promptBuilder.
// Quando a análise da imagem sugere uma direção, aparece o botão
// "Usar sugestão".

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
          Direção criativa
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.55, marginLeft: 6 }}>
            (opcional)
          </span>
        </Label>
        {suggestion && onUseSuggestion && suggestion !== value && (
          <button
            type="button"
            onClick={onUseSuggestion}
            style={{
              fontSize: 10, color: 'var(--color-accent-green)',
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
        placeholder="Ex: câmera entrando lentamente na sala, com movimento suave e cinematográfico, preservando materiais e mobiliário."
        rows={3}
        disabled={disabled}
        style={{
          width:        '100%',
          background:   'var(--color-input)',
          border:       '1px solid var(--color-input-border)',
          borderRadius: 8,
          padding:      '10px 12px',
          fontSize:     12,
          color:        'var(--color-text-primary)',
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
    color:       'var(--color-text-tertiary)',
  }}>
    {children}
  </div>
)
