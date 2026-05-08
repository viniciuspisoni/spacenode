'use client'

import { useState, useLayoutEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { getUpscaleDisplayLabel, getVideoDisplayLabel } from '@/lib/renderLabels'

interface Render {
  id: string
  input_url: string
  output_url: string | null
  prompt: string
  ambient: string
  style: string
  lighting: string
  status: string
  cost_credits: number
  model?: string | null
  created_at: string
}

interface SpaceLite {
  id: string
  name: string
  category: string
}

interface Props {
  renders: Render[]
  credits: number
  spaces: SpaceLite[]
}

function qualityLabel(nodes: number): string | null {
  if (nodes === 4)  return 'HD'
  if (nodes === 8)  return '2K'
  if (nodes === 20) return '4K'
  return null
}

function engineLabel(model: string | null | undefined): string | null {
  if (!model) return null
  if (model.includes('nano-banana') || model.includes('vega')) return 'Vega'
  if (model.includes('gpt-image')   || model.includes('quasar')) return 'Quasar'
  return null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function inferExtension(url: string, isVideo: boolean): string {
  if (isVideo) return 'mp4'
  const m = url.match(/\.(jpe?g|png|webp|mp4)(?:\?|$)/i)
  return m ? m[1].toLowerCase() : 'jpg'
}

function buildFilename(r: Render, idx: number): string {
  const isVideo = r.ambient === 'video'
  const url = (isVideo ? r.input_url : r.output_url) ?? ''
  const ext = inferExtension(url, isVideo)
  const base = (r.ambient || r.style || 'render')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'render'
  return `spacenode-${base}-${idx + 1}.${ext}`
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export function HistoryClient({ renders, credits, spaces }: Props) {
  const router = useRouter()

  const [isDark, setIsDark] = useState(false)
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = () => {
    const html = document.documentElement
    const newDark = !html.classList.contains('dark')
    html.classList.toggle('dark', newDark)
    try { localStorage.setItem('theme', newDark ? 'dark' : 'light') } catch {}
    setIsDark(newDark)
  }

  const [search,     setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sort,       setSort]       = useState<'desc' | 'asc'>('desc')

  // ── Modo de seleção ─────────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false)
  const [selected,   setSelected]   = useState<Set<string>>(() => new Set())
  const [busy,       setBusy]       = useState(false)
  const [moveOpen,   setMoveOpen]   = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return renders
      .filter(r => {
        if (typeFilter !== 'all' && r.style !== typeFilter) return false
        if (q) return (r.ambient + ' ' + r.lighting + ' ' + r.style + ' ' + r.prompt).toLowerCase().includes(q)
        return true
      })
      .sort((a, b) => {
        const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        return sort === 'desc' ? diff : -diff
      })
  }, [renders, search, typeFilter, sort])

  const selectedRenders = useMemo(
    () => renders.filter(r => selected.has(r.id)),
    [renders, selected],
  )

  const enterSelectMode = () => { setSelectMode(true); setSelected(new Set()) }
  const exitSelectMode  = () => { setSelectMode(false); setSelected(new Set()) }

  const toggleOne = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const selectAllVisible = () => setSelected(new Set(filtered.map(r => r.id)))
  const clearSelection   = () => setSelected(new Set())

  // ── Ações em lote ───────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (selectedRenders.length === 0 || busy) return
    setBusy(true)
    try {
      let i = 0
      for (const r of selectedRenders) {
        const isVideo = r.ambient === 'video'
        const target  = isVideo ? r.input_url : r.output_url
        if (!target) continue
        const a = document.createElement('a')
        a.href = `/api/download?url=${encodeURIComponent(target)}&filename=${encodeURIComponent(buildFilename(r, i))}`
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
        i++
        // pequena pausa pra evitar bloqueio agressivo de "muitos downloads"
        if (i < selectedRenders.length) await sleep(350)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (selectedRenders.length === 0 || busy) return
    const n = selectedRenders.length
    const ok = window.confirm(
      `Excluir ${n} render${n !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`
    )
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch('/api/renders/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: [...selected], action: 'delete' }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Falha ao excluir' }))
        alert(error || 'Falha ao excluir')
        return
      }
      exitSelectMode()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleMove = async (spaceId: string | null) => {
    if (selectedRenders.length === 0 || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/renders/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: [...selected], action: 'move', space_id: spaceId }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Falha ao mover' }))
        alert(error || 'Falha ao mover')
        return
      }
      setMoveOpen(false)
      exitSelectMode()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id))

  return (
    <div style={S.main}>

      {/* ── Topbar ── */}
      <div style={S.topbar}>
        <span style={S.pageTitle}>HISTÓRICO</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={toggleTheme} style={S.themeToggle} title={isDark ? 'Modo claro' : 'Modo escuro'} suppressHydrationWarning>
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <div style={S.creditsChip}>
            <span style={S.creditDot} />
            <span style={S.creditNum}>{credits}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>nodes</span>
          </div>
        </div>
      </div>

      <div style={{ ...S.content, paddingBottom: selected.size > 0 ? 120 : 64 }}>

        {/* ── Header ── */}
        <div style={S.header}>
          <div>
            <h1 style={S.headerTitle}>Histórico</h1>
            <p style={S.headerSub}>Seus renders salvos e prontos para reutilizar.</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {renders.length > 0 && !selectMode && (
              <span style={S.count}>{filtered.length} render{filtered.length !== 1 ? 's' : ''}</span>
            )}
            {renders.length > 0 && (
              selectMode ? (
                <>
                  <button
                    onClick={allVisibleSelected ? clearSelection : selectAllVisible}
                    style={S.headerGhostBtn}
                  >
                    {allVisibleSelected ? 'Limpar' : 'Selecionar todos'}
                  </button>
                  <button onClick={exitSelectMode} style={S.headerGhostBtn}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button onClick={enterSelectMode} style={S.headerGhostBtn}>
                  Selecionar
                </button>
              )
            )}
          </div>
        </div>

        {/* ── Controls ── */}
        {renders.length > 0 && (
          <div style={S.controls}>
            <div style={S.searchWrap}>
              <svg style={S.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Buscar renders…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={S.searchInput}
              />
              {search && (
                <button onClick={() => setSearch('')} style={S.clearBtn}>✕</button>
              )}
            </div>

            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={S.select}>
              <option value="all">Todos os tipos</option>
              <option value="exterior">Exterior</option>
              <option value="interior">Interior</option>
            </select>

            <select value={sort} onChange={e => setSort(e.target.value as 'desc' | 'asc')} style={S.select}>
              <option value="desc">Mais recentes</option>
              <option value="asc">Mais antigos</option>
            </select>
          </div>
        )}

        {/* ── Grid / Empty ── */}
        {renders.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>Nenhum resultado para &ldquo;{search}&rdquo;</div>
            <button onClick={() => { setSearch(''); setTypeFilter('all') }} style={S.clearFilterBtn}>
              Limpar filtros
            </button>
          </div>
        ) : (
          <div style={S.grid}>
            {filtered.map(r => (
              <RenderCard
                key={r.id}
                render={r}
                selectMode={selectMode}
                selected={selected.has(r.id)}
                onToggle={() => toggleOne(r.id)}
              />
            ))}
          </div>
        )}

      </div>

      {/* ── Action bar (modo seleção) ── */}
      {selected.size > 0 && (
        <div style={S.actionBar}>
          <div style={S.actionBarInner}>
            <span style={S.actionBarCount}>
              {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleDownload} disabled={busy} style={S.actionPrimary}>
                <DownloadIcon /> Baixar
              </button>
              <button onClick={() => setMoveOpen(true)} disabled={busy} style={S.actionSecondary}>
                <FolderIcon /> Mover
              </button>
              <button onClick={handleDelete} disabled={busy} style={S.actionDanger}>
                <TrashIcon /> Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal mover para Space ── */}
      {moveOpen && (
        <MoveModal
          spaces={spaces}
          count={selected.size}
          busy={busy}
          onClose={() => setMoveOpen(false)}
          onPick={handleMove}
        />
      )}
    </div>
  )
}

