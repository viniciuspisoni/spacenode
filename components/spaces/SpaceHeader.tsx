import Link from 'next/link'
import type { Space } from '@/lib/spaces/types'

// ── helpers ────────────────────────────────────────────────────────────────────

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

// ── SpaceHeader ────────────────────────────────────────────────────────────────

interface SpaceHeaderProps {
  space: Space
}

export function SpaceHeader({ space }: SpaceHeaderProps) {
  const vistaCount = space.vista_count ?? 0

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Back link */}
      <Link href="/app/spaces" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'rgba(255,255,255,0.38)',
        textDecoration: 'none', marginBottom: 22,
        letterSpacing: '-0.005em',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Spaces
      </Link>

      {/* Name + meta */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <h1 style={{
              fontSize: 26, fontWeight: 500,
              letterSpacing: '-0.03em', color: '#fafafa',
              lineHeight: 1.1, margin: 0,
            }}>
              {space.name}
            </h1>
            <span style={{
              fontSize: 9, fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.32)',
              background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: '3px 7px',
              flexShrink: 0,
            }}>
              {CATEGORY_LABEL[space.category] ?? space.category}
            </span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            fontSize: 12, color: 'rgba(255,255,255,0.38)',
            letterSpacing: '-0.005em',
          }}>
            <span>
              <span style={{
                fontVariantNumeric: 'tabular-nums', fontWeight: 500,
                color: 'rgba(255,255,255,0.6)',
              }}>
                {vistaCount}
              </span>
              {' '}{vistaCount === 1 ? 'vista' : 'vistas'}
            </span>
            <span style={{
              width: 2, height: 2,
              background: 'rgba(255,255,255,0.18)',
              borderRadius: '50%',
              display: 'inline-block',
            }} />
            <span>
              atualizado {formatRelativeTime(space.last_vista_at ?? space.updated_at)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
