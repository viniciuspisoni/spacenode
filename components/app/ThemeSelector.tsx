'use client'

import { useRef } from 'react'
import { useTheme, type ThemePreference } from '@/lib/theme/ThemeProvider'

const OPTIONS: { value: ThemePreference; label: string; Icon: () => React.ReactElement }[] = [
  {
    value: 'system',
    label: 'Sistema',
    Icon: () => (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M5.5 14h5M8 11.5V14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    value: 'light',
    label: 'Claro',
    Icon: () => (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Escuro',
    Icon: () => (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M13.5 9.5A5.7 5.7 0 0 1 6.5 2.5a5.7 5.7 0 1 0 7 7Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
    ),
  },
]

interface ThemeSelectorProps {
  /** 'compact' = só ícones (sidebar); 'full' = ícone + rótulo (Conta) */
  variant?: 'compact' | 'full'
}

export default function ThemeSelector({ variant = 'full' }: ThemeSelectorProps) {
  const { theme, setTheme } = useTheme()
  const compact = variant === 'compact'
  const groupRef = useRef<HTMLDivElement>(null)

  // Radiogroup: setas movem foco e seleção; Home/End vão aos extremos.
  function onKeyDown(e: React.KeyboardEvent) {
    const idx = OPTIONS.findIndex((o) => o.value === theme)
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % OPTIONS.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + OPTIONS.length) % OPTIONS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = OPTIONS.length - 1
    if (next === -1) return
    e.preventDefault()
    setTheme(OPTIONS[next].value)
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
    buttons?.[next]?.focus()
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Aparência"
      className="spn-theme-seg"
      onKeyDown={onKeyDown}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            tabIndex={active ? 0 : -1}
            onClick={() => setTheme(value)}
            className={`spn-theme-seg-btn ${compact ? 'spn-theme-seg-btn--compact' : 'spn-theme-seg-btn--full'}`}
          >
            <Icon />
            {!compact && label}
          </button>
        )
      })}
    </div>
  )
}
