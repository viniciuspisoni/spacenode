'use client'

// Biblioteca de Projetos — corpo client da /app/spaces.
//
// Recebe todos os Spaces do usuário (inclusive arquivados) do server
// component e cuida de busca, filtros, ordenação, métricas e ações de
// gerenciamento (renomear / duplicar / arquivar / restaurar). Dados nunca
// são mockados: a lista vem da view spaces_with_counts sob RLS.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SpaceWithCounts } from '@/lib/spaces/types'
import { getVisualDna } from '@/lib/spaces/dna'
import { ProjectCard } from './ProjectCard'

type FilterId =
  | 'todos'
  | 'residencial'
  | 'comercial'
  | 'conceito'
  | 'dna_travado'
  | 'sem_mestre'
  | 'arquivados'

type SortId = 'recentes' | 'antigos' | 'nome' | 'vistas'

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'todos',       label: 'Todos' },
  { id: 'residencial', label: 'Residencial' },
  { id: 'comercial',   label: 'Comercial' },
  { id: 'conceito',    label: 'Conceito' },
  { id: 'dna_travado', label: 'DNA travado' },
  { id: 'sem_mestre',  label: 'Sem Vista Mestre' },
  { id: 'arquivados',  label: 'Arquivados' },
]

const SORTS: Array<{ id: SortId; label: string }> = [
  { id: 'recentes', label: 'Mais recentes' },
  { id: 'antigos',  label: 'Mais antigos' },
  { id: 'nome',     label: 'Nome A–Z' },
  { id: 'vistas',   label: 'Mais vistas' },
]

// Texto pesquisável de um projeto: nome + categoria + estilo/contexto do DNA
// (aproxima busca por "ambiente" sem precisar de coluna nova).
function searchable(s: SpaceWithCounts): string {
  const dna = getVisualDna(s.dna)
  return [
    s.name,
    s.category,
    dna?.estilo?.nome ?? '',
    ...(dna?.contexto ?? []),
  ].join(' ').toLowerCase()
}

interface ModalState {
  type:  'rename' | 'archive'
  space: SpaceWithCounts
}

