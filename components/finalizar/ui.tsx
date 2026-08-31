'use client'

// components/finalizar/ui.tsx — primitivos visuais do editor Finalizar.
//
// Direção visual: interface NEUTRA (pretos/brancos/cinzas) com verde em ~2% —
// apenas estado ativo real, sucesso e ação prioritária. Sliders profissionais
// (trilho cinza, knob claro; verde só em hover/foco/arraste — ver .spn-slider).

import { useEffect, useId, useRef, useState } from 'react'

export const panelCard: React.CSSProperties = {
  border: '0.5px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-panel)',
  boxShadow: 'var(--shadow-sm)',
  padding: 14,
}

export const sectionLabel: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
}

export function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...sectionLabel, marginBottom: 10, ...style }}>{children}</div>
}

// ── SliderRow ────────────────────────────────────────────────────────────────

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  /** Duplo-clique no rótulo volta a este valor (padrão 0). */
  defaultValue?: number
  format?: (v: number) => string
  disabled?: boolean
  title?: string
}

export function SliderRow({ label, value, min, max, step = 1, onChange, defaultValue = 0, format, disabled, title }: SliderRowProps) {
  const id = useId()
  const changed = value !== defaultValue
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commitDraft = () => {
    setEditing(false)
    const n = Number(draft.replace(',', '.'))
    if (!Number.isFinite(n)) return
    onChange(Math.max(min, Math.min(max, n)))
  }

  // preenchimento do trilho (fração percorrida) — cinza, nunca verde
  const pct = Math.max(0, Math.min(100, ((value - min) / Math.max(1e-6, max - min)) * 100))
  const trackBg = `linear-gradient(to right, var(--color-text-quaternary) 0%, var(--color-text-quaternary) ${pct}%, var(--color-surface-hover) ${pct}%, var(--color-surface-hover) 100%)`

  return (
    <div
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <label
        htmlFor={id}
        onDoubleClick={() => onChange(defaultValue)}
        title={title ?? 'Duplo-clique para redefinir'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 12, color: changed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          width: 92, flexShrink: 0, cursor: 'default', userSelect: 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {/* indicador discreto de parâmetro alterado */}
        <span style={{
          width: 4, height: 4, borderRadius: 999, flexShrink: 0,
          background: changed ? 'var(--color-text-tertiary)' : 'transparent',
        }} />
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="spn-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, minWidth: 40, background: trackBg }}
      />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft()
            if (e.key === 'Escape') setEditing(false)
            e.stopPropagation()
          }}
          inputMode="numeric"
          style={{
            width: 40, fontSize: 11.5, textAlign: 'right', padding: '1px 3px',
            borderRadius: 5, border: '1px solid var(--color-input-border)',
            background: 'var(--color-input)', color: 'var(--color-text-primary)',
            outline: 'none', fontVariantNumeric: 'tabular-nums', flexShrink: 0,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(String(value)); setEditing(true) }}
          title="Clique para digitar o valor"
          style={{
            width: 40, textAlign: 'right', fontSize: 11.5, fontVariantNumeric: 'tabular-nums',
            color: changed ? 'var(--color-text-secondary)' : 'var(--color-text-quaternary)',
            flexShrink: 0, background: 'transparent', border: 'none', cursor: 'text', padding: 0,
          }}
        >
          {format ? format(value) : `${value > 0 ? '+' : ''}${value}`}
        </button>
      )}
    </div>
  )
}

// ── Segmentado (neutro; sem verde) ───────────────────────────────────────────

interface SegProps<T extends string> {
  options: { id: T; label: string; title?: string }[]
  value: T
  onChange: (id: T) => void
}

export function Seg<T extends string>({ options, value, onChange }: SegProps<T>) {
  return (
    <div style={{
      display: 'flex', gap: 3, padding: 3, background: 'var(--color-surface)',
      borderRadius: 9, border: '0.5px solid var(--color-border)', width: 'fit-content',
    }}>
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            title={o.title}
            onClick={() => onChange(o.id)}
            style={{
              padding: '5px 12px', borderRadius: 7, fontSize: 12,
              fontWeight: active ? 500 : 400,
              border: `1px solid ${active ? 'var(--color-border-focus)' : 'transparent'}`,
              background: active ? 'var(--color-surface-hover)' : 'transparent',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              transition: 'background var(--duration-fast), color var(--duration-fast)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Chip / IconBtn (neutros) ─────────────────────────────────────────────────

interface ChipProps {
  active?: boolean
  onClick?: () => void
  children: React.ReactNode
  title?: string
  disabled?: boolean
}

export function Chip({ active, onClick, children, title, disabled }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        fontSize: 12, padding: '5px 10px', borderRadius: 8,
        border: `1px solid ${active ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
        background: active ? 'var(--color-surface-hover)' : 'transparent',
        color: disabled ? 'var(--color-text-quaternary)' : active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all var(--duration-fast)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

interface IconBtnProps {
  onClick?: () => void
  title: string
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
  size?: number
}

export function IconBtn({ onClick, title, active, disabled, children, size = 30 }: IconBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        border: `1px solid ${active ? 'var(--color-border-focus)' : 'transparent'}`,
        background: active ? 'var(--color-surface-hover)' : 'transparent',
        color: disabled
          ? 'var(--color-text-quaternary)'
          : active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background var(--duration-fast), color var(--duration-fast)',
      }}
    >
      {children}
    </button>
  )
}

/** Nó verde pequeno — ÚNICO marcador verde de seleção (cards/listas). */
export function ActiveDot({ on }: { on: boolean }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: 999, flexShrink: 0,
      background: on ? 'var(--color-accent-green)' : 'transparent',
      border: on ? 'none' : '1px solid var(--color-border)',
      transition: 'background var(--duration-fast)',
    }} />
  )
}

export function Divider({ vertical }: { vertical?: boolean }) {
  return vertical
    ? <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-border)', flexShrink: 0 }} />
    : <div style={{ height: 1, width: '100%', background: 'var(--color-border)', flexShrink: 0 }} />
}

// ── Seção recolhível do painel contextual ────────────────────────────────────

interface SectionProps {
  title: string
  children: React.ReactNode
  open: boolean
  onToggle: () => void
  right?: React.ReactNode
}

export function Section({ title, children, open, onToggle, right }: SectionProps) {
  return (
    <div style={{ borderBottom: '0.5px solid var(--color-border)' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          style={{
            color: 'var(--color-text-quaternary)', flexShrink: 0,
            transform: open ? 'rotate(90deg)' : 'none', transition: 'transform var(--duration-fast)',
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span style={{ ...sectionLabel, flex: 1 }}>{title}</span>
        {right}
      </div>
      {open && <div style={{ padding: '4px 14px 16px' }}>{children}</div>}
    </div>
  )
}

export const kbdStyle: React.CSSProperties = {
  padding: '1px 5px', borderRadius: 4, fontSize: 10.5, fontFamily: 'inherit',
  border: '0.5px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text-tertiary)',
}
