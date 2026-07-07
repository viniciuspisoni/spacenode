'use client'

// Card individual de preset de câmera. Usado em grade pelo
// CameraMotionPresets. Mostra label, descrição e ícone abstrato
// representando o movimento.

import type { CameraMotion } from '@/lib/video/cameraPresets'

interface Props {
  motion:   CameraMotion
  active:   boolean
  onClick:  () => void
  compact?: boolean
}

export default function ArchitectureVideoPresetCard({ motion, active, onClick, compact }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign:     'left',
        padding:       compact ? '10px 12px' : '12px 14px',
        borderRadius:  10,
        border:        `1px solid ${active ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
        background:    active ? 'var(--color-surface-hover)' : 'var(--color-surface-subtle)',
        cursor:        'pointer',
        transition:    'border-color 0.15s, background 0.15s',
        display:       'flex',
        flexDirection: 'column',
        gap:           5,
        minHeight:     compact ? 56 : 68,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MotionGlyph motionId={motion.id} active={active} />
        <span style={{
          fontSize:      12,
          fontWeight:    500,
          letterSpacing: '-0.01em',
          color:         active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        }}>
          {motion.label}
        </span>
      </div>
      <div style={{
        fontSize:   10.5,
        color:      'var(--color-text-tertiary)',
        lineHeight: 1.45,
      }}>
        {motion.description}
      </div>
    </button>
  )
}

// Glyph minimalista representando o movimento — abstrato, não literal.
// Exportado: o MotionSelector (lista curada da superfície principal) usa
// os mesmos glyphs para manter a linguagem visual única.
export function MotionGlyph({ motionId, active }: { motionId: string; active: boolean }) {
  const stroke = active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'
  const size   = 16
  switch (motionId) {
    case 'dolly-in-soft':
    case 'dolly-in-cinematic':
    case 'enter-room':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M2 8 L13 8 M9 4 L13 8 L9 12" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      )
    case 'dolly-out-soft':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M14 8 L3 8 M7 4 L3 8 L7 12" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      )
    case 'lateral-tracking':
    case 'horizontal-pan':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M2 8 L14 8 M5 5 L2 8 L5 11 M11 5 L14 8 L11 11" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      )
    case 'orbit-soft':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5" stroke={stroke} strokeWidth="1.4" strokeDasharray="3 2"/>
          <circle cx="8" cy="8" r="1.5" fill={stroke}/>
        </svg>
      )
    case 'vertical-pan':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M8 2 L8 14 M5 5 L8 2 L11 5 M5 11 L8 14 L11 11" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      )
    case 'facade-reveal':
    case 'drone-soft':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M2 13 L8 4 L14 13" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="8" cy="4" r="1.5" fill={stroke}/>
        </svg>
      )
    case 'zoom-editorial':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <rect x="3" y="3" width="10" height="10" stroke={stroke} strokeWidth="1.2"/>
          <rect x="6" y="6" width="4"  height="4"  stroke={stroke} strokeWidth="1.2"/>
        </svg>
      )
    case 'parallax-subtle':
    case 'static-ambient':
    case 'social-loop':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2" stroke={stroke} strokeWidth="1.4"/>
          <circle cx="8" cy="8" r="5" stroke={stroke} strokeWidth="0.8" strokeDasharray="2 2"/>
        </svg>
      )
    case 'walkthrough-interior':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M2 13 Q5 9 8 9 T14 5" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      )
    case 'institutional-reveal':
    case 'real-estate-soft':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <rect x="3" y="3" width="10" height="10" stroke={stroke} strokeWidth="1.2"/>
          <path d="M3 8 L13 8" stroke={stroke} strokeWidth="1" strokeDasharray="2 2"/>
        </svg>
      )
    case 'lighting-reveal':
    case 'golden-hour':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="11" r="3" stroke={stroke} strokeWidth="1.4"/>
          <path d="M8 2 L8 4 M2 5 L4 6 M14 5 L12 6" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      )
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" stroke={stroke} strokeWidth="1.4"/>
        </svg>
      )
  }
}
