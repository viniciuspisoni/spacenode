'use client'

// Modal "Importar do histórico" da Retocar.
// 3 abas: Renders, Vistas, Edições. Cada uma carrega da API correspondente
// e mostra grid simples. Click numa imagem dispara onPick com (url, source_type, source_id).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toMediaProxyUrl } from '@/lib/storage/media-url'
import type { EditSourceType, Edit, Vista } from '@/lib/spaces/types'
import { Sheet, Segmented } from '@/components/app/glass'

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
    <Sheet open title={title ?? 'Importar do histórico'} onClose={onClose} doneLabel="Fechar">
      {/* A contagem entra no rótulo do segmentado: é o polegar que mede a
          largura de cada célula, então rótulos de tamanhos diferentes são o
          caso normal, não uma exceção a evitar. */}
      <div className="spn-field">
        <Segmented
          label="Origem da imagem"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'renders', label: renders ? `Renders (${renders.length})` : 'Renders' },
            { value: 'vistas',  label: vistas  ? `Vistas (${vistas.length})`   : 'Vistas' },
            { value: 'edits',   label: edits   ? `Edições (${edits.length})`   : 'Edições' },
          ]}
        />
      </div>

      {loading && <div className="spn-empty">carregando…</div>}

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
          empty="Sem vistas geradas em projetos ainda."
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
    </Sheet>
  )
}

function GalleryGrid({ items, empty, onPick }: {
  items: { id: string; url: string; label: string; date: string }[]
  empty: string
  onPick: (item: { id: string; url: string; label: string; date: string }) => void
}) {
  if (items.length === 0) return <div className="spn-empty">{empty}</div>

  return (
    <div className="spn-choices" style={{
      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    }}>
      {items.map(it => (
        <button
          key={it.id}
          type="button"
          className="spn-choice"
          onClick={() => onPick(it)}
          style={{ padding: 0, overflow: 'hidden', textAlign: 'left' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={toMediaProxyUrl(it.url) ?? it.url} alt={it.label} className="spn-card-thumb" />
          <b style={{
            display: 'block', padding: '8px 10px', fontSize: 11,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {it.label}
          </b>
        </button>
      ))}
    </div>
  )
}
