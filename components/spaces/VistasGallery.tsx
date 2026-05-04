'use client'

import { useState, useMemo } from 'react'
import type { Vista, VistaType } from '@/lib/spaces/types'
import { VistaTabs, type VistaFilter, type VistaTabType } from './VistaTabs'
import { VistaCard } from './VistaCard'
import { ViewSegment, useViewMode } from './ViewSegment'

// ── VistasGallery ─────────────────────────────────────────────────────────────

interface VistasGalleryProps {
  vistas:      Vista[]        // non-mestre completed vistas
  spaceId:     string
  anchor:      Vista | null   // Vista Mestre
  onEvolve:    (vista: Vista) => void
  onCardClick: (vista: Vista) => void
}

const VISTA_TYPE_LABEL: Partial<Record<VistaType, string>> = {
  mestre:     'Vista Mestre',
  iluminacao: 'Iluminação',
  material:   'Material',
  angulo:     'Ângulo',
  detalhe:    'Detalhe',
  interior:   'Interior',
}

// ── Lineage grouping ──────────────────────────────────────────────────────────

interface LineageGroup {
  parentId:    string | null
  parentLabel: string
  items:       Vista[]
  isAnchor:    boolean
}

function groupByLineage(vistas: Vista[], anchor: Vista | null): LineageGroup[] {
  const map = new Map<string | null, Vista[]>()
  for (const v of vistas) {
    const pid = v.parent_render_id
    if (!map.has(pid)) map.set(pid, [])
    map.get(pid)!.push(v)
  }

  const groups: LineageGroup[] = []
  for (const [parentId, items] of map) {
    const isAnchor    = parentId === anchor?.id
    const parentVista = isAnchor
      ? anchor
      : (vistas.find(v => v.id === parentId) ?? null)
    const parentLabel = parentVista
      ? (VISTA_TYPE_LABEL[parentVista.vista_type] === 'Vista Mestre'
          ? 'Vista Mestre'
          : (parentVista.vista_label ?? VISTA_TYPE_LABEL[parentVista.vista_type] ?? parentId ?? '—'))
      : (parentId ?? 'Sem pai')
    groups.push({ parentId, parentLabel, items, isAnchor })
  }

  // Anchor group first, then alphabetical by parent label
  groups.sort((a, b) => {
    if (a.isAnchor && !b.isAnchor) return -1
    if (!a.isAnchor && b.isAnchor) return 1
    return a.parentLabel.localeCompare(b.parentLabel, 'pt')
  })

  return groups
}

// ── VistasGallery ─────────────────────────────────────────────────────────────

export function VistasGallery({ vistas, spaceId, anchor, onEvolve, onCardClick }: VistasGalleryProps) {
  const [filter, setFilter]      = useState<VistaFilter>('all')
  const [viewMode, setViewMode]  = useViewMode(spaceId)

  // Count per tab type (for intention view)
  const counts = useMemo<Record<VistaFilter, number>>(() => {
    const base: Record<VistaFilter, number> = {
      all:        vistas.length,
      iluminacao: 0,
      material:   0,
      angulo:     0,
      detalhe:    0,
      interior:   0,
    }
    for (const v of vistas) {
      const t = v.vista_type as VistaTabType
      if (t in base) base[t]++
    }
    return base
  }, [vistas])

  // Intention: filtered by type
  const intentionVistas = useMemo(
    () => filter === 'all' ? vistas : vistas.filter(v => v.vista_type === filter),
    [vistas, filter],
  )

  // Chronological: sorted desc
  const chronologicalVistas = useMemo(
    () => [...vistas].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    [vistas],
  )

  // Lineage groups
  const lineageGroups = useMemo(
    () => groupByLineage(vistas, anchor),
    [vistas, anchor],
  )

  const GRID = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
  } as const

  return (
    <div>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 16,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 500,
          letterSpacing: '0.24em', textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.32)',
        }}>
          Vistas
        </span>
        <span style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
        <span style={{
          fontSize: 10, color: 'rgba(255,255,255,0.28)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.005em',
        }}>
          {vistas.length} {vistas.length === 1 ? 'vista' : 'vistas'}
        </span>
      </div>

      {vistas.length === 0 ? (
        /* ── Empty state ── */
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '64px 24px', textAlign: 'center',
          background: '#111111',
          border: '0.5px dashed rgba(255,255,255,0.1)',
          borderRadius: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(48,180,108,0.06)',
            border: '0.5px solid rgba(48,180,108,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18, color: 'rgba(48,180,108,0.6)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>

          <div style={{
            fontSize: 14, fontWeight: 500,
            color: '#fafafa', marginBottom: 6,
            letterSpacing: '-0.02em',
          }}>
            Comece evoluindo sua Vista Mestre.
          </div>
          <div style={{
            fontSize: 12, color: 'rgba(255,255,255,0.38)',
            lineHeight: 1.6, maxWidth: 340,
            letterSpacing: '-0.005em',
          }}>
            Crie sua primeira evolução para testar iluminação, materiais, ângulos ou detalhes mantendo o DNA do projeto.
          </div>
        </div>
      ) : (
        /* ── Gallery ── */
        <>
          {/* ViewSegment toggle */}
          <div style={{ marginBottom: 16 }}>
            <ViewSegment value={viewMode} onChange={setViewMode} />
          </div>

          {/* ── Por intenção ── */}
          {viewMode === 'intention' && (
            <>
              <VistaTabs value={filter} onChange={setFilter} counts={counts} />
              <div style={GRID}>
                {intentionVistas.map(vista => (
                  <VistaCard
                    key={vista.id}
                    vista={vista}
                    onEvolve={onEvolve}
                    onClick={onCardClick}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── Por linhagem ── */}
          {viewMode === 'lineage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {lineageGroups.map(group => (
                <div key={group.parentId ?? 'null'}>
                  {/* Group header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 14,
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: group.isAnchor ? '#30b46c' : 'rgba(255,255,255,0.3)',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 10.5, fontWeight: 500,
                      color: group.isAnchor ? 'rgba(48,180,108,0.9)' : 'rgba(255,255,255,0.42)',
                      letterSpacing: '-0.005em',
                    }}>
                      Filhos de {group.parentLabel}
                    </span>
                    <span style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
                    <span style={{
                      fontSize: 9.5, color: 'rgba(255,255,255,0.22)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {group.items.length}
                    </span>
                  </div>
                  {/* Cards */}
                  <div style={GRID}>
                    {group.items.map(vista => (
                      <VistaCard
                        key={vista.id}
                        vista={vista}
                        onEvolve={onEvolve}
                        onClick={onCardClick}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Cronológica ── */}
          {viewMode === 'chronological' && (
            <div style={GRID}>
              {chronologicalVistas.map(vista => (
                <VistaCard
                  key={vista.id}
                  vista={vista}
                  onEvolve={onEvolve}
                  onClick={onCardClick}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
