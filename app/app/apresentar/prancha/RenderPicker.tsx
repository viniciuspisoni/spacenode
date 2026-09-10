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
  const dialogRef   = useRef<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  // Bloqueia scroll do body enquanto o modal está aberto
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [])

  // Foco entra no diálogo e volta pra quem abriu. O `aria-modal="true"` faz o
  // leitor de tela tratar o resto da página como inerte — sem trazer o foco
  // pra cá, o usuário ficaria preso em conteúdo que a AT acabou de esconder.
  // Mesma receita da folha (components/app/glass/Sheet.tsx).
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    const t = window.setTimeout(() => dialogRef.current?.focus(), 40)
    return () => {
      window.clearTimeout(t)
      restoreFocusRef.current?.focus?.()
    }
  }, [])

  // Tab preso dentro do diálogo enquanto ele estiver aberto.
  function onKeyDownTrap(ev: React.KeyboardEvent) {
    if (ev.key !== 'Tab') return
    const root = dialogRef.current
    if (!root) return
    const focusables = root.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last  = focusables[focusables.length - 1]
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus() }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus() }
  }

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
    /* O scrim é o mesmo da folha (.spn-scrim): era aqui que morava o único
       backdrop-filter inline do módulo — e inline ele não é alcançado pelos
       fallbacks de @supports e prefers-reduced-transparency. */
    <div
      className="spn-scrim"
      data-open="true"
      onClick={onClose}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <style>{`
        @keyframes pickerScaleIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
      `}</style>

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Selecionar imagens do histórico"
        tabIndex={-1}
        onKeyDown={onKeyDownTrap}
        onClick={(e) => e.stopPropagation()}
        className="spn-glass spn-glass--chrome"
        style={{
          width: '100%', maxWidth: 1100, maxHeight: '90vh',
          color: 'var(--color-text-primary)',
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-float)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'pickerScaleIn 0.2s var(--ease)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
          padding: '16px 20px',
          borderBottom: '0.5px solid var(--glass-line)',
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div className="spn-sheet-title">Selecionar imagens do histórico</div>
            <p className="spn-hint" style={{ marginTop: 3 }}>
              De {minSelection} a {maxSelection} imagens. A ordem da seleção é a ordem do carrossel.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* Verde é ESTADO: aqui ele diz "já dá pra confirmar", não é ação. */}
            <span className="spn-balance spn-glass spn-glass--raised">
              {selectedIds.length >= minSelection ? <span className="spn-balance-dot" /> : null}
              <b>{selectedIds.length}</b> / {maxSelection}
            </span>
            <button type="button" className="spn-icon-btn" onClick={onClose} aria-label="Fechar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          {renders.length === 0 && !loading && !error && (
            <div className="spn-empty" style={{ maxWidth: 380, margin: '40px auto' }}>
              Você ainda não tem imagens no histórico.
              <br />
              Gere alguns renders primeiro para montar uma prancha.
            </div>
          )}

          {error && (
            <div className="spn-error" style={{ marginBottom: 14 }}>{error}</div>
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
                    border: isSel ? '2px solid var(--color-text-primary)' : '0.5px solid var(--color-border-strong)',
                    background: 'var(--color-preview-bg)',
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
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
              Carregando…
            </div>
          )}
          {!hasMore && renders.length > 0 && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 10 }}>
              Fim do histórico.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '0.5px solid var(--glass-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          flexShrink: 0,
        }}>
          <span className="spn-hint" style={{ marginTop: 0 }}>
            {selectedIds.length < minSelection
              ? `Selecione mais ${minSelection - selectedIds.length} imagem${minSelection - selectedIds.length === 1 ? '' : 'ns'}.`
              : `${selectedIds.length} imagem${selectedIds.length === 1 ? '' : 'ns'} selecionada${selectedIds.length === 1 ? '' : 's'}.`}
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" className="spn-ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="spn-cta" style={{ width: 'auto', minHeight: 34, padding: '0 18px' }}
                    onClick={handleConfirm} disabled={!canConfirm}>
              Confirmar seleção
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
