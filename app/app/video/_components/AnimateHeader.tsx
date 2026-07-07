'use client'

// Header do Animar — título + promessa da ferramenta em uma linha.
// O antigo seletor de 3 modos foi substituído pelo fluxo único com
// presets de "Tipo de vídeo" no painel de configuração.

export default function AnimateHeader() {
  return (
    <div style={{
      padding:    '20px 28px 14px',
      flexShrink: 0,
    }}>
      <div style={{
        fontSize:    18,
        fontWeight:  500,
        color:       'var(--color-text-primary)',
        letterSpacing: '-0.02em',
      }}>
        Animar
      </div>
      <div style={{
        fontSize:      12,
        color:         'var(--color-text-tertiary)',
        marginTop:     3,
        letterSpacing: '-0.005em',
        lineHeight:    1.5,
      }}>
        Transforme imagens de projeto em vídeos curtos e cinematográficos —
        prontos para propostas, redes sociais e apresentações.
      </div>
    </div>
  )
}