// ── RenderCard ─────────────────────────────────────────────────────────────────

function RenderCard({
  render, selectMode, selected, onToggle,
}: {
  render: Render
  selectMode: boolean
  selected: boolean
  onToggle: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const date      = formatDate(render.created_at)
  const isUpscale = render.ambient === 'upscale'
  const isVideo   = render.ambient === 'video'
  const display   = isVideo ? render.input_url : (render.output_url ?? render.input_url)
  const quality   = (isUpscale || isVideo) ? null : qualityLabel(render.cost_credits)
  const engine    = (isUpscale || isVideo) ? null : engineLabel(render.model)
  const title     = isUpscale ? 'Upscale' : isVideo ? 'Animar Render' : (render.ambient || render.lighting || 'Render')
  const sub       = isUpscale
    ? getUpscaleDisplayLabel(render.style, render.lighting)
    : isVideo
      ? getVideoDisplayLabel(render.style, render.lighting)
      : [render.style === 'exterior' ? 'Exterior' : render.style === 'interior' ? 'Interior' : render.style, render.lighting].filter(Boolean).join(' · ')

  const handleCardClick = () => { if (selectMode) onToggle() }

  return (
    <div
      style={{
        ...S.card,
        cursor:    selectMode ? 'pointer' : 'default',
        boxShadow: selected
          ? '0 0 0 2px var(--color-text-primary), 0 8px 32px rgba(0,0,0,0.28)'
          : hovered
            ? '0 8px 32px rgba(0,0,0,0.28)'
            : '0 1px 4px rgba(0,0,0,0.12)',
        transform: hovered && !selectMode ? 'translateY(-3px)' : 'translateY(0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleCardClick}
    >
      {/* Image */}
      <div style={S.cardImg}>
        {display && (
          <img src={display} alt={title} draggable={false}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', pointerEvents: 'none',
              filter: selectMode && !selected ? 'brightness(0.78)' : 'none',
              transition: 'filter 0.15s',
            }}
          />
        )}

        {/* Before thumbnail on hover — não mostrar para vídeo nem em modo seleção */}
        {hovered && !selectMode && render.output_url && render.input_url && !isVideo && (
          <div style={S.beforeThumb}>
            <img src={render.input_url} alt="antes" draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <span style={S.beforeLabel}>antes</span>
          </div>
        )}

        {/* Ícone de play para cards de vídeo */}
        {isVideo && !selectMode && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 2 }}>
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          </div>
        )}

        {/* Checkbox de seleção */}
        {selectMode && (
          <div style={{ ...S.checkbox, ...(selected ? S.checkboxOn : null) }}>
            {selected && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        )}

        {/* Badges */}
        {!selectMode && (
          <div style={S.badgeRow}>
            {quality && <span style={S.badge}>{quality}</span>}
            {engine  && <span style={S.badge}>{engine}</span>}
          </div>
        )}

        {/* Hover overlay actions — desativadas no modo seleção */}
        {hovered && !selectMode && render.output_url && (
          <div style={S.hoverActions}>
            <a href={render.output_url} target="_blank" rel="noopener noreferrer"
              style={S.actionBtn} onClick={e => e.stopPropagation()}>
              {isVideo ? 'Assistir →' : 'Ver →'}
            </a>
            <a href={render.output_url} download target="_blank" rel="noopener noreferrer"
              style={S.actionBtnGhost} onClick={e => e.stopPropagation()}>
              <DownloadIcon /> baixar
            </a>
          </div>
        )}
      </div>

      {/* Meta */}
      <div style={S.cardMeta}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.metaTitle}>{title}</div>
          {sub && <div style={S.metaSub}>{sub}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <span style={S.metaDate}>{date}</span>
          {render.cost_credits > 0 && (
            <span style={S.metaNodes}>{render.cost_credits} node{render.cost_credits !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Move Modal ─────────────────────────────────────────────────────────────────

function MoveModal({
  spaces, count, busy, onClose, onPick,
}: {
  spaces: SpaceLite[]
  count: number
  busy: boolean
  onClose: () => void
  onPick: (spaceId: string | null) => void
}) {
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.modalHeader}>
          <div>
            <div style={S.modalTitle}>Mover para Space</div>
            <div style={S.modalSub}>
              {count} render{count !== 1 ? 's' : ''} selecionado{count !== 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={onClose} style={S.modalClose} aria-label="Fechar">✕</button>
        </div>

        <div style={S.modalBody}>
          {spaces.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              Você ainda não tem Spaces.{' '}
              <a href="/app/spaces/new" style={{ color: 'var(--color-text-primary)', textDecoration: 'underline' }}>
                Criar Space
              </a>
            </div>
          ) : (
            <ul style={S.spaceList}>
              {spaces.map(s => (
                <li key={s.id}>
                  <button
                    onClick={() => onPick(s.id)}
                    disabled={busy}
                    style={S.spaceItem}
                  >
                    <FolderIcon />
                    <span style={{ flex: 1, textAlign: 'left' }}>{s.name}</span>
                    <span style={S.spaceCat}>{s.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={S.modalFooter}>
          <button onClick={() => onPick(null)} disabled={busy} style={S.modalGhostBtn}>
            Remover de qualquer Space
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: '80px 48px' }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.4" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
      <div style={{ textAlign: 'center', maxWidth: 300 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>
          Nenhum render ainda
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.65 }}>
          Seus renders aparecem aqui depois de gerados. Crie o primeiro agora.
        </div>
      </div>
      <a href="/app/generate"
        style={{ marginTop: 8, padding: '10px 22px', background: 'var(--color-text-primary)', color: 'var(--color-bg)', borderRadius: 10, fontSize: 13, fontWeight: 500, textDecoration: 'none', letterSpacing: '-0.01em' }}>
        Gerar render
      </a>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/>
    </svg>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
  main:          { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg)' },
  topbar:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '0.5px solid var(--color-border)', flexShrink: 0 },
  pageTitle:     { fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 500 },
  creditsChip:   { display: 'flex', alignItems: 'center', gap: 6 },
  creditDot:     { width: 5, height: 5, borderRadius: '50%', background: 'var(--color-accent-green)', boxShadow: '0 0 5px var(--color-accent-green-glow)', display: 'inline-block' },
  creditNum:     { color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 12 },
  themeToggle:   { width: 28, height: 28, borderRadius: '50%', border: '0.5px solid var(--color-border-strong)', background: 'var(--color-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: 0, flexShrink: 0 },

  content:       { flex: 1, overflowY: 'auto', padding: '36px 36px 64px' },

  header:        { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 },
  headerTitle:   { fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 6 },
  headerSub:     { fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '-0.01em' },
  count:         { fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.01em', paddingBottom: 2 },
  headerGhostBtn:{ background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, padding: '7px 13px', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },

  controls:      { display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' },
  searchWrap:    { position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 180 },
  searchIcon:    { position: 'absolute', left: 11, color: 'var(--color-text-tertiary)', pointerEvents: 'none', flexShrink: 0 },
  searchInput:   { width: '100%', padding: '8px 32px 8px 32px', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, fontSize: 12, color: 'var(--color-text-primary)', background: 'var(--color-bg-elevated)', fontFamily: 'inherit', outline: 'none', letterSpacing: '-0.01em' },
  clearBtn:      { position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--color-text-tertiary)', padding: 2 },
  select:        { padding: '8px 12px', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--color-bg-elevated)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', letterSpacing: '-0.01em' },
  clearFilterBtn:{ background: 'none', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, padding: '7px 16px', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit' },

  grid:          { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },

  card:          { background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 12, overflow: 'hidden', transition: 'box-shadow 0.18s, transform 0.18s', userSelect: 'none' },
  cardImg:       { position: 'relative', aspectRatio: '4/3', background: 'var(--color-surface)', overflow: 'hidden' },
  cardMeta:      { padding: '13px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  metaTitle:     { fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 },
  metaSub:       { fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.01em' },
  metaDate:      { fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' },
  metaNodes:     { fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-quaternary)', whiteSpace: 'nowrap' },

  badgeRow:      { position: 'absolute', top: 10, right: 10, display: 'flex', gap: 5 },
  badge:         { fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, padding: '3px 7px', borderRadius: 5, background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)' },

  checkbox:      { position: 'absolute', top: 10, left: 10, width: 22, height: 22, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  checkboxOn:    { background: 'var(--color-text-primary)', borderColor: 'var(--color-text-primary)', color: 'var(--color-bg)' },

  hoverActions:  { position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 6 },
  actionBtn:     { display: 'inline-flex', alignItems: 'center', padding: '5px 13px', background: 'rgba(255,255,255,0.92)', borderRadius: 7, fontSize: 11, color: '#111', fontWeight: 500, textDecoration: 'none', fontFamily: 'inherit', letterSpacing: '-0.01em' },
  actionBtnGhost:{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'rgba(0,0,0,0.5)', border: '0.5px solid rgba(255,255,255,0.25)', borderRadius: 7, fontSize: 10, color: '#fafafa', textDecoration: 'none', backdropFilter: 'blur(4px)', fontFamily: 'inherit' },

  beforeThumb:   { position: 'absolute', top: 10, left: 10, width: 72, height: 54, borderRadius: 6, overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.6)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  beforeLabel:   { position: 'absolute', bottom: 3, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#fff', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', textShadow: '0 1px 2px rgba(0,0,0,0.8)' },

  // ── Action bar (modo seleção) ─
  actionBar:     { position: 'fixed', bottom: 18, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 50 },
  actionBarInner:{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px', background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.45)', pointerEvents: 'auto', backdropFilter: 'blur(12px)' },
  actionBarCount:{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em', paddingLeft: 4 },
  actionPrimary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--color-text-primary)', color: 'var(--color-bg)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },
  actionSecondary:{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--color-bg)', color: 'var(--color-text-primary)', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },
  actionDanger:  { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--color-bg)', color: '#e0584a', border: '0.5px solid rgba(224,88,74,0.4)', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },

  // ── Modal ─
  modalOverlay:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24, backdropFilter: 'blur(2px)' },
  modal:         { width: '100%', maxWidth: 440, maxHeight: '80vh', background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' },
  modalHeader:   { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '0.5px solid var(--color-border)' },
  modalTitle:    { fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: 3 },
  modalSub:      { fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.01em' },
  modalClose:    { background: 'none', border: 'none', color: 'var(--color-text-tertiary)', fontSize: 14, cursor: 'pointer', padding: 4, lineHeight: 1 },
  modalBody:     { flex: 1, overflowY: 'auto', padding: '8px 12px' },
  modalFooter:   { padding: '12px 20px', borderTop: '0.5px solid var(--color-border)' },
  modalGhostBtn: { width: '100%', background: 'none', border: '0.5px dashed var(--color-border-strong)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },

  spaceList:     { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  spaceItem:     { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'none', border: 'none', borderRadius: 8, fontSize: 13, color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em', textAlign: 'left' },
  spaceCat:      { fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-quaternary)' },
}
