'use client'

// Modal "Importar do histórico" da Retocar.
// 3 abas: Renders, Vistas, Edições. Cada uma carrega da API correspondente
// e mostra grid simples. Click numa imagem dispara onPick com (url, source_type, source_id).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { EditSourceType, Edit, Vista } from '@/lib/spaces/types'

type Tab = 'renders' | 'vistas' | 'edits'

interface RenderRow {
  id:          string
  output_url:  string | null
  ambient:     string | null
  style:       string | null
  created_at:  string
}

interface Props {
  onClose: () => void
  onPick:  (picked: { url: string; type: EditSourceType; id: string | null }) => void
  /** Título do modal (default: histórico). Reutilizado como seletor de referência. */
  title?:  string
}

export function RetocarImportModal({ onClose, onPick, title }: Props) {
  const [tab, setTab] = useState<Tab>('renders')
  const [renders, setRenders] = useState<RenderRow[] | null>(null)
  const [vistas, setVistas]   = useState<Vista[] | null>(null)
  const [edits, setEdits]     = useState<Edit[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const sb = createClient()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    Promise.all([
      sb.from('renders')
        .select('id, output_url, ambient, style, created_at')
        .eq('status', 'completed')
        .not('output_url', 'is', null)
        .neq('ambient', 'upscale')
        .neq('ambient', 'video')
        .order('created_at', { ascending: false })
        .limit(40),
      sb.from('vistas')
        .select('*')
        .eq('status', 'completed')
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(40),
      fetch('/api/edits').then(r => r.ok ? r.json() : { edits: [] }),
    ]).then(([rd, vt, ed]) => {
      setRenders((rd.data ?? []) as RenderRow[])
      setVistas((vt.data ?? []) as Vista[])
      setEdits(((ed.edits ?? []) as Edit[]))
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(10,10,10,0.78)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 920, maxHeight: '88vh',
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border-strong)',
          borderRadius: 14, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '0.5px solid var(--color-border)',
        }}>
          <h2 style={{
            fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)',
            letterSpacing: '-0.015em',
          }}>
            {title ?? 'Importar do histórico'}
          </h2>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 6, background: 'transparent',
            border: '0.5px solid var(--color-border-strong)', color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}>×</button>
        </header>

        <div style={{ padding: '12px 20px', borderBottom: '0.5px solid var(--color-border)' }}>
          <div style={{
            display: 'flex', gap: 4, padding: 4,
            background: 'var(--color-surface)', borderRadius: 10,
          }}>
            <TabBtn active={tab==='renders'} onClick={() => setTab('renders')}>
              Renders {renders ? `(${renders.length})` : ''}
            </TabBtn>
            <TabBtn active={tab==='vistas'}  onClick={() => setTab('vistas')}>
              Vistas {vistas ? `(${vistas.length})` : ''}
            </TabBtn>
            <TabBtn active={tab==='edits'}   onClick={() => setTab('edits')}>
              Edições {edits ? `(${edits.length})` : ''}
            </TabBtn>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              carregando…
            </div>
          )}

          {!loading && tab === 'renders' && (
            <GalleryGrid
              items={(renders ?? []).map(r => ({
                id:    r.id,
                url:   r.output_url ?? '',
                label: r.ambient || r.style || 'Render',
                date:  r.created_at,
              }))}
              empty="Sem renders concluídas ainda."
              onPick={(item) => onPick({ url: item.url, type: 'render', id: item.id })}
            />
          )}

          {!loading && tab === 'vistas' && (
            <GalleryGrid
              items={(vistas ?? []).filter(v => v.image_url).map(v => ({
                id:    v.id,
                url:   v.image_url!,
                label: v.axis_label ?? 'Vista',
                date:  v.created_at,
              }))}
              empty="Sem vistas geradas em Spaces ainda."
              onPick={(item) => onPick({ url: item.url, type: 'vista', id: item.id })}
            />
          )}

          {!loading && tab === 'edits' && (
            <GalleryGrid
              items={(edits ?? []).map(e => ({
                id:    e.id,
                url:   e.result_image_url,
                label: e.prompt.slice(0, 40) || 'Edição',
                date:  e.created_at,
              }))}
              empty="Sem edições anteriores ainda."
              onPick={(item) => onPick({ url: item.url, type: 'edit', id: item.id })}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '7px 12px', borderRadius: 7,
        background: active ? 'var(--color-bg-elevated)' : 'transparent',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em',
        cursor: 'pointer',
        boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

function GalleryGrid({ items, empty, onPick }: {
  items: { id: string; url: string; label: string; date: string }[]
  empty: string
  onPick: (item: { id: string; url: string; label: string; date: string }) => void
}) {
  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)', fontSize: 12 }}>
        {empty}
      </div>
    )
  }
  return (
    <div style={{
      display: 'grid', gap: 10,
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    }}>
      {items.map(it => (
        <button
          key={it.id}
          onClick={() => onPick(it)}
          style={{
            background: 'var(--color-bg)',
            border: '0.5px solid var(--color-border)',
            borderRadius: 10, overflow: 'hidden',
            padding: 0, cursor: 'pointer', textAlign: 'left',
            transition: 'transform 0.18s, border-color 0.18s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(29,158,117,0.5)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
        >
          <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.url} alt={it.label}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{
            padding: '8px 10px',
            fontSize: 11, color: 'var(--color-text-primary)',
            fontWeight: 500, letterSpacing: '-0.005em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {it.label}
          </div>
        </button>
      ))}
    </div>
  )
}
