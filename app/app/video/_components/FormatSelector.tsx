'use client'

// Formato do vídeo — escolha explícita do usuário (antes era derivado
// silenciosamente do preset de movimento). 'auto' mantém a proporção da
// imagem enviada. Opções não suportadas pelo motor atual aparecem
// desabilitadas com dica de qual motor as oferece.

import { listAvailableVideoModels, type VideoModel } from '@/lib/video/models'

interface FormatOption {
  id:    string
  label: string
  hint:  string
}

const FORMAT_OPTIONS: FormatOption[] = [
  { id: 'auto', label: 'Original',        hint: 'Mantém a proporção da imagem' },
  { id: '16:9', label: '16:9 Horizontal', hint: 'Apresentações · YouTube' },
  { id: '9:16', label: '9:16 Vertical',   hint: 'Reels · Stories · TikTok' },
  { id: '1:1',  label: '1:1 Quadrado',    hint: 'Feed' },
]

interface Props {
  value:     string
  onChange:  (v: string) => void
  model:     VideoModel
  disabled?: boolean
}

export default function FormatSelector({ value, onChange, model, disabled }: Props) {
  // Só oferecemos formatos que ALGUM motor disponível entrega de verdade —
  // nada de opção que quebra na geração. (1:1 aparece quando um motor
  // futuro suportar.)
  const offeredSomewhere = new Set(
    listAvailableVideoModels().flatMap(m => m.supportedAspectRatios),
  )
  const options = FORMAT_OPTIONS.filter(o => offeredSomewhere.has(o.id))

  return (
    <div>
      <Label>Formato</Label>
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap:                 6,
      }}>
        {options.map(o => {
          const supported = model.supportedAspectRatios.includes(o.id)
          const active    = value === o.id
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => !disabled && supported && onChange(o.id)}
              disabled={disabled || !supported}
              title={supported ? o.hint : 'Não suportado pelo motor selecionado'}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          9,
                textAlign:    'left',
                padding:      '9px 10px',
                borderRadius: 9,
                border:       `1px solid ${active ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                background:   active ? 'var(--color-surface-hover)' : 'var(--color-surface-subtle)',
                cursor:       (disabled || !supported) ? 'not-allowed' : 'pointer',
                opacity:      supported ? 1 : 0.4,
                transition:   'border-color 0.15s, background 0.15s',
              }}
            >
              <RatioGlyph id={o.id} active={active} />
              <span style={{ minWidth: 0 }}>
                <span style={{
                  display:       'block',
                  fontSize:      11,
                  fontWeight:    500,
                  letterSpacing: '-0.01em',
                  color:         active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}>
                  {o.label}
                </span>
                <span style={{
                  display:      'block',
                  fontSize:     9.5,
                  color:        'var(--color-text-tertiary)',
                  marginTop:    1,
                  whiteSpace:   'nowrap',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {o.hint}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Miniatura da proporção — retângulo com a razão real.
function RatioGlyph({ id, active }: { id: string; active: boolean }) {
  const stroke = active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'
  const box = 18
  let w = 14, h = 9, dashed = false
  if (id === '9:16') { w = 8;  h = 14 }
  if (id === '1:1')  { w = 12; h = 12 }
  if (id === 'auto') { w = 13; h = 10; dashed = true }
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} fill="none" style={{ flexShrink: 0 }}>
      <rect
        x={(box - w) / 2}
        y={(box - h) / 2}
        width={w}
        height={h}
        rx={1.5}
        stroke={stroke}
        strokeWidth="1.2"
        strokeDasharray={dashed ? '2.5 2' : undefined}
      />
    </svg>
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
