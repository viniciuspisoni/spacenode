'use client'

// Resumo de custo + saldo + botão de geração — rodapé fixo do painel
// direito. Implementa a regra do brief:
//   - Se ainda não há imagem (modelo escolhido?), mostrar
//     "Custo calculado após configuração"
//   - Caso contrário, mostrar custo real

interface Props {
  nodeCost:      number
  credits:       number
  ready:         boolean        // tem imagem + modelo escolhido
  isLoading:     boolean
  isAnalyzing:   boolean
  disabledHint?: string         // ex: "Carregue uma imagem primeiro"
  onSubmit:      () => void
}

export default function CostSummary({
  nodeCost, credits, ready, isLoading, isAnalyzing, disabledHint, onSubmit,
}: Props) {
  const insufficient = ready && credits < nodeCost
  const canSubmit    = ready && !insufficient && !isLoading && !isAnalyzing

  const buttonLabel = isLoading       ? 'Gerando vídeo…'
                    : isAnalyzing     ? 'Analisando imagem…'
                    : insufficient    ? 'Saldo insuficiente'
                    : !ready          ? 'Carregue uma imagem'
                    :                   'Animar projeto'

  return (
    <div style={{
      padding:    '16px 24px',
      borderTop:  '0.5px solid rgba(255,255,255,0.07)',
      flexShrink: 0,
    }}>
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   12,
      }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>
          {ready ? (
            <>Custo: <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{nodeCost} Nodes</span></>
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.40)' }}>
              Custo calculado após configuração
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>
          Saldo:{' '}
          <span style={{
            color: credits > 0 ? 'rgba(255,255,255,0.75)' : '#f87171',
            fontWeight: 500,
          }}>
            {credits} Nodes
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        title={!canSubmit && disabledHint ? disabledHint : undefined}
        style={{
          width:         '100%',
          padding:       '13px 20px',
          borderRadius:  9,
          border:        'none',
          background:    canSubmit ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.07)',
          color:         canSubmit ? '#0a0a0a' : 'rgba(255,255,255,0.30)',
          fontSize:      13,
          fontWeight:    600,
          letterSpacing: '-0.01em',
          cursor:        canSubmit ? 'pointer' : 'not-allowed',
          transition:    'background 0.15s, color 0.15s',
        }}
      >
        {buttonLabel}
      </button>

      {!ready && (
        <div style={{
          fontSize:  10,
          color:     'rgba(255,255,255,0.30)',
          marginTop: 8,
          textAlign: 'center',
        }}>
          A SpaceNode sugere modelo, câmera e duração após receber a imagem.
        </div>
      )}
    </div>
  )
}
