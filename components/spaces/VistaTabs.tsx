'use client'

import type { VistaType } from '@/lib/spaces/types'

// ── Types ─────────────────────────────────────────────────────────────────────

// Excludes 'mestre' — that's the Anchor, shown separately
export type VistaTabType = Exclude<VistaType, 'mestre'>
export type VistaFilter = 'all' | VistaTabType

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS: { value: VistaFilter; label: string }[] = [
  { value: 'all',        label: 'Todas'      },
  { value: 'iluminacao', label: 'Iluminação' },
  { value: 'material',   label: 'Material'   },
  { value: 'angulo',     label: 'Ângulo'     },
  { value: 'detalhe',    label: 'Detalhe'    },
  { value: 'interior',   label: 'Interior'   },
]

// ── VistaTabs ─────────────────────────────────────────────────────────────────

interface VistaTabsProps {
  value: VistaFilter
  onChange: (v: VistaFilter) => void
  counts: Record<VistaFilter, number>
}

export function VistaTabs({ value, onChange, counts }: VistaTabsProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
      {TABS.map(tab => {
        const active = tab.value === value
        const count  = counts[tab.value] ?? 0

        // Hide non-all tabs when empty
        if (tab.value !== 'all' && count === 0) return null

        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: `0.5px solid ${active ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
              fontSize: 11,
              color: active ? '#050505' : 'rgba(255,255,255,0.42)',
              background: active
                ? 'linear-gradient(180deg, #fafafa 0%, #e8e8e8 100%)'
                : 'transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '-0.005em',
              boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.4)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
            <span style={{
              marginLeft: 4,
              opacity: active ? 0.45 : 0.55,
              fontSize: 10,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
