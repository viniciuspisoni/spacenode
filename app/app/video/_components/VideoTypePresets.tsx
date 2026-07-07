'use client'

// Seletor de "Tipo de vídeo" — o primeiro passo do painel. Cinco presets
// com objetivo de arquitetura claro; selecionar um aplica defaults de
// motor, movimento, duração, formato e intensidade de uma vez.

import { VIDEO_TYPE_ORDER, VIDEO_TYPE_PRESETS, type VideoTypeId } from '@/lib/video/videoPresets'

interface Props {
  selected:  VideoTypeId
  onSelect:  (id: VideoTypeId) => void
  disabled?: boolean
}

export default function VideoTypePresets({ selected, onSelect, disabled }: Props) {
  return (
    <div>
      <Label>Tipo de vídeo</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {VIDEO_TYPE_ORDER.map(id => {
          const p = VIDEO_TYPE_PRESETS[id]
          const active = selected === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => !disabled && onSelect(id)}
              disabled={disabled}
              title={p.useCases}
              style={{
                display:      'flex',
                alignItems:   'flex-start',
                gap:          11,
                width:        '100%',
                textAlign:    'left',
                padding:      '11px 12px',
                borderRadius: 10,
                border:       `1px solid ${active ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                background:   active ? 'var(--color-surface)' : 'transparent',
                cursor:       disabled ? 'not-allowed' : 'pointer',
                transition:   'border-color 0.15s, background 0.15s',
                opacity:      disabled ? 0.6 : 1,
              }}
            >
              <span style={{
                width:          28,
                height:         28,
                borderRadius:   8,
                flexShrink:     0,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                background:     active ? 'var(--color-surface-hover)' : 'var(--color-surface-subtle)',
                border:         '0.5px solid var(--color-border)',
                color:          active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                transition:     'background 0.15s, color 0.15s',
              }}>
                <PresetGlyph id={id} />
              </span>

              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  display:       'block',
                  fontSize:      12.5,
                  fontWeight:    500,
                  letterSpacing: '-0.01em',
                  color:         active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}>
                  {p.label}
                </span>
                <span style={{
                  display:    'block',
                  fontSize:   10.5,
                  color:      'var(--color-text-tertiary)',
                  marginTop:  2,
                  lineHeight: 1.45,
                }}>
                  {p.tagline}
                </span>
              </span>

              <span style={{
                width:        7,
                height:       7,
                borderRadius: '50%',
                flexShrink:   0,
                marginTop:    6,
                background:   active ? 'var(--color-accent-green)' : 'transparent',
                border:       active ? 'none' : '1px solid var(--color-border-strong)',
                transition:   'background 0.15s',
              }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Glyphs minimalistas por objetivo — abstratos, stroke fino, herdam cor.
function PresetGlyph({ id }: { id: VideoTypeId }) {
  const common = {
    width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.3,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (id) {
    case 'cinematic':   // frame de cinema com movimento
      return (
        <svg {...common}>
          <rect x="2" y="4" width="12" height="8" rx="1.5"/>
          <path d="M5.5 8 H10.5 M8.5 6 L10.5 8 L8.5 10"/>
        </svg>
      )
    case 'tour':        // caminho atravessando o espaço
      return (
        <svg {...common}>
          <path d="M3 13 Q5 9 8 8.5 T13 3"/>
          <circle cx="3" cy="13" r="1.2"/>
          <circle cx="13" cy="3" r="1.2"/>
        </svg>
      )
    case 'reels':       // retrato 9:16 com play
      return (
        <svg {...common}>
          <rect x="4.5" y="2" width="7" height="12" rx="1.5"/>
          <path d="M7 6.5 L9.8 8 L7 9.5 Z"/>
        </svg>
      )
    case 'commercial':  // prancheta de apresentação
      return (
        <svg {...common}>
          <rect x="2" y="3" width="12" height="8" rx="1"/>
          <path d="M8 11 V13.5 M5.5 13.5 H10.5"/>
        </svg>
      )
    case 'detail':      // lupa sobre material
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4"/>
          <path d="M10 10 L13.5 13.5"/>
        </svg>
      )
  }
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
