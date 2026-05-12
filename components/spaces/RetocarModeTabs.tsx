'use client'

// Horizontal tabs for picking the Retocar EditMode (Remover / Trocar textura /
// Substituir / Adicionar). The user picks an architectural intention; the
// router (lib/spaces/engines/router.ts) maps it to the right FAL endpoint
// behind the scenes — the engine choice is invisible by design.
//
// Shared between RetocarStandaloneFlow and RetocarOverlay so both surfaces
// have identical look + behaviour.

import type { EditMode } from '@/lib/spaces/engines'
import { EDIT_MODE_LABELS } from '@/lib/spaces/engines'

interface Props {
  mode:         EditMode
  onModeChange: (mode: EditMode) => void
  /** Disable changes while a request is in flight. */
  disabled?:    boolean
}

// Mode order is intentional: workflow goes from "destructive" (remove) to
// "transformative" (texture) to "constructive" (replace, add).
const MODE_ORDER: EditMode[] = ['remove', 'texture', 'replace', 'add']

// Per-mode SVG icons — kept inline to avoid asset overhead.
function ModeIcon({ mode }: { mode: EditMode }) {
  const props = {
    width:  '14',
    height: '14',
    viewBox: '0 0 24 24',
    fill:    'none',
    stroke:  'currentColor',
    strokeWidth:    '1.5',
    strokeLinecap:  'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (mode) {
    case 'remove':
      return (
        <svg {...props}>
          <path d="M3 6h18" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      )
    case 'texture':
      return (
        <svg {...props}>
          <circle cx="13.5" cy="6.5" r="2.5" />
          <circle cx="17.5" cy="10.5" r="2.5" />
          <circle cx="8.5"  cy="7.5"  r="2.5" />
          <circle cx="6.5"  cy="12.5" r="2.5" />
          <path d="M12 2a10 10 0 1 0 10 10c0-2-1-3-3-3h-2a2 2 0 0 1-2-2V5a2 2 0 0 0-3-3z" />
        </svg>
      )
    case 'replace':
      return (
        <svg {...props}>
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      )
    case 'add':
      return (
        <svg {...props}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5"  y1="12" x2="19" y2="12" />
        </svg>
      )
  }
}

export function RetocarModeTabs({ mode, onModeChange, disabled = false }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Modo de edição"
      style={{
        display:      'flex',
        gap:          4,
        padding:      3,
        background:   'var(--color-surface)',
        borderRadius: 10,
        border:       '0.5px solid var(--color-border)',
      }}
    >
      {MODE_ORDER.map(m => {
        const meta   = EDIT_MODE_LABELS[m]
        const active = m === mode
        return (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`retocar-panel-${m}`}
            title={meta.description}
            disabled={disabled}
            onClick={() => onModeChange(m)}
            style={{
              flex:           1,
              display:        'inline-flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            6,
              padding:        '8px 10px',
              border:         'none',
              borderRadius:   7,
              background:     active ? 'var(--color-bg-elevated)' : 'transparent',
              color:          active
                ? 'var(--color-text-primary)'
                : disabled
                  ? 'var(--color-text-quaternary)'
                  : 'var(--color-text-secondary)',
              fontSize:       12,
              fontWeight:     active ? 500 : 400,
              letterSpacing:  '-0.005em',
              cursor:         disabled ? 'default' : 'pointer',
              boxShadow:      active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
              transition:     'background 0.15s, color 0.15s, box-shadow 0.15s',
              fontFamily:     'inherit',
              opacity:        disabled && !active ? 0.5 : 1,
            }}
          >
            <ModeIcon mode={m} />
            <span>{meta.label}</span>
          </button>
        )
      })}
    </div>
  )
}
