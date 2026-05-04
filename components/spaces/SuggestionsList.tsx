'use client'

import type { Suggestion, SuggestionPreset } from '@/lib/spaces/types'

// ── Preset icons ──────────────────────────────────────────────────────────────

function PresetIcon({ preset }: { preset: SuggestionPreset }) {
  switch (preset) {
    case 'lighting_change':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <line x1="12" y1="2"  x2="12" y2="5"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="4.22" y1="4.22"  x2="6.34" y2="6.34"/>
          <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
          <line x1="2" y1="12"  x2="5" y2="12"/>
          <line x1="19" y1="12" x2="22" y2="12"/>
          <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/>
          <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
        </svg>
      )
    case 'aerial_drone':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="17 11 12 6 7 11"/>
          <line x1="12" y1="6" x2="12" y2="18"/>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1"/>
        </svg>
      )
    case 'hero_diagonal':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      )
    case 'detail_close':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <line x1="11" y1="8" x2="11" y2="14"/>
          <line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      )
    case 'interior':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      )
    case 'material_change':
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="4" rx="1"/>
          <rect x="2" y="10" width="20" height="4" rx="1"/>
          <rect x="2" y="17" width="20" height="4" rx="1"/>
        </svg>
      )
  }
}

// ── SuggestionsList ───────────────────────────────────────────────────────────

interface SuggestionsListProps {
  suggestions:     Suggestion[]
  selectedIndex:   number | null
  onSelect:        (suggestion: Suggestion, index: number) => void
  loading:         boolean
}

function SuggestionSkeleton() {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '9px 12px',
      background: 'rgba(255,255,255,0.03)',
      border: '0.5px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
      animation: 'skeleton-pulse 1.4s ease-in-out infinite',
    }}>
      <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: '60%', height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 6 }} />
        <div style={{ width: '90%', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
      </div>
    </div>
  )
}

export function SuggestionsList({
  suggestions,
  selectedIndex,
  onSelect,
  loading,
}: SuggestionsListProps) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[0, 1].map(i => <SuggestionSkeleton key={i} />)}
        <style>{`
          @keyframes skeleton-pulse {
            0%, 100% { opacity: 1 }
            50%       { opacity: 0.5 }
          }
        `}</style>
      </div>
    )
  }

  if (suggestions.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {suggestions.map((s, i) => {
        const isSelected = selectedIndex === i
        const hasParent  = !!s.parent_id

        return (
          <button
            key={i}
            onClick={() => onSelect(s, i)}
            style={{
              display:      'flex', alignItems: 'flex-start', gap: 10,
              padding:      '9px 12px',
              background:   isSelected ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.025)',
              border:       `0.5px solid ${isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 8,
              cursor:       'pointer',
              textAlign:    'left' as const,
              fontFamily:   'inherit',
              transition:   'all 0.15s',
              width:        '100%',
            }}
          >
            {/* Icon bubble */}
            <div style={{
              width:      28, height: 28, borderRadius: 7, flexShrink: 0,
              background: isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
              border:     `0.5px solid ${isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
              display:    'flex', alignItems: 'center', justifyContent: 'center',
              color:      isSelected ? '#fafafa' : 'rgba(255,255,255,0.45)',
            }}>
              <PresetIcon preset={s.preset} />
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
              }}>
                <span style={{
                  fontSize:      12, fontWeight: 500,
                  color:         isSelected ? '#fafafa' : 'rgba(255,255,255,0.72)',
                  letterSpacing: '-0.01em',
                }}>
                  {s.label}
                </span>
                {hasParent && (
                  <span style={{
                    fontSize:      9, fontWeight: 500,
                    color:         'rgba(255,255,255,0.3)',
                    background:    'rgba(255,255,255,0.06)',
                    border:        '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius:  3, padding: '1px 5px',
                    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                    flexShrink:    0,
                  }}>
                    cont.
                  </span>
                )}
              </div>
              <p style={{
                margin:        0,
                fontSize:      10.5, color: 'rgba(255,255,255,0.35)',
                lineHeight:    1.45, letterSpacing: '-0.003em',
              }}>
                {s.reason}
              </p>
            </div>

            {/* Arrow */}
            <div style={{
              color:     isSelected ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
              flexShrink: 0, marginTop: 2,
              transition: 'color 0.15s',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </div>
          </button>
        )
      })}
    </div>
  )
}
