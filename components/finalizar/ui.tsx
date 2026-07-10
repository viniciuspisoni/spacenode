'use client'

// components/finalizar/ui.tsx — primitivos visuais do editor Finalizar.
// Segue o design system: tokens CSS, hairline 0.5px, verde só funcional,
// sliders nativos com accent verde e leitura tabular-nums.

import { useId } from 'react'

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
          fontSize: 12, color: changed ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
          width: 88, flexShrink: 0, cursor: 'default', userSelect: 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, minWidth: 40, accentColor: 'var(--color-accent-green)', height: 14 }}
      />
      <span style={{
        width: 38, textAlign: 'right', fontSize: 11.5, fontVariantNumeric: 'tabular-nums',
        color: changed ? 'var(--color-text-secondary)' : 'var(--color-text-quaternary)', flexShrink: 0,
      }}>
        {format ? format(value) : `${value > 0 ? '+' : ''}${value}`}
      </span>
    </div>
  )
}

// ── Segmentado ───────────────────────────────────────────────────────────────

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
              border: `0.5px solid ${active ? 'var(--color-accent-green-border)' : 'transparent'}`,
              background: active ? 'var(--color-accent-green-bg)' : 'transparent',
              color: active ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
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

// ── Chip / IconBtn ───────────────────────────────────────────────────────────

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
        border: `0.5px solid ${active ? 'var(--color-accent-green-border)' : 'transparent'}`,
        background: active ? 'var(--color-accent-green-bg)' : 'transparent',
        color: disabled
          ? 'var(--color-text-quaternary)'
          : active ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background var(--duration-fast), color var(--duration-fast)',
      }}
    >
      {children}
    </button>
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
          display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px',
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
      {open && <div style={{ padding: '2px 14px 14px' }}>{children}</div>}
    </div>
  )
}

export const kbdStyle: React.CSSProperties = {
  padding: '1px 5px', borderRadius: 4, fontSize: 10.5, fontFamily: 'inherit',
  border: '0.5px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text-tertiary)',
}
