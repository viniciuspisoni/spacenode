'use client'

// LayerPanel — pilha de camadas. Topo do painel = topo da composição.
// Adicionar, mostrar/ocultar, opacidade, mesclagem, ordenar, renomear, excluir,
// e ações de máscara (inverter / preencher). Estética premium, zero jargão.

import { useState } from 'react'
import { BLEND_MODES, type BlendMode, type Layer } from '@/lib/finalizar/types'

interface Props {
  layers: Layer[]
  activeLayerId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onToggleVisible: (id: string) => void
  onOpacity: (id: string, value: number) => void
  onBlend: (id: string, mode: BlendMode) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, dir: 'up' | 'down') => void
  onInvertMask: (id: string) => void
  onClearMask: (id: string, fill: 'full' | 'empty') => void
}

const card: React.CSSProperties = {
  border: '0.5px solid var(--color-border)',
  borderRadius: 14,
  background: 'var(--color-bg-elevated)',
  padding: 14,
}
const sectionLabel: React.CSSProperties = {
  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)',
}

export function LayerPanel(props: Props) {
  const { layers, activeLayerId, onSelect, onAdd, onToggleVisible, onOpacity, onBlend, onRename, onDelete, onMove, onInvertMask, onClearMask } = props
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  // Topo do painel = topo da composição → renderiza em ordem reversa.
  const ordered = [...layers].reverse()
  const active = layers.find((l) => l.id === activeLayerId) ?? null

  const startRename = (l: Layer) => { setEditingId(l.id); setDraftName(l.name) }
  const commitRename = () => {
    if (editingId) { const n = draftName.trim(); if (n) onRename(editingId, n) }
    setEditingId(null)
  }

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={sectionLabel}>Camadas</span>
          <button type="button" onClick={onAdd} style={addBtn} title="Adicionar imagem como camada">
            + Adicionar
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ordered.map((l, visualIdx) => {
            const isActive = l.id === activeLayerId
            const isTop = visualIdx === 0
            const isBottom = visualIdx === ordered.length - 1
            return (
              <div
                key={l.id}
                onClick={() => onSelect(l.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 9px', borderRadius: 10, cursor: 'pointer',
                  border: `0.5px solid ${isActive ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                  background: isActive ? 'var(--color-surface-hover)' : 'transparent',
                }}
              >
                {/* visível/oculto */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (!l.isBase) onToggleVisible(l.id) }}
                  title={l.isBase ? 'A base permanece visível' : l.visible ? 'Ocultar camada' : 'Mostrar camada'}
                  style={{ ...iconBtn, color: l.visible ? 'var(--color-text-secondary)' : 'var(--color-text-quaternary)', cursor: l.isBase ? 'default' : 'pointer' }}
                >
                  {l.visible ? <EyeIcon /> : <EyeOffIcon />}
                </button>

                {/* thumb */}
                <span style={{ width: 34, height: 26, borderRadius: 6, overflow: 'hidden', flexShrink: 0, border: '0.5px solid var(--color-border)', background: 'var(--color-surface)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </span>

                {/* nome */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === l.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '100%', fontSize: 13, padding: '3px 6px', borderRadius: 6, border: '0.5px solid var(--color-border-strong)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => { e.stopPropagation(); startRename(l) }}
                      style={{ fontSize: 13, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                      title="Duplo-clique para renomear"
                    >
                      {l.name}{l.isBase && <span style={{ color: 'var(--color-text-quaternary)', fontSize: 11 }}> · base</span>}
                    </span>
                  )}
                </div>

                {/* mover / excluir */}
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button type="button" disabled={isTop} onClick={(e) => { e.stopPropagation(); onMove(l.id, 'up') }} style={{ ...iconBtn, opacity: isTop ? 0.3 : 1 }} title="Mover para cima"><ChevronUp /></button>
                  <button type="button" disabled={isBottom || l.isBase} onClick={(e) => { e.stopPropagation(); onMove(l.id, 'down') }} style={{ ...iconBtn, opacity: isBottom || l.isBase ? 0.3 : 1 }} title="Mover para baixo"><ChevronDown /></button>
                  {!l.isBase && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(l.id) }} style={{ ...iconBtn, color: 'var(--color-text-tertiary)' }} title="Excluir camada"><TrashIcon /></button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Propriedades da camada ativa */}
      {active && !active.isBase && (
        <div style={card}>
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Camada · {active.name}</div>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            <span>Opacidade</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="range" min={0} max={100} value={Math.round(active.opacity * 100)}
                onChange={(e) => onOpacity(active.id, Number(e.target.value) / 100)}
                style={{ width: 120, accentColor: 'var(--color-accent-green)' }} />
              <span style={{ width: 34, textAlign: 'right', color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(active.opacity * 100)}%</span>
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
            <span>Mesclagem</span>
            <select
              value={active.blendMode}
              onChange={(e) => onBlend(active.id, e.target.value as BlendMode)}
              style={{ fontSize: 12.5, padding: '5px 8px', borderRadius: 8, border: '0.5px solid var(--color-border-strong)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}
            >
              {BLEND_MODES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </label>

          <div style={{ ...sectionLabel, marginBottom: 8 }}>Máscara</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onClearMask(active.id, 'full')} style={chip} title="Mostrar a camada inteira">Mostrar tudo</button>
            <button type="button" onClick={() => onClearMask(active.id, 'empty')} style={chip} title="Ocultar a camada inteira (revele só o que quiser)">Ocultar tudo</button>
            <button type="button" onClick={() => onInvertMask(active.id)} style={chip} title="Inverter a máscara">Inverter</button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-quaternary)', marginTop: 10, lineHeight: 1.5 }}>
            Pinte com <strong style={{ color: 'var(--color-text-tertiary)' }}>Ocultar</strong> para apagar as partes ruins desta camada e revelar a de baixo.
          </p>
        </div>
      )}

      {active?.isBase && (
        <div style={card}>
          <div style={{ ...sectionLabel, marginBottom: 8 }}>Base</div>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
            A camada base é o fundo da composição. Adicione outras imagens por cima e use as máscaras para combinar as melhores partes.
          </p>
        </div>
      )}
    </aside>
  )
}

const addBtn: React.CSSProperties = {
  fontSize: 12, padding: '5px 10px', borderRadius: 8,
  border: '0.5px solid var(--color-border-strong)', background: 'var(--color-bg-elevated)',
  color: 'var(--color-text-secondary)', cursor: 'pointer',
}
const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, borderRadius: 7, background: 'transparent',
  color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0,
}
const chip: React.CSSProperties = {
  fontSize: 12, padding: '5px 10px', borderRadius: 8,
  border: '0.5px solid var(--color-border)', background: 'transparent',
  color: 'var(--color-text-secondary)', cursor: 'pointer',
}

// ── Ícones (inline, padrão Sidebar: 16px, stroke currentColor 1.5) ───────────
const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOffIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.36M6.6 6.6A13.2 13.2 0 0 0 2 11s3.5 7 10 7a9 9 0 0 0 3.4-.65" /><path d="M3 3l18 18" />
  </svg>
)
const ChevronUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
)
const ChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
)
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
)