export function ProjectsLibrary({ spaces }: { spaces: SpaceWithCounts[] }) {
  const router = useRouter()
  const [query, setQuery]   = useState('')
  const [filter, setFilter] = useState<FilterId>('todos')
  const [sort, setSort]     = useState<SortId>('recentes')
  const [modal, setModal]   = useState<ModalState | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError]   = useState<string | null>(null)

  const active   = useMemo(() => spaces.filter(s => s.status !== 'archived'), [spaces])
  const archived = useMemo(() => spaces.filter(s => s.status === 'archived'), [spaces])

  const metrics = useMemo(() => ({
    projects: active.length,
    vistas:   active.reduce((sum, s) => sum + (s.vista_count ?? 0), 0),
    locked:   active.filter(s => s.status === 'locked').length,
  }), [active])

  const visible = useMemo(() => {
    let list: SpaceWithCounts[]
    switch (filter) {
      case 'arquivados':  list = archived; break
      case 'residencial': list = active.filter(s => s.category === 'residencial'); break
      case 'comercial':   list = active.filter(s => s.category === 'comercial'); break
      case 'conceito':    list = active.filter(s => s.category === 'conceito'); break
      case 'dna_travado': list = active.filter(s => s.status === 'locked'); break
      case 'sem_mestre':  list = active.filter(s => !s.vista_mestre_url); break
      default:            list = active
    }

    const q = query.trim().toLowerCase()
    if (q) list = list.filter(s => searchable(s).includes(q))

    const sorted = [...list]
    switch (sort) {
      case 'antigos':
        sorted.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)); break
      case 'nome':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })); break
      case 'vistas':
        sorted.sort((a, b) => (b.vista_count ?? 0) - (a.vista_count ?? 0)); break
      default:
        sorted.sort((a, b) =>
          +new Date(b.last_vista_at ?? b.updated_at) - +new Date(a.last_vista_at ?? a.updated_at))
    }
    return sorted
  }, [active, archived, filter, query, sort])

  // ── Ações ─────────────────────────────────────────────────────

  async function call(spaceId: string, doFetch: () => Promise<Response>, fallbackMsg: string) {
    setError(null)
    setBusyId(spaceId)
    try {
      const res = await doFetch()
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? fallbackMsg)
      }
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  function openRename(space: SpaceWithCounts) {
    setRenameValue(space.name)
    setModal({ type: 'rename', space })
  }

  async function confirmRename() {
    if (!modal) return
    const name = renameValue.trim()
    if (!name) return
    const { space } = modal
    setModal(null)
    await call(space.id, () => fetch(`/api/spaces/${space.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    }), 'Erro ao renomear projeto')
  }

  async function duplicate(space: SpaceWithCounts) {
    await call(space.id, () => fetch(`/api/spaces/${space.id}/duplicate`, { method: 'POST' }),
      'Erro ao duplicar projeto')
  }

  async function confirmArchive() {
    if (!modal) return
    const { space } = modal
    setModal(null)
    await call(space.id, () => fetch(`/api/spaces/${space.id}`, { method: 'DELETE' }),
      'Erro ao arquivar projeto')
  }

  async function unarchive(space: SpaceWithCounts) {
    await call(space.id, () => fetch(`/api/spaces/${space.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'unarchive' }),
    }), 'Erro ao restaurar projeto')
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 14, gap: 24, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 className="spn-page-title">Meus Spaces</h1>
          <p className="spn-page-sub" style={{ marginTop: 0 }}>
            Cada Space nasce de uma Vista Mestre. O DNA visual mantém geometria,
            materialidade e atmosfera consistentes em todas as gerações.
          </p>
        </div>

        <Link href="/app/spaces/new" className="spn-btn-primary" style={{ flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo projeto
        </Link>
      </div>

      {/* Métricas */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11.5, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em',
        paddingBottom: 20, marginBottom: 20,
        borderBottom: '0.5px solid var(--color-border)',
      }}>
        <span><strong style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{metrics.projects}</strong> projeto{metrics.projects === 1 ? '' : 's'}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span><strong style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{metrics.vistas}</strong> vista{metrics.vistas === 1 ? '' : 's'}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span><strong style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{metrics.locked}</strong> com DNA travado</span>
      </div>

      {/* Busca + ordenação */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 14, flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-text-tertiary)', pointerEvents: 'none',
            }}
          >
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="search"
            className="spn-proj-search"
            placeholder="Buscar projeto…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Buscar projeto por nome, estilo ou ambiente"
          />
        </div>

        <select
          className="spn-proj-sort"
          value={sort}
          onChange={e => setSort(e.target.value as SortId)}
          aria-label="Ordenar projetos"
        >
          {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Filtros */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 24, flexWrap: 'wrap',
      }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            className={`spn-proj-filter${filter === f.id ? ' spn-proj-filter--active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.id === 'arquivados' && archived.length > 0 && (
              <span style={{ marginLeft: 5, opacity: 0.55 }}>{archived.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Erro de ação (rename/duplicate/archive) */}
      {error && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
          background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)',
          color: 'var(--color-error)', fontSize: 13, letterSpacing: '-0.005em',
        }}>
          {error}
        </div>
      )}

      {/* Grid / estados */}
      {spaces.length === 0 ? (
        <EmptyLibrary />
      ) : visible.length === 0 ? (
        <NoResults
          isArchiveFilter={filter === 'arquivados'}
          onClear={() => { setQuery(''); setFilter('todos') }}
        />
      ) : (
        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        }}>
          {visible.map(s => (
            <ProjectCard
              key={s.id}
              space={s}
              busy={busyId === s.id}
              onRename={openRename}
              onDuplicate={duplicate}
              onArchive={space => setModal({ type: 'archive', space })}
              onUnarchive={unarchive}
            />
          ))}
        </div>
      )}

      {/* Modal renomear / arquivar */}
      {modal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setModal(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420,
              background: 'var(--color-bg-elevated)',
              border: '0.5px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-lg)', padding: 24,
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            {modal.type === 'rename' ? (
              <>
                <div style={{
                  fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em', marginBottom: 14,
                }}>
                  Renomear projeto
                </div>
                <input
                  autoFocus
                  type="text"
                  maxLength={80}
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmRename() }}
                  className="spn-proj-search"
                  style={{ maxWidth: 'none', paddingLeft: 12, marginBottom: 18 }}
                  aria-label="Novo nome do projeto"
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" className="spn-btn-ghost" onClick={() => setModal(null)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="spn-btn-primary"
                    disabled={!renameValue.trim()}
                    style={{ opacity: renameValue.trim() ? 1 : 0.5 }}
                    onClick={confirmRename}
                  >
                    Salvar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em', marginBottom: 8,
                }}>
                  Arquivar “{modal.space.name}”?
                </div>
                <p style={{
                  fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.6,
                  marginBottom: 20,
                }}>
                  O projeto sai da biblioteca, mas nada é apagado — vistas, DNA e packs
                  continuam guardados. Você pode restaurar pelo filtro Arquivados.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" className="spn-btn-ghost" onClick={() => setModal(null)}>
                    Cancelar
                  </button>
                  <button type="button" className="spn-btn-primary" onClick={confirmArchive}>
                    Arquivar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── Estados ──────────────────────────────────────────────────────

function EmptyLibrary() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
      background: 'var(--color-bg-elevated)',
      border: '0.5px dashed var(--color-border-strong)',
      borderRadius: 14,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: 'var(--color-accent-green-bg)',
        border: '0.5px solid var(--color-accent-green-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, color: 'var(--color-accent-green)',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>
        </svg>
      </div>
      <div style={{
        fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)',
        marginBottom: 10, letterSpacing: '-0.02em',
      }}>
        Nenhum projeto ainda
      </div>
      <div style={{
        fontSize: 13, color: 'var(--color-text-tertiary)',
        lineHeight: 1.6, marginBottom: 26, maxWidth: 360,
      }}>
        Crie o primeiro projeto, envie a Vista Mestre e o DNA visual fica travado.
        Toda variação preserva esse DNA.
      </div>
      <Link href="/app/spaces/new" className="spn-btn-primary">
        Criar primeiro projeto
      </Link>
    </div>
  )
}

function NoResults({ isArchiveFilter, onClear }: { isArchiveFilter: boolean; onClear: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '64px 24px', textAlign: 'center',
      background: 'var(--color-bg-elevated)',
      border: '0.5px dashed var(--color-border-strong)',
      borderRadius: 14,
    }}>
      <div style={{
        fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)',
        marginBottom: 8, letterSpacing: '-0.02em',
      }}>
        {isArchiveFilter ? 'Nenhum projeto arquivado' : 'Nenhum projeto encontrado'}
      </div>
      <div style={{
        fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.6,
        marginBottom: 20, maxWidth: 340,
      }}>
        {isArchiveFilter
          ? 'Projetos arquivados aparecem aqui e podem ser restaurados a qualquer momento.'
          : 'Ajuste a busca ou os filtros pra encontrar o que procura.'}
      </div>
      <button type="button" className="spn-btn-ghost" onClick={onClear}>
        Limpar busca e filtros
      </button>
    </div>
  )
}

// Estado de erro do carregamento server-side — botão de retry precisa de JS.
export function ProjectsLoadError() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-error-border)',
      borderRadius: 14,
    }}>
      <div style={{
        fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)',
        marginBottom: 8, letterSpacing: '-0.02em',
      }}>
        Não foi possível carregar seus projetos
      </div>
      <div style={{
        fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.6,
        marginBottom: 22, maxWidth: 360,
      }}>
        Algo falhou na conexão com o servidor. Seus projetos estão seguros —
        tente recarregar a página.
      </div>
      <button type="button" className="spn-btn-primary" onClick={() => window.location.reload()}>
        Tentar novamente
      </button>
    </div>
  )
}
