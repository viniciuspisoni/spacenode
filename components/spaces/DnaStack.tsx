'use client'

import type { ProjectDNA, DnaOverrides, DnaTrait } from '@/lib/spaces/types'

// ── Trait metadata ────────────────────────────────────────────────────────────

interface TraitMeta {
  key:     DnaTrait
  label:   string
  summary: (dna: ProjectDNA) => string
}

const TRAITS: TraitMeta[] = [
  {
    key:     'style',
    label:   'Estilo',
    summary: d => d.style,
  },
  {
    key:     'materials',
    label:   'Materiais',
    summary: d => d.materials,
  },
  {
    key:     'palette',
    label:   'Paleta',
    summary: d => Array.isArray(d.palette) ? d.palette.join('  ') : String(d.palette),
  },
  {
    key:     'context',
    label:   'Contexto',
    summary: d => d.context,
  },
  {
    key:     'lighting',
    label:   'Iluminação',
    summary: d => d.lighting,
  },
]

// ── Lock / Unlock icons ───────────────────────────────────────────────────────

function LockClosedIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

function LockOpenIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
    </svg>
  )
}

// ── DnaStack ──────────────────────────────────────────────────────────────────

interface DnaStackProps {
  dna:      ProjectDNA
  overrides: DnaOverrides
  onChange:  (next: DnaOverrides) => void
}

export function DnaStack({ dna, overrides, onChange }: DnaStackProps) {
  function toggle(trait: DnaTrait) {
    onChange({
      ...overrides,
      [trait]: { ...overrides[trait], locked: !overrides[trait].locked },
    })
  }

  const lockedCount   = TRAITS.filter(t => overrides[t.key].locked).length
  const unlockedCount = TRAITS.length - lockedCount

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{
          fontSize: 9, fontWeight: 500,
          letterSpacing: '0.2em', textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.28)',
        }}>
          Project DNA
        </div>
        <div style={{
          fontSize: 10, color: 'rgba(255,255,255,0.3)',
          letterSpacing: '-0.005em',
        }}>
          {lockedCount} travados{unlockedCount > 0 ? ` · ${unlockedCount} liberados` : ''}
        </div>
      </div>

      {/* Chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {TRAITS.map(({ key, label, summary }) => {
          const isLocked  = overrides[key].locked
          const summaryTx = summary(dna)

          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              style={{
                display:      'flex', alignItems: 'center', gap: 10,
                background:   isLocked ? 'rgba(48,180,108,0.06)' : 'rgba(255,255,255,0.025)',
                border:       `0.5px solid ${isLocked ? 'rgba(48,180,108,0.22)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 7,
                padding:      '8px 10px',
                cursor:       'pointer',
                fontFamily:   'inherit',
                textAlign:    'left' as const,
                transition:   'all 0.15s',
                width:        '100%',
              }}
            >
              {/* Icon */}
              <div style={{
                flexShrink: 0,
                color: isLocked ? '#30b46c' : 'rgba(255,255,255,0.22)',
              }}>
                {isLocked ? <LockClosedIcon /> : <LockOpenIcon />}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11, fontWeight: 500,
                  color: isLocked ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.32)',
                  letterSpacing: '-0.005em',
                  marginBottom: summaryTx ? 2 : 0,
                }}>
                  {label}
                </div>
                {summaryTx && (
                  <div style={{
                    fontSize: 9.5,
                    color: isLocked ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)',
                    letterSpacing: '-0.003em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                  }}>
                    {summaryTx}
                  </div>
                )}
              </div>

              {/* Badge */}
              <div style={{
                fontSize: 9, fontWeight: 500,
                color:   isLocked ? '#30b46c' : 'rgba(255,255,255,0.22)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
                flexShrink: 0,
              }}>
                {isLocked ? 'trav.' : 'livre'}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
