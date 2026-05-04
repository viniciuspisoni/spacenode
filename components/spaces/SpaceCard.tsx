'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Space } from '@/lib/spaces/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

const CATEGORY_LABEL: Record<string, string> = {
  residencial: 'Residencial',
  comercial:   'Comercial',
  conceito:    'Conceito',
}

// ── SpaceCard ─────────────────────────────────────────────────────────────────

interface SpaceCardProps {
  space: Space & { anchor_url?: string | null }
}

export function SpaceCard({ space }: SpaceCardProps) {
  const [hovered, setHovered] = useState(false)
  const vistaCount = space.vista_count ?? 0

  return (
    <Link
      href={`/app/spaces/${space.id}`}
      style={{
        display: 'block',
        background: '#111111',
        border: `0.5px solid ${hovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative' as const,
        boxShadow: hovered
          ? 'inset 0 0.5px 0 rgba(255,255,255,0.10), 0 8px 24px rgba(0,0,0,0.5), 0 16px 48px rgba(0,0,0,0.4)'
          : 'inset 0 0.5px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.3)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        textDecoration: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Anchor image */}
      <div style={{ aspectRatio: '16/10', position: 'relative', overflow: 'hidden' }}>
        {space.anchor_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={space.anchor_url}
            alt={space.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(180deg, #2c3a4c 0%, #1a2330 35%, #0e1218 65%, #1c1810 100%)',
          }} />
        )}

        {/* Vista Mestre badge */}
        <div style={{
          position: 'absolute', top: 11, left: 11,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(12px) saturate(180%)',
          WebkitBackdropFilter: 'blur(12px) saturate(180%)',
          border: '0.5px solid rgba(255,255,255,0.18)',
          color: '#fff',
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: '0.16em',
          textTransform: 'uppercase' as const,
          padding: '4px 9px 4px 8px',
          borderRadius: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: '#30b46c',
            boxShadow: '0 0 0 2.5px rgba(48,180,108,0.25)',
            flexShrink: 0,
          }} />
          Vista Mestre
        </div>

        {/* Vistas count badge */}
        <div style={{
          position: 'absolute', top: 11, right: 11,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(12px) saturate(180%)',
          WebkitBackdropFilter: 'blur(12px) saturate(180%)',
          border: '0.5px solid rgba(255,255,255,0.15)',
          color: '#fff',
          fontSize: 10,
          fontWeight: 500,
          padding: '4px 9px',
          borderRadius: 5,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.005em',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        }}>
          {vistaCount} {vistaCount === 1 ? 'vista' : 'vistas'}
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '16px 18px 18px' }}>
        <div style={{
          fontSize: 14, fontWeight: 500,
          color: '#fafafa',
          marginBottom: 4,
          letterSpacing: '-0.013em',
        }}>
          {space.name}
        </div>
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.42)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          letterSpacing: '-0.005em',
        }}>
          <span>{CATEGORY_LABEL[space.category] ?? space.category}</span>
          <span style={{ width: 2, height: 2, background: 'rgba(255,255,255,0.2)', borderRadius: '50%' }} />
          <span>atualizado {formatRelativeTime(space.last_vista_at ?? space.updated_at)}</span>
        </div>
      </div>
    </Link>
  )
}

// ── NewSpaceCard ───────────────────────────────────────────────────────────────

export function NewSpaceCard() {
  const [hovered, setHovered] = useState(false)

  return (
    <Link
      href="/app/spaces/new"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: hovered ? 'rgba(48,180,108,0.04)' : 'transparent',
        border: `0.5px dashed ${hovered ? '#30b46c' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 14,
        color: hovered ? '#30b46c' : 'rgba(255,255,255,0.42)',
        transition: 'all 0.2s',
        textAlign: 'center',
        padding: '36px 24px',
        cursor: 'pointer',
        textDecoration: 'none',
        aspectRatio: '16/10',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: hovered ? 'rgba(48,180,108,0.14)' : 'rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
        fontSize: 22, fontWeight: 300,
        boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.06)',
        transition: 'background 0.2s',
      }}>
        +
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, letterSpacing: '-0.005em' }}>
        Novo Space
      </div>
      <div style={{
        fontSize: 10.5,
        color: hovered ? 'rgba(48,180,108,0.7)' : 'rgba(255,255,255,0.2)',
        lineHeight: 1.5,
        letterSpacing: '-0.005em',
      }}>
        upload da Vista Mestre
      </div>
    </Link>
  )
}
