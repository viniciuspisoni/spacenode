'use client'

// ExportDialog — exporta a composição achatada (PNG/JPG), 100% no navegador.
// PSD fica como seam futuro (desabilitado). Nenhuma exportação consome Nodes.

import { useState } from 'react'
import type { ExportFormat } from '@/lib/finalizar/types'

interface Props {
  open: boolean
  onClose: () => void
  onExport: (format: ExportFormat, quality: number) => Promise<void>
}

export function ExportDialog({ open, onClose, onExport }: Props) {
  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState(92)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  async function run() {
    setBusy(true)
    try {
      await onExport(format, quality / 100)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 100%)', background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '15px 18px', borderBottom: '0.5px solid var(--color-border)', fontSize: 14.5, fontWeight: 600 }}>
          Exportar composição
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 10 }}>Formato</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => setFormat('png')} style={fmtStyle(format === 'png')}>PNG<span style={sub}>sem perda</span></button>
              <button type="button" onClick={() => setFormat('jpg')} style={fmtStyle(format === 'jpg')}>JPG<span style={sub}>menor</span></button>
              <button type="button" disabled style={{ ...fmtStyle(false), opacity: 0.45, cursor: 'default' }}>PSD<span style={sub}>em breve</span></button>
            </div>
          </div>

          {format === 'jpg' && (
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
              <span>Qualidade</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min={50} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} style={{ width: 130, accentColor: 'var(--color-accent-green)' }} />
                <span style={{ width: 34, textAlign: 'right', color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{quality}%</span>
              </span>
            </label>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" className="spn-action spn-action--ghost" onClick={onClose} disabled={busy} style={{ flex: 1 }}>Cancelar</button>
            <button type="button" className="spn-action spn-action--primary" onClick={run} disabled={busy} style={{ flex: 1 }}>
              {busy ? 'Exportando…' : 'Baixar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const sub: React.CSSProperties = { display: 'block', fontSize: 10.5, color: 'var(--color-text-quaternary)', fontWeight: 400, marginTop: 2 }

function fmtStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '10px 8px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 500,
    border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-surface-hover)' : 'transparent',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    cursor: 'pointer',
  }
}
