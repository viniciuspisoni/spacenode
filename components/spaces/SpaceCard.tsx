// Card pequeno na grid de listagem de Spaces.

import Link from 'next/link'
import type { SpaceWithCounts } from '@/lib/spaces/types'
import { ENGINES } from '@/lib/engines'

const CATEGORY_LABEL: Record<SpaceWithCounts['category'], string> = {
  residencial: 'Residencial',
  comercial:   'Comercial',
  conceito:    'Conceito',
}

const STATUS_LABEL: Record<SpaceWithCounts['status'], string> = {
  draft:           'Rascunho',
  dna_extracting:  'Extraindo DNA…',
  dna_extracted:   'DNA extraído',
  locked:          'DNA travado',
  archived:        'Arquivado',
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diffMs / 60_000)
  if (min < 1)    return 'agora'
  if (min < 60)   return `há ${min} min`
  const hr   = Math.floor(min / 60)
  if (hr < 24)    return `há ${hr}h`
  const days = Math.floor(hr / 24)
  if (days < 30)  return `há ${days}d`
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

export function SpaceCard({ space }: { space: SpaceWithCounts }) {
  const isLocked   = space.status === 'locked'
  const engineName = ENGINES[space.engine].name

  return (
    <Link
      href={`/app/spaces/${space.id}`}
      className="spn-space-card"
      style={{
        display:         'flex',
        flexDirection:   'column',
        background:      'var(--color-bg-elevated)',
        border:          '0.5px solid var(--color-border)',
        borderRadius:    'var(--radius-lg)',
        overflow:        'hidden',
        textDecoration:  'none',
        color:           'inherit',
      }}
    >
      {/* Vista Mestre thumb */}
      <div style={{
        aspectRatio:  '4 / 3',
        background:   'var(--color-surface)',
        position:     'relative',
        overflow:     'hidden',
      }}>
        {space.vista_mestre_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={space.vista_mestre_url}
            alt={space.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-quaternary)',
            fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            sem vista mestre
          </div>
        )}

        {/* Badge superior — engine + lock */}
        <div style={{
          position: 'absolute', top: 10, left: 10, right: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
            padding: '4px 8px', borderRadius: 5,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
            color: 'rgba(255,255,255,0.88)',
          }}>
            {engineName}
          </span>
          {isLocked && (
            <span style={{
              fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
              padding: '4px 8px', borderRadius: 5,
              background: 'var(--color-accent-green-bg)', color: 'var(--color-accent-green)',
              border: '0.5px solid var(--color-accent-green-border)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <rect x="4" y="11" width="16" height="10" rx="1.5"/>
                <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
              </svg>
              DNA travado
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{
            fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)',
            letterSpacing: '-0.015em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {space.name}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4,
            letterSpacing: '-0.005em',
          }}>
            {CATEGORY_LABEL[space.category]} · {space.vista_count ?? 0} vista{(space.vista_count ?? 0) === 1 ? '' : 's'}
          </div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 10, color: 'var(--color-text-quaternary)',
          letterSpacing: '0.04em', textTransform: 'uppercase',
          paddingTop: 8, borderTop: '0.5px solid var(--color-border)',
        }}>
          <span>{STATUS_LABEL[space.status]}</span>
          <span>{timeAgo(space.last_vista_at ?? space.updated_at)}</span>
        </div>
      </div>
    </Link>
  )
}
