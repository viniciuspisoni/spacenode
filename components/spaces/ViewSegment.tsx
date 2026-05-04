'use client'

import { useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ViewMode = 'intention' | 'lineage' | 'chronological'

// ── ViewSegment ───────────────────────────────────────────────────────────────

interface ViewSegmentProps {
  value:    ViewMode
  onChange: (mode: ViewMode) => void
}

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'intention',     label: 'Por intenção'  },
  { mode: 'lineage',       label: 'Por linhagem'  },
  { mode: 'chronological', label: 'Cronológica'   },
]

export function ViewSegment({ value, onChange }: ViewSegmentProps) {
  return (
    <div style={{
      display:    'flex',
      background: 'rgba(255,255,255,0.04)',
      border:     '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      padding:    3,
      gap:        2,
    }}>
      {OPTIONS.map(opt => {
        const isActive = opt.mode === value
        return (
          <button
            key={opt.mode}
            onClick={() => onChange(opt.mode)}
            style={{
              flex:         1,
              padding:      '5px 10px',
              background:   isActive ? 'rgba(255,255,255,0.09)' : 'transparent',
              border:       `0.5px solid ${isActive ? 'rgba(255,255,255,0.14)' : 'transparent'}`,
              borderRadius: 6,
              color:        isActive ? '#fafafa' : 'rgba(255,255,255,0.36)',
              fontSize:     10.5,
              fontWeight:   isActive ? 500 : 400,
              fontFamily:   'inherit',
              cursor:       'pointer',
              letterSpacing: '-0.005em',
              transition:   'all 0.15s',
              whiteSpace:   'nowrap' as const,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── useViewMode ───────────────────────────────────────────────────────────────
// Persists view mode per spaceId in localStorage.
// Initialises to 'intention' on SSR, reads localStorage on first client render.

export function useViewMode(spaceId: string): [ViewMode, (mode: ViewMode) => void] {
  const key = `spaces.viewMode.${spaceId}`
  const [mode, setMode] = useState<ViewMode>('intention')

  // Hydrate from localStorage on client mount only
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored === 'intention' || stored === 'lineage' || stored === 'chronological') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMode(stored as ViewMode)
      }
    } catch { /* SSR or privacy mode */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // intentionally run once — `key` is stable per spaceId

  function handleChange(next: ViewMode) {
    setMode(next)
    try { localStorage.setItem(key, next) } catch { /* ignore */ }
  }

  return [mode, handleChange]
}
