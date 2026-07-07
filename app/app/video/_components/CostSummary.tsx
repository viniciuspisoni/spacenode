'use client'

// Rodapé fixo do painel: custo, saldo, estimativa de tempo e o CTA.
// O custo aparece assim que a configuração existe (motor + duração já
// têm default) — transparência antes do clique, sem surpresa.

interface Props {
  nodeCost:      number
  credits:       number
  ready:         boolean        // tem imagem carregada
  isLoading:     boolean
  isAnalyzing:   boolean
  estimateLabel?: string        // ex: "2–4 min"
  onSubmit:      () => void
}

export default function CostSummary({
  nodeCost, credits, ready, isLoading, isAnalyzing, estimateLabel, onSubmit,
}: Props) {
  const insufficient = credits < nodeCost
  const canSubmit    = ready && !insufficient && !isLoading && !isAnalyzing

  const buttonLabel = isLoading    ? 'Gerando vídeo…'
                    : isAnalyzing  ? 'Analisando imagem…'
                    : !ready       ? 'Envie uma imagem para começar'
                    : insufficient ? 'Saldo insuficiente'
                    :                'Gerar vídeo'

  return (
    <div style={{
      padding:    '14px 24px 16px',
      borderTop:  '0.5px solid var(--color-border)',
      flexShrink: 0,
      background: 'var(--color-bg)',
    }}>
      <div style={{
        display:        'flex',
        alignItems:     'baseline',
        justifyContent: 'space-between',
        marginBottom:   4,
      }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Custo desta geração
        </div>
        <div style={{
          fontSize:      13,
          fontWeight:    600,
          letterSpacing: '-0.01em',
          color:         'var(--color-text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {nodeCost} <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Nodes</span>
        </div>
      </div>

      <div style={{
        display:        'flex',
        alignItems:     'baseline',
        justifyContent: 'space-between',
        marginBottom:   12,
      }}>
        <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
          {estimateLabel ? `Fica pronto em ~${estimateLabel}` : 'Geração em poucos minutos'}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
          Saldo:{' '}
          <span style={{
            color: insufficient ? 'var(--color-error)' : 'var(--color-text-secondary)',
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {credits} Nodes
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          width:         '100%',
          padding:       '13px 20px',
          borderRadius:  9,
          border:        'none',
          background:    canSubmit ? 'var(--color-inverse)' : 'var(--color-surface)',
          color:         canSubmit ? 'var(--color-inverse-foreground)' : 'var(--color-text-tertiary)',
          fontSize:      13,
          fontWeight:    600,
          letterSpacing: '-0.01em',
          cursor:        canSubmit ? 'pointer' : 'not-allowed',
          transition:    'background 0.15s, color 0.15s',
        }}
      >
        {buttonLabel}
      </button>

      {insufficient && (
        <div style={{
          fontSize:  10.5,
          color:     'var(--color-error)',
          marginTop: 8,
          textAlign: 'center',
        }}>
          Faltam {nodeCost - credits} Nodes para esta configuração.
        </div>
      )}
      {!insufficient && !ready && (
        <div style={{
          fontSize:  10,
          color:     'var(--color-text-tertiary)',
          marginTop: 8,
          textAlign: 'center',
        }}>
          O vídeo preserva geometria, materiais e mobiliário do projeto.
        </div>
      )}
    </div>
  )
}
