'use client'

// TopBar — barra superior do editor Finalizar: voltar, nome, estado de
// salvamento, desfazer/refazer, antes/depois, zoom, painéis e exportar.

import { IconBtn, Divider, kbdStyle } from './ui'

export type SaveStatus = 'none' | 'dirty' | 'saving' | 'saved' | 'autosaved' | 'error'

interface Props {
  name: string
  onName: (n: string) => void
  onBack: () => void
  status: SaveStatus
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  compare: boolean
  onCompare: (down: boolean) => void
  zoomPct: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  panelsOpen: boolean
  onTogglePanels: () => void
  onSave: () => void
  saving: boolean
  onExport: () => void
  error: string | null
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  none: '',
  dirty: 'Alterações não salvas',
  saving: 'Salvando…',
  saved: 'Salvo',
  autosaved: 'Salvo automaticamente',
  error: 'Falha ao salvar',
}

export function TopBar(p: Props) {
  const statusColor = p.status === 'error'
    ? 'var(--color-error)'
    : p.status === 'dirty'
      ? 'var(--color-text-secondary)'
      : 'var(--color-text-tertiary)'
  const showDot = p.status === 'saved' || p.status === 'autosaved'

  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      borderBottom: '0.5px solid var(--color-border)', flexShrink: 0,
      background: 'var(--color-bg)',
    }}>
      <IconBtn onClick={p.onBack} title="Voltar para os projetos" size={32}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </IconBtn>

      <input
        value={p.name}
        onChange={(e) => p.onName(e.target.value)}
        aria-label="Nome do projeto"
        style={{
          fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em',
          color: 'var(--color-text-primary)', background: 'transparent',
          border: '0.5px solid transparent', borderRadius: 8, padding: '5px 8px',
          minWidth: 140, maxWidth: 300, outline: 'none',
        }}
        onFocus={(e) => (e.target.style.border = '0.5px solid var(--color-border-strong)')}
        onBlur={(e) => (e.target.style.border = '0.5px solid transparent')}
      />

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: statusColor, whiteSpace: 'nowrap' }}>
        {showDot && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--color-accent-green)', flexShrink: 0 }} />}
        {STATUS_TEXT[p.status]}
      </span>

      <div style={{ flex: 1 }} />
      {p.error && (
        <span style={{ fontSize: 12, color: 'var(--color-error)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.error}>
          {p.error}
        </span>
      )}

      <IconBtn onClick={p.onUndo} title="Desfazer (Ctrl+Z)" disabled={!p.canUndo} size={32}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
      </IconBtn>
      <IconBtn onClick={p.onRedo} title="Refazer (Ctrl+Shift+Z)" disabled={!p.canRedo} size={32}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></svg>
      </IconBtn>

      <Divider vertical />

      {/* Antes/depois: segurar */}
      <button
        type="button"
        onPointerDown={() => p.onCompare(true)}
        onPointerUp={() => p.onCompare(false)}
        onPointerLeave={() => p.compare && p.onCompare(false)}
        onClick={(e) => e.preventDefault()}
        title="Segure para ver a imagem sem os ajustes (tecla \)"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px',
          borderRadius: 8, fontSize: 12, userSelect: 'none',
          border: '0.5px solid var(--color-border-strong)',
          background: p.compare ? 'var(--color-surface-hover)' : 'transparent',
          color: p.compare ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /></svg>
        {p.compare ? 'Antes' : 'Comparar'}
      </button>

      <Divider vertical />

      <IconBtn onClick={p.onZoomOut} title="Reduzir zoom (-)" size={32}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M8 11h6" /></svg>
      </IconBtn>
      <button
        type="button"
        onClick={p.onFit}
        title="Ajustar à tela (0)"
        style={{
          fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)',
          background: 'transparent', border: 'none', cursor: 'pointer', width: 44, textAlign: 'center',
        }}
      >
        {p.zoomPct}%
      </button>
      <IconBtn onClick={p.onZoomIn} title="Ampliar zoom (+)" size={32}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M11 8v6M8 11h6" /></svg>
      </IconBtn>

      <IconBtn onClick={p.onTogglePanels} title={p.panelsOpen ? 'Recolher painéis (Tab)' : 'Mostrar painéis (Tab)'} active={false} size={32}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M15 4v16" />
          {!p.panelsOpen && <path d="M8 10l3 2-3 2" />}
        </svg>
      </IconBtn>

      <Divider vertical />

      <button type="button" className="spn-action spn-action--ghost" onClick={p.onSave} disabled={p.saving}
        style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5 }} title="Salvar projeto (Ctrl+S)">
        {p.saving ? 'Salvando…' : 'Salvar'}
      </button>
      <button type="button" className="spn-action spn-action--primary" onClick={p.onExport}
        style={{ width: 'auto', padding: '8px 16px', fontSize: 12.5 }} title="Exportar imagem (Ctrl+E)">
        Exportar
      </button>
    </header>
  )
}

export function StatusStrip({ hint }: { hint: string | null }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '5px 14px',
      borderTop: '0.5px solid var(--color-border)', flexShrink: 0,
      fontSize: 11, color: 'var(--color-text-quaternary)', minHeight: 26,
    }}>
      {hint}
      <div style={{ flex: 1 }} />
      <span>
        Scroll aproxima · <kbd style={kbdStyle}>Espaço</kbd> move · <kbd style={kbdStyle}>[</kbd> <kbd style={kbdStyle}>]</kbd> pincel · <kbd style={kbdStyle}>\</kbd> antes/depois
      </span>
    </div>
  )
}
