'use client'

import { useState, useEffect, type CSSProperties } from 'react'

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
  created_at: string
}

interface Props {
  renders: Render[]
  credits: number
}

export function HistoryClient({ renders, credits }: Props) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = () => {
    const html = document.documentElement
    const newDark = !html.classList.contains('dark')
    html.classList.toggle('dark', newDark)
    try { localStorage.setItem('theme', newDark ? 'dark' : 'light') } catch (e) {}
    setIsDark(newDark)
  }

  return (
      <div style={S.main}>
        <div style={S.topbar}>
          <span style={S.pageTitle}>HISTÓRICO</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={toggleTheme} style={S.themeToggle} title={isDark ? 'Modo claro' : 'Modo escuro'}>
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
          {renders.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={S.grid}>
              {renders.map(r => <RenderCard key={r.id} render={r} />)}
            </div>
          )}
        </div>
      </div>
  )
}

function RenderCard({ render }: { render: Render }) {
  const [hovered, setHovered] = useState(false)

  const date = new Date(render.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  const displayUrl = render.output_url ?? render.input_url

  return (
    <div
      style={{
        ...S.card,
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.2)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={S.cardImg}>
        {displayUrl && (
          <img
            src={displayUrl}
            alt="render"
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          />
        )}

        {hovered && render.output_url && render.input_url && (
          <div style={S.beforeThumb}>
            <img src={render.input_url} alt="input" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={S.beforeLabel}>antes</span>
          </div>
        )}

        {hovered && render.output_url && (
          <a
            href={render.output_url}
            download
            target="_blank"
            rel="noopener noreferrer"
            style={S.downloadBtn}
            onClick={e => e.stopPropagation()}
          >
            <DownloadIcon />
            baixar
          </a>
        )}
      </div>

      <div style={S.cardMeta}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={S.metaTitle}>{render.lighting || render.ambient}</span>
          <span style={S.metaSub}>{render.ambient}{render.style ? ` · ${render.style}` : ''}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
          <span style={S.metaDate}>{date}</span>
          <span style={S.metaNodes}>{render.cost_credits} node{render.cost_credits !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: 48 }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-quaternary)" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
        </svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 6, letterSpacing: '-0.02em' }}>
          nenhum render ainda
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
          seus renders aparecerão aqui depois de gerados
        </div>
      </div>
      <a href="/app/generate" style={{ marginTop: 8, padding: '8px 20px', background: 'var(--color-text-primary)', color: 'var(--color-bg)', borderRadius: 20, fontSize: 12, fontWeight: 500, textDecoration: 'none', letterSpacing: '-0.01em' }}>
        gerar agora
      </a>
    </div>
  )
}

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}

const S: Record<string, CSSProperties> = {
  main:               { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg)' },
  topbar:             { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '0.5px solid var(--color-border)', flexShrink: 0 },
  pageTitle:          { fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 500 },
  creditsChip:        { display: 'flex', alignItems: 'center', gap: 6 },
  creditDot:          { width: 5, height: 5, borderRadius: '50%', background: 'var(--color-accent-green)', boxShadow: '0 0 5px var(--color-accent-green-glow)', display: 'inline-block' },
  creditNum:          { color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 12 },
  themeToggle:        { width: 28, height: 28, borderRadius: '50%', border: '0.5px solid var(--color-border-strong)', background: 'var(--color-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: 0, flexShrink: 0 },
  content:            { flex: 1, overflowY: 'auto', padding: 28 },
  grid:               { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  card:               { background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 12, overflow: 'hidden', cursor: 'default', transition: 'box-shadow 0.2s, transform 0.2s' },
  cardImg:            { position: 'relative', aspectRatio: '4/3', background: 'var(--color-surface)', overflow: 'hidden' },
  cardMeta:           { padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  metaTitle:          { fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  metaSub:            { fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  metaDate:           { fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' },
  metaNodes:          { fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-quaternary)', whiteSpace: 'nowrap' },
  beforeThumb:        { position: 'absolute', top: 10, left: 10, width: 72, height: 54, borderRadius: 6, overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.6)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  beforeLabel:        { position: 'absolute', bottom: 3, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#fff', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', textShadow: '0 1px 2px rgba(0,0,0,0.8)' },
  downloadBtn:        { position: 'absolute', bottom: 10, right: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'rgba(0,0,0,0.55)', border: '0.5px solid rgba(255,255,255,0.3)', borderRadius: 20, fontSize: 10, color: '#fafafa', textDecoration: 'none', backdropFilter: 'blur(4px)', fontFamily: 'inherit', letterSpacing: '0.02em' },
}
