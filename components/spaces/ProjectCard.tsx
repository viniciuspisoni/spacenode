'use client'

// Card da Biblioteca de Projetos (/app/spaces).
//
// Substitui o SpaceCard na listagem: além da capa + metadados, expõe status
// do DNA como informação funcional e ações rápidas no hover (Abrir, Nova
// vista, Renomear, Duplicar, Arquivar). O card inteiro navega pro projeto;
// menu e ações interceptam o clique.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SpaceWithCounts } from '@/lib/spaces/types'
import { ENGINES } from '@/lib/engines'

const CATEGORY_LABEL: Record<SpaceWithCounts['category'], string> = {
  residencial: 'Residencial',
  comercial:   'Comercial',
  conceito:    'Conceito',
}

// Status do DNA como o usuário entende — derivado do estágio real do Space.
type DnaBadge = { label: string; tone: 'green' | 'neutral' | 'muted' | 'error' }

function dnaBadge(space: SpaceWithCounts): DnaBadge {
  if (space.status === 'locked')         return { label: 'DNA travado',      tone: 'green' }
  if (space.status === 'dna_extracting') return { label: 'Em construção',    tone: 'neutral' }
  if (space.status === 'dna_extracted')  return { label: 'Em construção',    tone: 'neutral' }
  if (space.vista_mestre_url)            return { label: 'Em construção',    tone: 'neutral' }
  return { label: 'Sem Vista Mestre', tone: 'muted' }
}

const BADGE_TONE: Record<DnaBadge['tone'], React.CSSProperties> = {
  green: {
    background: 'var(--color-accent-green-bg)',
    color: 'var(--color-accent-green)',
    border: '0.5px solid var(--color-accent-green-border)',
  },
  neutral: {
    background: 'rgba(0,0,0,0.55)',
    color: 'rgba(255,255,255,0.88)',
    border: '0.5px solid rgba(255,255,255,0.14)',
    backdropFilter: 'blur(8px)',
  },
  muted: {
    background: 'rgba(0,0,0,0.55)',
    color: 'rgba(255,255,255,0.6)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(8px)',
  },
  error: {
    background: 'var(--color-error-bg)',
    color: 'var(--color-error)',
    border: '0.5px solid var(--color-error-border)',
  },
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

interface Props {
  space: SpaceWithCounts
  // Ações executadas pelo pai (ProjectsLibrary) — que sabe dar refresh na lista.
  onRename:    (space: SpaceWithCounts) => void
  onDuplicate: (space: SpaceWithCounts) => void
  onArchive:   (space: SpaceWithCounts) => void
  onUnarchive: (space: SpaceWithCounts) => void
  busy:        boolean
}

export function ProjectCard({ space, onRename, onDuplicate, onArchive, onUnarchive, busy }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isArchived = space.status === 'archived'
  const badge      = dnaBadge(space)
  const engineName = ENGINES[space.engine].name
  const vistaCount = space.vista_count ?? 0

  useEffect(() => {
    if (!menuOpen) return
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  function menuAction(fn: () => void) {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setMenuOpen(false)
      fn()
    }
  }

  return (
    <div
      className="spn-space-card"
      role="link"
      tabIndex={0}
      aria-label={`Abrir projeto ${space.name}`}
      onClick={() => router.push(`/app/spaces/${space.id}`)}
      onKeyDown={e => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
          router.push(`/app/spaces/${space.id}`)
        }
      }}
      style={{
        display:        'flex',
        flexDirection:  'column',
        background:     'var(--color-bg-elevated)',
        border:         '0.5px solid var(--color-border)',
        borderRadius:   'var(--radius-lg)',
        overflow:       'hidden',
        cursor:         'pointer',
        position:       'relative',
        opacity:        isArchived ? 0.72 : 1,
      }}
    >
      {/* Capa */}
      <div style={{
        aspectRatio: '4 / 3',
        background:  'var(--color-surface)',
        position:    'relative',
        overflow:    'hidden',
      }}>
        {space.vista_mestre_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={space.vista_mestre_url}
            alt={space.name}
            loading="lazy"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, color: 'var(--color-text-quaternary)',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.5-3.5L6 23"/>
            </svg>
            <span style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              sem capa
            </span>
          </div>
        )}

        {/* Badges — engine + DNA */}
        <div style={{
          position: 'absolute', top: 10, left: 10,
          display: 'flex', alignItems: 'center', gap: 6,
          maxWidth: 'calc(100% - 52px)',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
            padding: '4px 8px', borderRadius: 5, flexShrink: 0,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
            color: 'rgba(255,255,255,0.88)',
          }}>
            {engineName}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
            padding: '4px 8px', borderRadius: 5,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            whiteSpace: 'nowrap',
            ...BADGE_TONE[badge.tone],
          }}>
            {badge.tone === 'green' && (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <rect x="4" y="11" width="16" height="10" rx="1.5"/>
                <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
              </svg>
            )}
            {isArchived ? 'Arquivado' : badge.label}
          </span>
        </div>

        {/* Menu kebab */}
        <div ref={menuRef} onClick={e => e.stopPropagation()}>
          <button
            type="button"
            className="spn-proj-kebab"
            data-open={menuOpen}
            aria-label={`Ações do projeto ${space.name}`}
            aria-expanded={menuOpen}
            disabled={busy}
            onClick={e => { e.preventDefault(); setMenuOpen(o => !o) }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>
            </svg>
          </button>

          {menuOpen && (
            <div className="spn-proj-menu" role="menu">
              <button type="button" role="menuitem" className="spn-proj-menu-item" onClick={menuAction(() => onRename(space))}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                </svg>
                Renomear
              </button>
              <button type="button" role="menuitem" className="spn-proj-menu-item" onClick={menuAction(() => onDuplicate(space))}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Duplicar
              </button>
              {isArchived ? (
                <button type="button" role="menuitem" className="spn-proj-menu-item" onClick={menuAction(() => onUnarchive(space))}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8v13h18V8M1 3h22v5H1zM12 17v-6M9 14l3-3 3 3"/>
                  </svg>
                  Restaurar
                </button>
              ) : (
                <button type="button" role="menuitem" className="spn-proj-menu-item spn-proj-menu-item--danger" onClick={menuAction(() => onArchive(space))}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8v13h18V8M1 3h22v5H1zM10 12h4"/>
                  </svg>
                  Arquivar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Ações rápidas no hover */}
        {!isArchived && (
          <div className="spn-proj-actions" onClick={e => e.stopPropagation()}>
            <Link href={`/app/spaces/${space.id}`} className="spn-proj-action spn-proj-action--primary">
              Abrir projeto
            </Link>
            <Link href={`/app/spaces/${space.id}`} className="spn-proj-action">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nova vista
            </Link>
          </div>
        )}
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
            {CATEGORY_LABEL[space.category]} · {vistaCount} vista{vistaCount === 1 ? '' : 's'}
          </div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 10, color: 'var(--color-text-quaternary)',
          letterSpacing: '0.04em', textTransform: 'uppercase',
          paddingTop: 8, borderTop: '0.5px solid var(--color-border)',
        }}>
          <span>Atualizado {timeAgo(space.last_vista_at ?? space.updated_at)}</span>
        </div>
      </div>
    </div>
  )
}
