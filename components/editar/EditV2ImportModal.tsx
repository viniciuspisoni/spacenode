'use client'

// EditV2ImportModal — importar imagem do histórico para o novo Editar.
//
// Fontes (independente do provider que gerou a imagem — FAL antiga, Google
// nova, upload: para o usuário é só uma imagem do projeto):
//   Renders → GET /api/renders/list (coluna real: OUTPUT_URL — a tabela
//             renders não tem image_url; lição do bug 2026-06-12)
//   Vistas  → consulta RLS client-side (não existe API de listagem; mesmo
//             padrão comprovado do modal v1)
//   Edições → GET /api/edits (result_image_url)
//
// Mapeamento de URL é TOLERANTE (output_url ?? image_url ?? result_image_url
// ?? result_url ?? public_url) — nunca filtramos por provider/modelo/CDN.

import { useEffect, useState } from 'react'
import { toMediaProxyUrl } from '@/lib/storage/media-url'
import { createClient } from '@/lib/supabase/client'

type Tab = 'renders' | 'vistas' | 'edits'

interface Item {
  id: string
  url: string
  label: string
  createdAt: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (url: string) => void
  /** Inclui resultados do Ampliar na aba Renders (útil quando o destino é
   *  vídeo/composição, onde a versão ampliada é a melhor base). Default off —
   *  no Editar a imagem ampliada não é base de edição. */
  includeUpscales?: boolean
}

/** Primeira URL plausível entre os nomes de coluna usados pelas superfícies
 *  do produto, em ordem de prevalência. */
function pickUrl(row: Record<string, unknown>): string | null {
  for (const key of ['output_url', 'image_url', 'result_image_url', 'result_url', 'public_url']) {
    const v = row[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

const EMPTY_COPY: Record<Tab, string> = {
  renders: 'Nenhum render concluído ainda. Gere uma imagem no Renderizar — ou envie um arquivo.',
  vistas: 'Nenhuma vista gerada em projetos ainda.',
  edits: 'Nenhuma edição anterior ainda.',
}

export function EditV2ImportModal({ open, onClose, onSelect, includeUpscales }: Props) {
  const [tab, setTab] = useState<Tab>('renders')
  const [items, setItems] = useState<Record<Tab, Item[] | null>>({
    renders: null,
    vistas: null,
    edits: null,
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || items[tab] !== null) return
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
        let list: Item[] = []

        if (tab === 'renders') {
          const res = await fetch(`/api/renders/list?cursor=${encodeURIComponent(new Date().toISOString())}`)
          const json = await res.json()
          if (!res.ok) throw new Error(json?.error)
          list = (json.renders ?? [])
            // vídeos também moram em renders — nunca são base de imagem.
            // upscales entram só quando o chamador pede (includeUpscales).
            .filter((r: { ambient?: string | null }) =>
              r.ambient !== 'video' && (includeUpscales || r.ambient !== 'upscale'))
            .map((r: Record<string, unknown>) => ({
              id: String(r.id),
              url: pickUrl(r),
              label: r.ambient === 'upscale' ? 'Ampliada' : String(r.ambient ?? r.style ?? 'Render'),
              createdAt: String(r.created_at ?? ''),
            }))
            .filter((i: Item & { url: string | null }): i is Item => Boolean(i.url))
        } else if (tab === 'vistas') {
          // Sem API de listagem de vistas — consulta RLS direta (padrão do v1).
          const sb = createClient()
          const { data, error: qErr } = await sb
            .from('vistas')
            .select('id, image_url, axis_label, created_at')
            .eq('status', 'completed')
            .not('image_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(60)
          if (qErr) throw qErr
          list = (data ?? [])
            .map(v => ({
              id: String(v.id),
              url: pickUrl(v as Record<string, unknown>),
              label: String(v.axis_label ?? 'Vista'),
              createdAt: String(v.created_at ?? ''),
            }))
            .filter((i): i is Item => Boolean(i.url))
        } else {
          const res = await fetch('/api/edits')
          const json = await res.json()
          if (!res.ok) throw new Error(json?.error)
          list = (json.edits ?? [])
            .map((e: Record<string, unknown>) => ({
              id: String(e.id),
              url: pickUrl(e),
              label: typeof e.prompt === 'string' && e.prompt ? e.prompt.slice(0, 40) : 'Edição',
              createdAt: String(e.created_at ?? ''),
            }))
            .filter((i: Item & { url: string | null }): i is Item => Boolean(i.url))
        }

        if (!cancelled) setItems(prev => ({ ...prev, [tab]: list }))
      } catch {
        if (!cancelled) setError('Não foi possível carregar o histórico.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, tab, items, includeUpscales])

  if (!open) return null
  const current = items[tab]

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'transparent'}`,
    background: active ? 'var(--color-surface-hover)' : 'transparent',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    cursor: 'pointer',
  })

  const count = (t: Tab) => (items[t] !== null ? ` (${items[t]!.length})` : '')

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(880px, 100%)',
          maxHeight: '78vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border-strong)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 18px',
            borderBottom: '0.5px solid var(--color-border)',
          }}
        >
          <span style={{ fontSize: 14.5, fontWeight: 600, marginRight: 10 }}>Importar do histórico</span>
          <button type="button" style={tabBtn(tab === 'renders')} onClick={() => setTab('renders')}>
            Renders{count('renders')}
          </button>
          <button type="button" style={tabBtn(tab === 'vistas')} onClick={() => setTab('vistas')}>
            Vistas{count('vistas')}
          </button>
          <button type="button" style={tabBtn(tab === 'edits')} onClick={() => setTab('edits')}>
            Edições{count('edits')}
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 13,
              color: 'var(--color-text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: 16 }}>
          {error && (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: 24, textAlign: 'center' }}>
              {error}
            </div>
          )}
          {!error && current === null && (
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', padding: 24, textAlign: 'center' }}>
              Carregando…
            </div>
          )}
          {!error && current !== null && current.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', padding: 24, textAlign: 'center' }}>
              {EMPTY_COPY[tab]}
            </div>
          )}
          {!error && current && current.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: 10,
              }}
            >
              {current.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.url)}
                  title={`${item.label} · ${item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : ''}`}
                  style={{
                    position: 'relative',
                    aspectRatio: '4 / 3',
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: '0.5px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={toMediaProxyUrl(item.url) ?? item.url}
                    alt=""
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
