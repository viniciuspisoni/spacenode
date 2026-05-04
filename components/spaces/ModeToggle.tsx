'use client'

import type { GenerationMode } from '@/lib/spaces/types'

// ── ModeToggle ────────────────────────────────────────────────────────────────

interface ModeToggleProps {
  value:    GenerationMode
  onChange: (mode: GenerationMode) => void
}

const OPTIONS: {
  mode:        GenerationMode
  label:       string
  color:       string
  bgSelected:  string
  borderSelected: string
}[] = [
  {
    mode:           'coerente',
    label:          'Coerente',
    color:          '#30b46c',
    bgSelected:     'rgba(48,180,108,0.12)',
    borderSelected: 'rgba(48,180,108,0.3)',
  },
  {
    mode:           'explorar',
    label:          'Explorar',
    color:          '#f59e0b',
    bgSelected:     'rgba(245,158,11,0.12)',
    borderSelected: 'rgba(245,158,11,0.3)',
  },
]

export function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <div style={{
      display:    'flex', gap: 6,
      background: 'rgba(255,255,255,0.04)',
      border:     '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 9,
      padding:    4,
    }}>
      {OPTIONS.map(opt => {
        const isSelected = value === opt.mode
        return (
          <button
            key={opt.mode}
            onClick={() => onChange(opt.mode)}
            style={{
              flex:         1,
              padding:      '8px 0',
              background:   isSelected ? opt.bgSelected : 'transparent',
              border:       `0.5px solid ${isSelected ? opt.borderSelected : 'transparent'}`,
              borderRadius: 6,
              color:        isSelected ? opt.color : 'rgba(255,255,255,0.3)',
              fontSize:     12,
              fontWeight:   isSelected ? 600 : 400,
              fontFamily:   'inherit',
              cursor:       'pointer',
              letterSpacing: '-0.005em',
              transition:   'all 0.15s',
              display:      'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <div style={{
              width:        6, height: 6, borderRadius: '50%',
              background:   isSelected ? opt.color : 'rgba(255,255,255,0.2)',
              transition:   'background 0.15s',
            }} />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
