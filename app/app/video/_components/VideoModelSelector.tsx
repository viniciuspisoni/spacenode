'use client'

// Seletor de modelo de vídeo. Lista todos os modelos do catálogo central
// (incluindo placeholders Google Flow / Omni). Modelos não-disponíveis
// aparecem cinza + clique vai pra estado disabled.
//
// Antes do upload, mostra subtitle "Escolha automática recomendada após upload"
// se o estado ainda não detectou nada — alinhado com o brief.

import { VIDEO_MODEL_ORDER, VIDEO_MODELS } from '@/lib/video/models'
import type { VideoModel } from '@/lib/video/models'

interface Props {
  selectedId:        string
  onSelect:          (id: string) => void
  showRecommendBanner?: boolean       // true antes do upload
  recommendedId?:    string           // pós-análise
  disabled?:         boolean
}

const TONE_COLORS = {
  green: { fg: '#86efac', border: 'rgba(34,197,94,0.3)' },
  blue:  { fg: '#93c5fd', border: 'rgba(59,130,246,0.3)' },
  muted: { fg: 'rgba(255,255,255,0.4)', border: 'rgba(255,255,255,0.15)' },
}

export default function VideoModelSelector({
  selectedId,
  onSelect,
  showRecommendBanner,
  recommendedId,
  disabled,
}: Props) {
  return (
    <div>
      <Label>Modelo</Label>

      {showRecommendBanner && (
        <div style={{
          padding:       '8px 10px',
          borderRadius:  6,
          marginBottom:  10,
          background:    'rgba(255,255,255,0.03)',
          border:        '1px solid rgba(255,255,255,0.07)',
          fontSize:      11,
          color:         'rgba(255,255,255,0.5)',
          letterSpacing: '-0.005em',
        }}>
          Escolha automática recomendada após o upload da imagem.
        </div>
      )}

      {recommendedId && !showRecommendBanner && (
        <div style={{
          padding:       '8px 10px',
          borderRadius:  6,
          marginBottom:  10,
          background:    'rgba(134,239,172,0.06)',
          border:        '1px solid rgba(134,239,172,0.15)',
          fontSize:      11,
          color:         '#86efac',
          letterSpacing: '-0.005em',
        }}>
          Sugerido com base na imagem: {VIDEO_MODELS[recommendedId]?.label}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {VIDEO_MODEL_ORDER.map(id => {
          const m = VIDEO_MODELS[id]
          if (!m) return null
          return (
            <ModelRow
              key={id}
              model={m}
              active={selectedId === id}
              isRecommended={recommendedId === id}
              disabled={disabled}
              onClick={() => !disabled && m.isAvailable && onSelect(id)}
            />
          )
        })}
      </div>
    </div>
  )
}

function ModelRow({
  model, active, isRecommended, disabled, onClick,
}: {
  model: VideoModel
  active: boolean
  isRecommended: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const unavailable = !model.isAvailable
  const tone        = model.badge?.tone ? TONE_COLORS[model.badge.tone] : null

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || unavailable}
      style={{
        display:       'flex',
        alignItems:    'flex-start',
        gap:           10,
        padding:       '11px 12px',
        borderRadius:  9,
        textAlign:     'left',
        width:         '100%',
        border:        `1px solid ${active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'}`,
        background:    active ? 'rgba(255,255,255,0.06)' : 'transparent',
        cursor:        (disabled || unavailable) ? 'not-allowed' : 'pointer',
        opacity:       unavailable ? 0.45 : 1,
        transition:    'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{
        width:      8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
        background: active ? '#ffffff' : 'rgba(255,255,255,0.2)',
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize:      12.5,
            fontWeight:    500,
            letterSpacing: '-0.01em',
            color:         active ? '#ffffff' : 'rgba(255,255,255,0.7)',
          }}>
            {model.label}
          </span>
          <span style={{
            fontSize: 9,
            color:    active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.28)',
          }}>
            {model.tag}
          </span>
          {isRecommended && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#86efac',
              background: 'rgba(134,239,172,0.10)',
              border: '1px solid rgba(134,239,172,0.25)',
              padding: '2px 6px', borderRadius: 20,
            }}>
              Sugerido
            </span>
          )}
        </div>
        <div style={{
          fontSize:   10.5,
          color:      'rgba(255,255,255,0.38)',
          marginTop:  3,
          lineHeight: 1.4,
        }}>
          {model.description}
        </div>
      </div>

      {model.badge && (
        <span style={{
          fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color:      tone?.fg ?? 'rgba(255,255,255,0.4)',
          border:     `1px solid ${tone?.border ?? 'rgba(255,255,255,0.15)'}`,
          padding:    '2px 6px', borderRadius: 20,
          flexShrink: 0,
          marginTop:  4,
        }}>
          {model.badge.label}
        </span>
      )}
    </button>
  )
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize:    10, fontWeight: 600, letterSpacing: '0.1em',
    textTransform:'uppercase' as const,
    color:       'rgba(255,255,255,0.40)',
    marginBottom: 10,
  }}>
    {children}
  </div>
)
