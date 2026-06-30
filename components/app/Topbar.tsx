'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const TITLES: Record<string, string> = {
  '/app':                             'Dashboard',
  '/app/generate':                    'Renderizar',
  '/app/history':                     'Histórico',
  '/app/billing':                     'Planos',
  '/app/spaces':                      'Spaces',
  '/app/editar':                      'Editar',
  '/app/upscale':                     'Ampliar',
  '/app/video':                       'Animar',
  '/app/conta':                       'Conta',
  '/app/equipe':                      'Equipe',
  '/app/settings/identity':           'Identidade',
}

interface TopbarProps {
  credits: number
}

export default function Topbar({ credits }: TopbarProps) {
  const pathname = usePathname()
  const title = TITLES[pathname] ?? 'spacenode'
  const lowNodes = credits < 10

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 40,
      paddingBottom: 20,
      borderBottom: '0.5px solid var(--color-border)',
    }}>
      <p style={{
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)',
        margin: 0,
      }}>
        {title}
      </p>
      <Link href="/app/billing" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        textDecoration: 'none',
        padding: '5px 11px',
        borderRadius: 'var(--radius-sm)',
        border: `0.5px solid ${lowNodes ? 'var(--color-error-border)' : 'var(--color-border)'}`,
        background: lowNodes ? 'var(--color-error-bg)' : 'var(--color-surface)',
        transition: 'background var(--duration-fast) ease, border-color var(--duration-fast) ease',
      }}>
        <span style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: lowNodes ? 'var(--color-error)' : 'var(--color-accent-green)',
          boxShadow: lowNodes
            ? '0 0 6px var(--color-error-border)'
            : '0 0 6px var(--color-accent-green-glow)',
          flexShrink: 0,
          display: 'inline-block',
        }} />
        <span style={{
          fontSize: 12,
          fontWeight: 500,
          color: lowNodes ? 'var(--color-error)' : 'var(--color-text-primary)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
        }}>
          {credits}
        </span>
        <span style={{
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.005em',
        }}>
          nodes
        </span>
      </Link>
    </div>
  )
}
