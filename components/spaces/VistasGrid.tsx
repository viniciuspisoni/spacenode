'use client'

import { useMemo, useState } from 'react'
import type { Vista, Axis } from '@/lib/spaces/types'
import { AXIS_LABEL } from '@/lib/spaces/axes'
import { VistaCard } from './VistaCard'

type Filter = 'all' | 'favorited' | Axis

// Ordem dos filtros de eixo no MVP. Clima (horario) fica fora — só apareceria
// se houvesse vistas legadas desse eixo (não há). Cada chip de eixo só é exibido
// quando há vistas dele, pra não poluir a galeria com filtros vazios.
const AXIS_FILTER_ORDER: Axis[] = ['iluminacao', 'angulo', 'detalhe', 'horario']

interface Props {
  vistas:           Vista[]
  vistaMestreUrl?:  string | null
}

export function VistasGrid({ vistas, vistaMestreUrl }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  const filters = useMemo<{ id: Filter; label: string }[]>(() => {
    const axisFilters = AXIS_FILTER_ORDER
      .filter(a => vistas.some(v => v.axis === a))
      .map(a => ({ id: a as Filter, label: AXIS_LABEL[a] }))
    return [
      { id: 'all',       label: 'Todas' },
      { id: 'favorited', label: 'Favoritas' },
      ...axisFilters,
    ]
  }, [vistas])

  const filtered = useMemo(() => {
    if (filter === 'all')       return vistas
    if (filter === 'favorited') return vistas.filter(v => v.is_favorited)
    return vistas.filter(v => v.axis === filter)
  }, [vistas, filter])

  if (vistas.length === 0) {
    return (
      <div style={{
        padding: '60px 24px', textAlign: 'center',
        background: 'var(--color-bg-elevated)',
        border: '0.5px dashed var(--color-border-strong)',
        borderRadius: 14,
      }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)',
          marginBottom: 6, letterSpacing: '-0.01em',
        }}>
          Nenhuma variação ainda
        </div>
        <div style={{
          fontSize: 12, color: 'var(--color-text-tertiary)',
          maxWidth: 400, margin: '0 auto', lineHeight: 1.6,
        }}>
          Selecione uma variação no painel acima e clique em Gerar.
          O DNA do projeto será preservado em cada variação.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Filter pills */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap',
      }}>
        {filters.map(f => {
          const active = f.id === filter
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`spn-pill ${active ? 'spn-pill--active' : ''}`}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 11,
                fontWeight: active ? 500 : 400,
                background: active ? 'var(--color-text-primary)' : 'transparent',
                color: active ? 'var(--color-bg)' : 'var(--color-text-tertiary)',
                border: active
                  ? '0.5px solid var(--color-text-primary)'
                  : '0.5px solid var(--color-border-strong)',
                letterSpacing: '-0.005em',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 && !(filter === 'angulo' && vistaMestreUrl) ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          color: 'var(--color-text-tertiary)', fontSize: 12,
        }}>
          Nada nesse filtro.
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 14,
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}>
          {/* Vista Mestre como primeiro card só na aba Ângulo */}
          {filter === 'angulo' && vistaMestreUrl && (
            <MestreCard vistaMestreUrl={vistaMestreUrl} />
          )}
          {filtered.map(v => <VistaCard key={v.id} vista={v} />)}
        </div>
      )}
    </div>
  )
}

function MestreCard({ vistaMestreUrl }: { vistaMestreUrl: string }) {
  return (
    <a
      href={vistaMestreUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg-elevated)',
        border: '0.5px solid rgba(70,209,145,0.45)',
        borderRadius: 12, overflow: 'hidden',
        textDecoration: 'none', color: 'inherit',
        transition: 'border-color 0.2s, transform 0.2s',
        position: 'relative',
      }}
    >
      <div style={{ aspectRatio: '4 / 3', position: 'relative', background: 'var(--color-surface)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={vistaMestreUrl} alt="Vista Mestre"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{
          position: 'absolute', top: 8, left: 8,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', borderRadius: 5,
          background: 'rgba(29,158,117,0.85)', backdropFilter: 'blur(8px)',
          fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#fff',
        }}>
          original
        </div>
      </div>
      <div style={{ padding: '10px 12px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.01em',
        }}>
          Vista Mestre
        </div>
        <div style={{
          fontSize: 10, color: 'var(--color-text-quaternary)', letterSpacing: '0.02em',
        }}>
          ângulo de origem
        </div>
      </div>
    </a>
  )
}
