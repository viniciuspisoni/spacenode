'use client'

import { useState, useLayoutEffect, useMemo, type CSSProperties } from 'react'

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

interface Props {
  renders: Render[]
  credits: number
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

export function HistoryClient({ renders, credits }: Props) {
  const [isDark, setIsDark] = useState(false)
  useLayoutEffect(() => {
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

      <div style={S.content}>

        {/* ── Header ── */}
        <div style={S.header}>
          <div>
            <h1 style={S.headerTitle}>Histórico</h1>
            <p style={S.headerSub}>Seus renders salvos e prontos para reutilizar.</p>
          </div>
          {renders.length > 0 && (
            <span style={S.count}>{filtered.length} render{filtered.length !== 1 ? 's' : ''}</span>
          )}
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
            {filtered.map(r => <RenderCard key={r.id} render={r} />)}
          </div>
        )}

      </div>
    </div>
  )
}

// ── RenderCard ─────────────────────────────────────────────────────────────────

function RenderCard({ render }: { render: Render }) {
  const [hovered, setHovered] = useState(false)

  const date    = formatDate(render.created_at)
  const display = render.output_url ?? render.input_url
  const quality = qualityLabel(render.cost_credits)
  const engine  = engineLabel(render.model)
  const title   = render.ambient || render.lighting || 'Render'
  const sub     = [render.style === 'exterior' ? 'Exterior' : render.style === 'interior' ? 'Interior' : render.style, render.lighting].filter(Boolean).join(' · ')

  return (
    <div
      style={{
        ...S.card,
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.28)' : '0 1px 4px rgba(0,0,0,0.12)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div style={S.cardImg}>
        {display && (
          <img src={display} alt={title} draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          />
        )}

        {/* Before thumbnail on hover */}
        {hovered && render.output_url && render.input_url && (
          <div style={S.beforeThumb}>
            <img src={render.input_url} alt="antes" draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <span style={S.beforeLabel}>antes</span>
          </div>
        )}

        {/* Badges */}
        <div style={S.badgeRow}>
          {quality && <span style={S.badge}>{quality}</span>}
          {engine  && <span style={S.badge}>{engine}</span>}
        </div>

        {/* Hover overlay actions */}
        {hovered && render.output_url && (
          <div style={S.hoverActions}>
            <a href={render.output_url} target="_blank" rel="noopener noreferrer"
              style={S.actionBtn} onClick={e => e.stopPropagation()}>
              Ver →
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

  controls:      { display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' },
  searchWrap:    { position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 180 },
  searchIcon:    { position: 'absolute', left: 11, color: 'var(--color-text-tertiary)', pointerEvents: 'none', flexShrink: 0 },
  searchInput:   { width: '100%', padding: '8px 32px 8px 32px', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, fontSize: 12, color: 'var(--color-text-primary)', background: 'var(--color-bg-elevated)', fontFamily: 'inherit', outline: 'none', letterSpacing: '-0.01em' },
  clearBtn:      { position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--color-text-tertiary)', padding: 2 },
  select:        { padding: '8px 12px', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--color-bg-elevated)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', letterSpacing: '-0.01em' },
  clearFilterBtn:{ background: 'none', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, padding: '7px 16px', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit' },

  grid:          { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },

  card:          { background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 12, overflow: 'hidden', cursor: 'default', transition: 'box-shadow 0.18s, transform 0.18s' },
  cardImg:       { position: 'relative', aspectRatio: '4/3', background: 'var(--color-surface)', overflow: 'hidden' },
  cardMeta:      { padding: '13px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  metaTitle:     { fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 },
  metaSub:       { fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.01em' },
  metaDate:      { fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' },
  metaNodes:     { fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-quaternary)', whiteSpace: 'nowrap' },

  badgeRow:      { position: 'absolute', top: 10, right: 10, display: 'flex', gap: 5 },
  badge:         { fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, padding: '3px 7px', borderRadius: 5, background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)' },

  hoverActions:  { position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 6 },
  actionBtn:     { display: 'inline-flex', alignItems: 'center', padding: '5px 13px', background: 'rgba(255,255,255,0.92)', borderRadius: 7, fontSize: 11, color: '#111', fontWeight: 500, textDecoration: 'none', fontFamily: 'inherit', letterSpacing: '-0.01em' },
  actionBtnGhost:{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'rgba(0,0,0,0.5)', border: '0.5px solid rgba(255,255,255,0.25)', borderRadius: 7, fontSize: 10, color: '#fafafa', textDecoration: 'none', backdropFilter: 'blur(4px)', fontFamily: 'inherit' },

  beforeThumb:   { position: 'absolute', top: 10, left: 10, width: 72, height: 54, borderRadius: 6, overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.6)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  beforeLabel:   { position: 'absolute', bottom: 3, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#fff', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', textShadow: '0 1px 2px rgba(0,0,0,0.8)' },
}
