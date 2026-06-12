'use client'

// EditV2ImportModal — importar imagem do histórico para o novo Editar.
//
// Fontes: Renders (GET /api/renders/list) e Edições (GET /api/edits) — via
// APIs existentes, sem consultar o banco direto do client (diferença
// deliberada vs o modal v1). Seleção devolve só a URL; o fluxo decide o resto.

import { useEffect, useState } from 'react'

type Tab = 'renders' | 'edits'

interface Item {
  id: string
  url: string
  createdAt: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (url: string) => void
}

export function EditV2ImportModal({ open, onClose, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>('renders')
  const [items, setItems] = useState<Record<Tab, Item[] | null>>({ renders: null, edits: null })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || items[tab] !== null) return
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
        if (tab === 'renders') {
          const res = await fetch(`/api/renders/list?cursor=${encodeURIComponent(new Date().toISOString())}`)
          const json = await res.json()
          if (!res.ok) throw new Error(json?.error)
          const list: Item[] = (json.renders ?? [])
            .filter((r: { image_url?: string }) => typeof r.image_url === 'string' && r.image_url)
            .map((r: { id: string; image_url: string; created_at: string }) => ({
              id: r.id,
              url: r.image_url,
              createdAt: r.created_at,
            }))
          if (!cancelled) setItems(prev => ({ ...prev, renders: list }))
        } else {
          const res = await fetch('/api/edits')
          const json = await res.json()
          if (!res.ok) throw new Error(json?.error)
          const list: Item[] = (json.edits ?? [])
            .filter((e: { result_image_url?: string }) => typeof e.result_image_url === 'string' && e.result_image_url)
            .map((e: { id: string; result_image_url: string; created_at: string }) => ({
              id: e.id,
              url: e.result_image_url,
              createdAt: e.created_at,
            }))
          if (!cancelled) setItems(prev => ({ ...prev, edits: list }))
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar o histórico.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, tab, items])

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
          width: 'min(860px, 100%)',
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
            Renders
          </button>
          <button type="button" style={tabBtn(tab === 'edits')} onClick={() => setTab('edits')}>
            Edições
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
              {tab === 'renders' ? 'Nenhum render no histórico ainda.' : 'Nenhuma edição no histórico ainda.'}
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
                  title={new Date(item.createdAt).toLocaleDateString('pt-BR')}
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
                    src={item.url}
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
