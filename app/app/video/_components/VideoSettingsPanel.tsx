'use client'

// Frame do painel de configuração (coluna direita no desktop; empilha
// abaixo do canvas no mobile — ver .spn-animar-panel em globals.css).
// Cabeçalho + área rolável (children) + rodapé fixo com custo e CTA.

import CostSummary from './CostSummary'

interface Props {
  title:         string
  subtitle?:     string
  nodeCost:      number
  credits:       number
  ready:         boolean
  isLoading:     boolean
  isAnalyzing:   boolean
  estimateLabel?: string
  onSubmit:      () => void
  children:      React.ReactNode
}

export default function VideoSettingsPanel({
  title, subtitle, nodeCost, credits, ready, isLoading, isAnalyzing, estimateLabel, onSubmit, children,
}: Props) {
  // overflow fica na classe (.spn-animar-panel) p/ a media query mobile vencer
  return (
    <aside className="spn-animar-panel" style={{
      display:        'flex',
      flexDirection:  'column',
      background:     'var(--color-bg)',
    }}>
      <div style={{
        padding:    '20px 24px 16px',
        borderBottom: '0.5px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'var(--color-text-primary)',
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
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
        padding:        '20px 24px 24px',
        display:        'flex',
        flexDirection:  'column',
        gap:            24,
      }}>
        {children}
      </div>

      <CostSummary
        nodeCost={nodeCost}
        credits={credits}
        ready={ready}
        isLoading={isLoading}
        isAnalyzing={isAnalyzing}
        estimateLabel={estimateLabel}
        onSubmit={onSubmit}
      />
    </aside>
  )
}
