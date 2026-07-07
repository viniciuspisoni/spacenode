'use client'

// Movimento de câmera — superfície principal. "Automático (recomendado)"
// no topo (mostra qual movimento será usado) + 7 escolhas curadas com
// linguagem acessível. O catálogo completo com 18 movimentos agrupados
// vive nos Ajustes avançados.

import {
  SIMPLE_MOTION_CHOICES,
  type CameraMotion,
} from '@/lib/video/cameraPresets'
import type { MotionChoice } from '@/lib/video/videoPresets'
import { MotionGlyph } from './ArchitectureVideoPresetCard'

interface Props {
  choice:         MotionChoice
  resolvedMotion: CameraMotion       // o que 'auto' vai usar de fato
  onSelect:       (choice: MotionChoice) => void
  disabled?:      boolean
}

export default function MotionSelector({ choice, resolvedMotion, onSelect, disabled }: Props) {
  const isAuto = choice === 'auto'
  // Escolha explícita fora da lista curada (feita no catálogo avançado):
  // sinalizamos no rodapé para o usuário não se perder.
  const inSimpleList = isAuto || SIMPLE_MOTION_CHOICES.some(c => c.id === choice)

  return (
    <div>
      <Label>Movimento de câmera</Label>

      {/* Automático — recomendado */}
      <button
        type="button"
        onClick={() => !disabled && onSelect('auto')}
        disabled={disabled}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          width:        '100%',
          textAlign:    'left',
          padding:      '10px 12px',
          borderRadius: 10,
          marginBottom: 8,
          border:       `1px solid ${isAuto ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
          background:   isAuto ? 'var(--color-surface)' : 'transparent',
          cursor:       disabled ? 'not-allowed' : 'pointer',
          transition:   'border-color 0.15s, background 0.15s',
        }}
      >
        <span style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isAuto ? 'var(--color-surface-hover)' : 'var(--color-surface-subtle)',
          border: '0.5px solid var(--color-border)',
        }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"
            stroke={isAuto ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'}
            strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2 L9.5 6.5 L14 8 L9.5 9.5 L8 14 L6.5 9.5 L2 8 L6.5 6.5 Z"/>
          </svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{
              fontSize: 12.5, fontWeight: 500, letterSpacing: '-0.01em',
              color: isAuto ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}>
              Automático
            </span>
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              color:      'var(--color-accent-green)',
              background: 'var(--color-accent-green-bg)',
              border:     '1px solid var(--color-accent-green-border)',
              padding:    '2px 6px', borderRadius: 20,
            }}>
              Recomendado
            </span>
          </span>
          <span style={{
            display: 'block', fontSize: 10.5,
            color: 'var(--color-text-tertiary)', marginTop: 2, lineHeight: 1.4,
          }}>
            {isAuto
              ? <>Usaremos: <span style={{ color: 'var(--color-text-secondary)' }}>{resolvedMotion.label}</span> — escolhido para a sua imagem.</>
              : 'A SpaceNode escolhe o movimento ideal para a imagem.'}
          </span>
        </span>
      </button>

      {/* Escolhas curadas */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap:                 6,
      }}>
        {SIMPLE_MOTION_CHOICES.map(c => {
          const active = choice === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => !disabled && onSelect(c.id)}
              disabled={disabled}
              title={c.description}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          8,
                textAlign:    'left',
                padding:      '9px 10px',
                borderRadius: 9,
                border:       `1px solid ${active ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                background:   active ? 'var(--color-surface-hover)' : 'var(--color-surface-subtle)',
                cursor:       disabled ? 'not-allowed' : 'pointer',
                transition:   'border-color 0.15s, background 0.15s',
              }}
            >
              <MotionGlyph motionId={c.id} active={active} />
              <span style={{
                fontSize:      11,
                fontWeight:    500,
                letterSpacing: '-0.01em',
                lineHeight:    1.3,
                color:         active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}>
                {c.label}
              </span>
            </button>
          )
        })}
      </div>

      {!inSimpleList && (
        <div style={{
          marginTop: 8,
          fontSize:  10.5,
          color:     'var(--color-text-tertiary)',
          lineHeight: 1.45,
        }}>
          Movimento selecionado no catálogo avançado:{' '}
          <span style={{ color: 'var(--color-text-secondary)' }}>{resolvedMotion.label}</span>
        </div>
      )}
    </div>
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
