'use client'

// Estado vazio do canvas — a primeira impressão do módulo. Comunica em
// segundos o que o Animar faz, para quem serve e o que entrega, e convida
// ao upload. Não é um placeholder: é a promessa da ferramenta.
//
// Estrutura: wrapper é um <div> clicável (área inteira abre o file picker);
// as duas ações internas são <button> reais — nested buttons são HTML
// inválido, então o wrapper não pode ser <button>.

const USE_CASES = ['Propostas comerciais', 'Reels e Stories', 'Apresentações', 'Tráfego pago']

interface Props {
  onPick:            () => void
  onPickFromHistory: () => void
  isDragging?:       boolean
}

export default function EmptyAnimateState({ onPick, onPickFromHistory, isDragging }: Props) {
  return (
    // .spn-empty é a única caixa de vazio do app — aqui ela só recebe a
    // geometria de "ocupa o palco inteiro" e o realce de arrastar.
    <div
      onClick={onPick}
      className="spn-empty"
      style={{
        flex:           1,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            20,
        margin:         14,
        padding:        '40px 32px',
        borderColor:    isDragging ? 'var(--color-border-focus)' : undefined,
        background:     isDragging ? 'var(--color-chip)' : undefined,
        cursor:         'pointer',
        transition:     'border-color 180ms var(--ease), background 180ms var(--ease)',
      }}
    >
      <div className="spn-glass spn-glass--raised" style={{
        width:        58, height: 58, borderRadius: 16,
        display:      'flex', alignItems: 'center', justifyContent: 'center',
        color:        'var(--color-text-secondary)',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="23 7 16 12 23 17 23 7"/>
          <rect x="1" y="5" width="15" height="14" rx="2"/>
        </svg>
      </div>

      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{
          fontSize:   16,
          fontWeight: 500,
          color:      'var(--color-text-primary)',
          letterSpacing: '-0.015em',
          lineHeight: 1.35,
        }}>
          Transforme uma imagem de projeto em um vídeo de apresentação
        </div>
        <div style={{
          fontSize:      12.5,
          color:         'var(--color-text-tertiary)',
          marginTop:     10,
          lineHeight:    1.6,
          letterSpacing: '-0.005em',
        }}>
          Envie um render, foto de obra ou imagem de maquete. A SpaceNode adiciona
          movimento cinematográfico sem perder a essência do ambiente — composição,
          materiais e mobiliário preservados.
        </div>

        <div style={{
          display:        'flex',
          flexWrap:       'wrap',
          justifyContent: 'center',
          gap:            6,
          marginTop:      16,
        }}>
          {USE_CASES.map(u => (
            <span key={u} style={{
              fontSize:      10.5,
              letterSpacing: '-0.005em',
              color:         'var(--color-text-secondary)',
              padding:       '4px 11px',
              borderRadius:  999,
              border:        '0.5px solid var(--glass-line)',
              background:    'var(--color-chip)',
            }}>
              {u}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          className="spn-cta"
          onClick={e => { e.stopPropagation(); onPick() }}
          style={{ width: 'auto', minHeight: 38, padding: '0 20px' }}
        >
          Selecionar imagem
        </button>
        <button
          type="button"
          className="spn-ghost"
          onClick={e => { e.stopPropagation(); onPickFromHistory() }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15 L16 10 L5 21"/>
          </svg>
          Escolher do histórico
        </button>
      </div>

      <div style={{
        fontSize:  10.5,
        color:     'var(--color-text-quaternary)',
        letterSpacing: '0.04em',
      }}>
        Arraste e solte · PNG, JPG ou WEBP até 20 MB
      </div>
    </div>
  )
}
