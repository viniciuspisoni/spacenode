'use client'

import type { SpaceCategory } from '@/lib/spaces/types'

export type FilterValue = 'all' | SpaceCategory

interface SpaceFiltersProps {
  value: FilterValue
  onChange: (v: FilterValue) => void
  counts: { all: number; residencial: number; comercial: number; conceito: number }
}

const CHIPS: { value: FilterValue; label: string }[] = [
  { value: 'all',         label: 'Todos'       },
  { value: 'residencial', label: 'Residencial' },
  { value: 'comercial',   label: 'Comercial'   },
  { value: 'conceito',    label: 'Conceito'    },
]

export function SpaceFilters({ value, onChange, counts }: SpaceFiltersProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {CHIPS.map(chip => {
        const active = chip.value === value
        return (
          <button
            key={chip.value}
            onClick={() => onChange(chip.value)}
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
              transition: 'all 0.15s',
              fontFamily: 'inherit',
              letterSpacing: '-0.005em',
              boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.4)' : 'none',
            }}
          >
            {chip.label}
            <span style={{
              marginLeft: 4,
              opacity: active ? 0.45 : 0.55,
              fontSize: 10,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {counts[chip.value]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
