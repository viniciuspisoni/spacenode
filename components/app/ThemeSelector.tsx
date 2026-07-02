'use client'

import { useTheme, type ThemePreference } from '@/lib/theme/ThemeProvider'

const OPTIONS: { value: ThemePreference; label: string; Icon: () => React.ReactElement }[] = [
  {
    value: 'system',
    label: 'Sistema',
    Icon: () => (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M5.5 14h5M8 11.5V14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    value: 'light',
    label: 'Claro',
    Icon: () => (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Escuro',
    Icon: () => (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
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

  return (
    <div
      role="radiogroup"
      aria-label="Aparência"
      style={{
        display: 'inline-flex',
        gap: 3,
        padding: 3,
        borderRadius: 10,
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
      }}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            title={label}
            onClick={() => setTheme(value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: compact ? '5px 9px' : '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '-0.005em',
              fontFamily: 'inherit',
              cursor: 'pointer',
              border: '0.5px solid transparent',
              background: active ? 'var(--color-bg-elevated)' : 'transparent',
              borderColor: active ? 'var(--color-border-strong)' : 'transparent',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              transition: 'background var(--duration-fast) ease, color var(--duration-fast) ease, border-color var(--duration-fast) ease',
            }}
          >
            <Icon />
            {!compact && label}
          </button>
        )
      })}
    </div>
  )
}
