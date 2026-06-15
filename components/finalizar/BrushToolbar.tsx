'use client'

// BrushToolbar — controles do pincel de máscara da camada ativa.
// Revelar mostra a camada na área pintada; Ocultar a esconde (mostra o que está
// embaixo). Tamanho e Suavização (feather) são simples e diretos. Nada de jargão.

import type { BrushMode } from '@/lib/finalizar/types'

interface Props {
  brushMode: BrushMode
  onBrushMode: (m: BrushMode) => void
  brushSize: number
  onBrushSize: (n: number) => void
  feather: number
  onFeather: (n: number) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onResetView: () => void
  zoomPct: number
  /** Desabilita pincel/feather quando a camada ativa é a base ou não há seleção. */
  disabled?: boolean
}

const BRUSH_MIN = 8
const BRUSH_MAX = 160
const FEATHER_MAX = 60

export function BrushToolbar({
  brushMode, onBrushMode, brushSize, onBrushSize, feather, onFeather,
  onUndo, onRedo, canUndo, canRedo, onResetView, zoomPct, disabled,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--color-surface)', borderRadius: 9, border: '0.5px solid var(--color-border)' }}>
        <button type="button" style={segStyle(brushMode === 'reveal')} onClick={() => onBrushMode('reveal')} title="Mostra a camada na área pintada">
          Revelar
        </button>
        <button type="button" style={segStyle(brushMode === 'hide')} onClick={() => onBrushMode('hide')} title="Esconde a camada (mostra o que está embaixo)">
          Ocultar
        </button>
      </div>

      <label style={labelStyle}>
        Tamanho
        <input type="range" min={BRUSH_MIN} max={BRUSH_MAX} value={brushSize}
          onChange={(e) => onBrushSize(Number(e.target.value))}
          style={{ width: 96, accentColor: 'var(--color-accent-green)' }} />
      </label>

      <label style={labelStyle}>
        Suavização
        <input type="range" min={0} max={FEATHER_MAX} value={feather}
          onChange={(e) => onFeather(Number(e.target.value))}
          style={{ width: 96, accentColor: 'var(--color-accent-green)' }} />
      </label>

      <div style={{ width: 1, height: 20, background: 'var(--color-border)' }} />

      <button type="button" style={pillStyle(false, !canUndo)} disabled={!canUndo} onClick={onUndo} title="Desfazer (Ctrl+Z)">
        Desfazer
      </button>
      <button type="button" style={pillStyle(false, !canRedo)} disabled={!canRedo} onClick={onRedo} title="Refazer (Ctrl+Shift+Z)">
        Refazer
      </button>

      <div style={{ flex: 1 }} />

      {zoomPct > 100 && (
        <button type="button" style={pillStyle(false, false)} onClick={onResetView}>
          Ajustar à tela · {zoomPct}%
        </button>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-tertiary)',
}

function segStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 14px',
    borderRadius: 7,
    fontSize: 12.5,
    border: '0.5px solid transparent',
    background: active ? 'var(--color-surface-hover)' : 'transparent',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    cursor: 'pointer',
  }
}

function pillStyle(active: boolean, isDisabled: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    borderRadius: 8,
    fontSize: 12.5,
    border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-surface-hover)' : 'transparent',
    color: isDisabled ? 'var(--color-text-quaternary)' : active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    cursor: isDisabled ? 'default' : 'pointer',
  }
}
