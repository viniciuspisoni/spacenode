'use client'

// Estado vazio do canvas — antes do upload. Convida o usuário a arrastar
// ou clicar para enviar uma imagem do projeto. Bonito e didático,
// não um placeholder seco.

interface Props {
  onPick:      () => void
  isDragging?: boolean
}

export default function EmptyAnimateState({ onPick, isDragging }: Props) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        flex:           1,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            18,
        margin:         28,
        marginTop:      8,
        padding:        '48px 32px',
        borderRadius:   16,
        border:         `1.5px dashed ${isDragging ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
        background:     isDragging ? 'var(--color-surface)' : 'transparent',
        color:          'inherit',
        cursor:         'pointer',
        transition:     'border-color 0.18s, background 0.18s',
      }}
    >
      <div style={{
        width:        58, height: 58, borderRadius: 16,
        background:   'var(--color-surface)',
        border:       '0.5px solid var(--color-border-strong)',
        display:      'flex', alignItems: 'center', justifyContent: 'center',
        color:        'var(--color-text-secondary)',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="23 7 16 12 23 17 23 7"/>
          <rect x="1" y="5" width="15" height="14" rx="2"/>
        </svg>
      </div>

      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{
          fontSize:   15,
          fontWeight: 500,
          color:      'var(--color-text-primary)',
          letterSpacing: '-0.01em',
        }}>
          Comece pela imagem do projeto
        </div>
        <div style={{
          fontSize:      12.5,
          color:         'var(--color-text-tertiary)',
          marginTop:     8,
          lineHeight:    1.55,
          letterSpacing: '-0.005em',
        }}>
          Arraste um render, foto de maquete ou print de Enscape/D5/Lumion.
          A SpaceNode analisa a imagem e sugere o movimento de câmera ideal.
        </div>
        <div style={{
          fontSize:  10.5,
          color:     'var(--color-text-quaternary)',
          marginTop: 14,
          letterSpacing: '0.04em',
        }}>
          PNG · JPG · WEBP — até 20 MB
        </div>
      </div>

      <div style={{
        display:    'inline-flex',
        alignItems: 'center',
        gap:        6,
        padding:    '8px 16px',
        borderRadius: 8,
        background: 'var(--color-inverse)',
        color:      'var(--color-inverse-foreground)',
        fontSize:   12.5,
        fontWeight: 600,
        letterSpacing: '-0.01em',
      }}>
        Selecionar imagem
      </div>
    </button>
  )
}
