'use client'

// Container do painel direito. Cabeçalho + área rolável de configurações
// (slot recebido como children, varia por modo) + rodapé com custo e
// botão. Mantém a estrutura visual consistente entre os 3 modos.

import CostSummary from './CostSummary'

interface Props {
  title:        string
  subtitle?:    string
  nodeCost:     number
  credits:      number
  ready:        boolean
  isLoading:    boolean
  isAnalyzing:  boolean
  disabledHint?:string
  onSubmit:     () => void
  children:     React.ReactNode
}

export default function VideoSettingsPanel({
  title, subtitle, nodeCost, credits, ready, isLoading, isAnalyzing, disabledHint, onSubmit, children,
}: Props) {
  return (
    <aside style={{
      width:          420,
      flexShrink:     0,
      display:        'flex',
      flexDirection:  'column',
      borderLeft:     '0.5px solid rgba(255,255,255,0.07)',
      overflow:       'hidden',
      background:     '#0a0a0a',
    }}>
      <div style={{
        padding:    '20px 24px 16px',
        borderBottom: '0.5px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: '#ffffff',
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.40)',
            marginTop: 4,
            lineHeight: 1.5,
          }}>
            {subtitle}
          </div>
        )}
      </div>

      <div style={{
        flex:           1,
        overflowY:      'auto',
        padding:        '20px 24px',
        display:        'flex',
        flexDirection:  'column',
        gap:            22,
      }}>
        {children}
      </div>

      <CostSummary
        nodeCost={nodeCost}
        credits={credits}
        ready={ready}
        isLoading={isLoading}
        isAnalyzing={isAnalyzing}
        disabledHint={disabledHint}
        onSubmit={onSubmit}
      />
    </aside>
  )
}
