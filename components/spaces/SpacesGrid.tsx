'use client'

import { useState, useMemo } from 'react'
import { SpaceCard, NewSpaceCard } from './SpaceCard'
import { SpaceFilters, type FilterValue } from './SpaceFilters'
import type { Space } from '@/lib/spaces/types'

interface SpaceWithAnchor extends Space {
  anchor_url?: string | null
}

interface SpacesGridProps {
  spaces: SpaceWithAnchor[]
}

export function SpacesGrid({ spaces }: SpacesGridProps) {
  const [filter, setFilter] = useState<FilterValue>('all')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => ({
    all:         spaces.length,
    residencial: spaces.filter(s => s.category === 'residencial').length,
    comercial:   spaces.filter(s => s.category === 'comercial').length,
    conceito:    spaces.filter(s => s.category === 'conceito').length,
  }), [spaces])

  const filtered = useMemo(() => {
    let result = filter === 'all' ? spaces : spaces.filter(s => s.category === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(s => s.name.toLowerCase().includes(q))
    }
    return result
  }, [spaces, filter, search])

  return (
    <>
      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
        <SpaceFilters value={filter} onChange={setFilter} counts={counts} />

        {/* Search */}
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <svg
            style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: 'rgba(255,255,255,0.32)',
            }}
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.5" y2="16.5"/>
          </svg>
          <input
            type="text"
            placeholder="buscar Space..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: '#111111',
              border: '0.5px solid rgba(255,255,255,0.08)',
              borderRadius: 999,
              padding: '6px 14px 6px 30px',
              fontSize: 11,
              color: 'rgba(255,255,255,0.62)',
              width: 220,
              height: 30,
              fontFamily: 'inherit',
              boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.04)',
              outline: 'none',
              letterSpacing: '-0.005em',
            }}
          />
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 && search ? (
        <div style={{
          padding: '48px 20px', textAlign: 'center',
          background: '#111111',
          border: '0.5px dashed rgba(255,255,255,0.12)',
          borderRadius: 14,
        }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', marginBottom: 6 }}>
            Nenhum Space encontrado para &ldquo;{search}&rdquo;
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 18,
        }}>
          {filtered.map(space => (
            <SpaceCard key={space.id} space={space} />
          ))}
          <NewSpaceCard />
        </div>
      )}
    </>
  )
}
