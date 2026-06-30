'use client'

import { useEffect, useRef, useState } from 'react'

// ── RenderPicker ─────────────────────────────────────────────────────────────
//
// Modal full-screen que mostra o histórico de renders do usuário em grid e
// permite seleção múltipla com ordem visível. Usa /api/renders/list para paginar.

export interface PickerRender {
  id:          string
  output_url:  string | null
  ambient:     string | null
  style:       string | null
  lighting:    string | null
  created_at:  string
}

export interface PickedItem {
  id:       string
  imageUrl: string
  label:    string
  context:  string
}

interface Props {
  minSelection: number
  maxSelection: number
  initialSelection?: PickedItem[]
  onConfirm: (items: PickedItem[]) => void
  onClose:   () => void
}

const PAGE_SIZE = 60

function toLabel(r: PickerRender): string {
  return r.ambient || r.style || 'Render'
}

function toContext(r: PickerRender): string {
  return [r.style, r.lighting].filter(Boolean).join(' · ')
}

export default function RenderPicker({ minSelection, maxSelection, initialSelection = [], onConfirm, onClose }: Props) {
  const [renders, setRenders] = useState<PickerRender[]>([])
  const [cursor,  setCursor]  = useState<string | null>(new Date().toISOString())
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  /** Lista de IDs selecionados em ORDEM (importante para numeração) */
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelection.map(i => i.id))

  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const escapeRef   = useRef<(e: KeyboardEvent) => void>(() => {})

  // Bloqueia scroll do body enquanto o modal está aberto
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [])

  // Esc fecha
  useEffect(() => {
    escapeRef.current = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const handler = (e: KeyboardEvent) => escapeRef.current(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function loadMore() {
    if (loading || !hasMore || !cursor) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/renders/list?cursor=${encodeURIComponent(cursor)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro')
      const page: PickerRender[] = (data.renders ?? []).filter((r: PickerRender) => r.output_url)
      setRenders(prev => [...prev, ...page])
      if (page.length < PAGE_SIZE) {
        setHasMore(false)
        setCursor(null)
      } else {
        setCursor(page[page.length - 1].created_at)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Carrega primeira página
  useEffect(() => {
    if (renders.length === 0 && hasMore) loadMore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Infinite scroll
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore()
    }, { rootMargin: '300px' })
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renders, hasMore, cursor])

  function toggle(id: string) {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= maxSelection) return prev      // limite atingido — não adiciona
      return [...prev, id]
    })
  }

  function handleConfirm() {
    const byId = new Map(renders.map(r => [r.id, r]))
    const items: PickedItem[] = selectedIds
      .map(id => byId.get(id))
      .filter((r): r is PickerRender => !!r && !!r.output_url)
      .map(r => ({
        id:       r.id,
        imageUrl: r.output_url!,
        label:    toLabel(r),
        context:  toContext(r),
      }))
    onConfirm(items)
  }

  const canConfirm = selectedIds.length >= minSelection && selectedIds.length <= maxSelection

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        animation: 'pickerFadeIn 0.18s ease',
      }}
    >
      <style>{`
        @keyframes pickerFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pickerScaleIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1100, maxHeight: '90vh',
          background: '#0a0a0a', color: '#fff',
          borderRadius: 14, border: '0.5px solid rgba(255,255,255,0.12)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'pickerScaleIn 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '0.5px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>
              Selecionar imagens do histórico
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
              Escolha de {minSelection} a {maxSelection} imagens. A ordem da seleção será a ordem do carrossel.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              fontSize: 11, fontWeight: 500,
              color: selectedIds.length >= minSelection ? '#30b46c' : 'rgba(255,255,255,0.5)',
              padding: '6px 12px', borderRadius: 999,
              background: selectedIds.length >= minSelection ? 'rgba(48,180,108,0.12)' : 'rgba(255,255,255,0.06)',
              border: `0.5px solid ${selectedIds.length >= minSelection ? 'rgba(48,180,108,0.3)' : 'rgba(255,255,255,0.1)'}`,
            }}>
              {selectedIds.length} / {maxSelection}
            </div>
            <button onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.5)', padding: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {renders.length === 0 && !loading && !error && (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              Você ainda não tem imagens no histórico.
              <br />
              <span style={{ fontSize: 11 }}>Gere alguns renders primeiro para montar uma prancha.</span>
            </div>
          )}

          {error && (
            <div style={{ padding: 14, borderRadius: 8, background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)', fontSize: 12, color: 'var(--color-error)', marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 10,
          }}>
            {renders.map((r) => {
              const idx = selectedIds.indexOf(r.id)
              const isSel = idx !== -1
              const blocked = !isSel && selectedIds.length >= maxSelection
              return (
                <div key={r.id}
                  onClick={() => !blocked && toggle(r.id)}
                  style={{
                    position: 'relative', cursor: blocked ? 'not-allowed' : 'pointer',
                    borderRadius: 8, overflow: 'hidden',
                    border: isSel ? '2px solid #fff' : '0.5px solid rgba(255,255,255,0.1)',
                    background: '#111',
                    aspectRatio: '4 / 3',
                    transition: 'border-color 0.15s, transform 0.15s',
                    opacity: blocked ? 0.4 : 1,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.output_url!} alt={toLabel(r)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

                  {/* Order badge */}
                  {isSel && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 26, height: 26, borderRadius: '50%',
                      background: '#fff', color: '#0a0a0a',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, letterSpacing: '-0.02em',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    }}>
                      {idx + 1}
                    </div>
                  )}

                  {/* Bottom meta */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '20px 10px 8px',
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
                    fontSize: 10, color: 'rgba(255,255,255,0.85)',
                    letterSpacing: '-0.01em',
                  }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {toLabel(r)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* sentinela do infinite scroll */}
          <div ref={loadMoreRef} style={{ height: 1 }} />

          {loading && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
              Carregando…
            </div>
          )}
          {!hasMore && renders.length > 0 && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
              Fim do histórico.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '0.5px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            {selectedIds.length < minSelection
              ? `Selecione mais ${minSelection - selectedIds.length} imagem${minSelection - selectedIds.length === 1 ? '' : 'ns'}.`
              : `${selectedIds.length} imagem${selectedIds.length === 1 ? '' : 'ns'} selecionada${selectedIds.length === 1 ? '' : 's'}.`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}
              style={{
                padding: '9px 16px', borderRadius: 8,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', letterSpacing: '-0.01em',
              }}>
              Cancelar
            </button>
            <button onClick={handleConfirm} disabled={!canConfirm}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                background: canConfirm ? '#fff' : 'rgba(255,255,255,0.08)',
                color:      canConfirm ? '#0a0a0a' : 'rgba(255,255,255,0.3)',
                fontSize: 12, fontWeight: 600,
                cursor: canConfirm ? 'pointer' : 'not-allowed',
                letterSpacing: '-0.01em',
              }}>
              Confirmar seleção
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
