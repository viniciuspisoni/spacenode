'use client'

// Tabs horizontais de ação do modo Editar do Spacenode.
//
// O usuário escolhe uma intenção arquitetônica (Remover / Trocar material /
// Substituir / Adicionar / Corrigir detalhes / Iluminação / Paisagismo); o
// router em lib/spaces/engines/router.ts decide o engine real por trás. A
// escolha do engine é invisível por design.
//
// Layout: grid responsivo. Em viewports largos, 7 colunas; em viewports
// menores, quebra naturalmente em múltiplas linhas. Em mobile vira scroll
// horizontal com snap.
//
// Compartilhado por RetocarStandaloneFlow e RetocarOverlay.

import type { EditMode } from '@/lib/spaces/engines'
import { EDIT_MODE_LABELS } from '@/lib/spaces/engines'

interface Props {
  mode:         EditMode
  onModeChange: (mode: EditMode) => void
  /** Disable changes while a request is in flight. */
  disabled?:    boolean
}

// Ordem intencional: ações destrutivas → transformativas → construtivas →
// de refino → de ambientação.
const MODE_ORDER: EditMode[] = [
  'remove',
  'material',
  'replace',
  'add',
  'fix',
  'lighting',
  'landscape',
]

function ModeIcon({ mode }: { mode: EditMode }) {
  const p = {
    width:  '18',
    height: '18',
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
        <svg {...p}>
          <path d="M3 6h18" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      )
    case 'material':
      return (
        <svg {...p}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M14 14h7v7h-7z" />
          <path d="M14 17.5h7M17.5 14v7" opacity="0.4" />
        </svg>
      )
    case 'replace':
      return (
        <svg {...p}>
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      )
    case 'add':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8"  y1="12" x2="16" y2="12" />
        </svg>
      )
    case 'fix':
      // Magic wand / sparkles — refinement
      return (
        <svg {...p}>
          <path d="M15 4V2M15 10V8M19 6h2M11 6h2" />
          <path d="M17.5 4.5l1.4-1.4M12.6 9.4l-1.4 1.4M17.5 7.5l1.4 1.4M12.6 4.6l-1.4-1.4" />
          <path d="M4 20l9-9 3 3-9 9H4v-3z" />
        </svg>
      )
    case 'lighting':
      // Sun / light source
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )
    case 'landscape':
      // Foliage / tree
      return (
        <svg {...p}>
          <path d="M12 2c-2 3-4 5-4 8a4 4 0 0 0 8 0c0-3-2-5-4-8z" />
          <path d="M5 13c-1 1.5-2 3-2 4.5A3.5 3.5 0 0 0 6.5 21h11A3.5 3.5 0 0 0 21 17.5c0-1.5-1-3-2-4.5" />
          <line x1="12" y1="14" x2="12" y2="22" />
        </svg>
      )
  }
}

export function RetocarModeTabs({ mode, onModeChange, disabled = false }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Modo de edição"
      className="spn-retocar-tabs"
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
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            6,
              padding:        '10px 6px',
              minWidth:       0,
              border:         'none',
              borderRadius:   9,
              background:     active ? 'var(--color-bg-elevated)' : 'transparent',
              color:          active
                ? 'var(--color-text-primary)'
                : disabled
                  ? 'var(--color-text-quaternary)'
                  : 'var(--color-text-secondary)',
              fontSize:       11,
              fontWeight:     active ? 500 : 400,
              letterSpacing:  '-0.005em',
              cursor:         disabled ? 'default' : 'pointer',
              boxShadow:      active
                ? 'inset 0 0 0 0.5px var(--color-border-strong), 0 1px 2px rgba(0,0,0,0.25)'
                : 'none',
              transition:     'background 0.15s, color 0.15s, box-shadow 0.15s',
              fontFamily:     'inherit',
              opacity:        disabled && !active ? 0.5 : 1,
              scrollSnapAlign: 'start',
              textAlign:      'center',
              whiteSpace:     'nowrap',
              overflow:       'hidden',
              textOverflow:   'ellipsis',
            }}
          >
            <ModeIcon mode={m} />
            <span style={{
              overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: '100%', display: 'block',
            }}>
              {meta.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
