'use client'

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getUpscaleDisplayLabel, getVideoDisplayLabel } from '@/lib/renderLabels'
import { createClient } from '@/lib/supabase/client'
import { toMediaProxyUrl } from '@/lib/storage/media-url'
import { GenerationDetailDrawer } from '@/components/history/GenerationDetailDrawer'
import { authorInitials, type GenerationKind } from '@/lib/history/generation-detail'
import type { Edit } from '@/lib/spaces/types'
import { BLOCOS3D_ENGINES } from '@/lib/blocos3d/config'
import type { Blocos3DJobView } from '@/lib/blocos3d/types'

type HistoryTab = 'renders' | 'edits' | 'vistas' | 'finalizar' | 'blocos3d'

// Espelho de RENDER_LIST_COLUMNS (lib/history/redact.ts): a listagem NÃO
// carrega prompt/fal_request_id/config_snapshot — o prompt final é
// proprietário e não chega ao browser. Detalhes ricos vêm do drawer.
interface Render {
  id: string
  user_id?: string | null
  input_url: string
  output_url: string | null
  /** Derivado WebP ~1600px do master (grids); download/lightbox seguem no master. */
  preview_url?: string | null
  ambient: string
  style: string
  lighting: string
  status: string
  cost_credits: number
  nodes_charged?: number | null
  resolution?: string | null
  engine?: string | null
  model?: string | null
  folder_id?: string | null
  created_at: string
}

// Perfil resumido para o chip "Gerado por" (autoria na grid).
export interface AuthorInfo {
  name:  string | null
  email: string | null
}

// parent_id null = pasta de topo (ex.: cliente); preenchido = subpasta (ex.:
// projeto do cliente). Hierarquia limitada a 2 níveis — ver /api/folders.
interface Folder {
  id: string
  name: string
  parent_id: string | null
  created_at: string
}

// Contagem "cheia" de uma pasta de topo: renders direto nela + renders de
// todas as suas subpastas. Dá pro usuário uma visão do volume total do
// cliente sem precisar abrir cada subpasta.
function aggregateFolderCount(folderId: string, folders: Folder[], counts: Record<string, number>): number {
  const own = counts[folderId] ?? 0
  const childrenSum = folders
    .filter(f => f.parent_id === folderId)
    .reduce((sum, child) => sum + (counts[child.id] ?? 0), 0)
  return own + childrenSum
}

interface FolderCounts {
  counts:  Record<string, number>
  unfiled: number
  total:   number
}

interface Props {
  renders:       Render[]       // primeira página, mais recentes primeiro
  folderCounts:  FolderCounts   // contagens reais (server-side) para os chips
  pageSize:      number         // tamanho da página vinda do server
  credits:       number
  folders:       Folder[]
  authors:       Record<string, AuthorInfo>  // user_id → perfil (autoria/equipes)
  currentUserId: string
}

type FolderFilter = 'all' | 'none' | string  // string = folder id

function qualityLabel(nodes: number): string | null {
  if (nodes === 4)  return 'HD'
  if (nodes === 8)  return '2K'
  if (nodes === 20) return '4K'
  return null
}

function engineLabel(model: string | null | undefined): string | null {
  if (!model) return null
  if (model.includes('nano-banana-pro') || model.includes('vega'))   return 'Vega'
  if (model.includes('gpt-image')       || model.includes('quasar')) return 'Quasar'
  if (model.includes('nano-banana')     || model.includes('pulsar')) return 'Pulsar'
  return null
}

// Renders gravados pelo fluxo atual usam nodes_charged/engine; os antigos,
// cost_credits/model. Lê os dois para o histórico nunca quebrar.
function renderNodes(r: Render): number {
  return r.nodes_charged ?? r.cost_credits ?? 0
}

function renderEngineRaw(r: Render): string | null {
  return r.engine ?? r.model ?? null
}

// Módulo de origem derivado do ambient (renders concentram Renderizar,
// Ampliar e Animar na mesma tabela).
function renderModule(r: Render): 'render' | 'upscale' | 'video' {
  if (r.ambient === 'upscale') return 'upscale'
  if (r.ambient === 'video')   return 'video'
  return 'render'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function inferExtension(url: string, isVideo: boolean): string {
  if (isVideo) return 'mp4'
  const m = url.match(/\.(jpe?g|png|webp|mp4)(?:\?|$)/i)
  return m ? m[1].toLowerCase() : 'jpg'
}

function buildFilename(r: Render, suffix: string | number): string {
  const isVideo = r.ambient === 'video'
  // Vídeo: o arquivo gerado fica em output_url (input_url é a imagem base).
  const url = (isVideo ? (r.output_url ?? r.input_url) : r.output_url) ?? ''
  const ext = inferExtension(url, isVideo)
  const base = (r.ambient || r.style || 'render')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'render'
  return `spacenode-${base}-${suffix}.${ext}`
}

// Download de um único render pelo proxy /api/download (Content-Disposition:
// attachment) — baixa direto, sem abrir aba nova nem sair do site.
function downloadHref(r: Render): string | null {
  const isVideo = r.ambient === 'video'
  const target  = isVideo ? (r.output_url ?? r.input_url) : r.output_url
  if (!target) return null
  return `/api/download?url=${encodeURIComponent(target)}&filename=${encodeURIComponent(buildFilename(r, r.id.slice(0, 8)))}`
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export function HistoryClient({
  renders: initialRenders,
  folderCounts,
  pageSize,
  credits,
  folders,
  authors,
  currentUserId,
}: Props) {
  const router = useRouter()

  // ── Paginação "Carregar mais" ───────────────────────────────────────────────
  // `loaded` é a lista visível: começa com a primeira página vinda do server e
  // cresce conforme o usuário pede mais. Resetamos para `initialRenders` se as
  // props mudarem (router.refresh() após excluir/mover, por ex.).
  const [loaded,      setLoaded]      = useState<Render[]>(initialRenders)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted,   setExhausted]   = useState(initialRenders.length < pageSize)

  useEffect(() => {
    // Intencional: sincroniza a lista visível com props vindas do server após
    // router.refresh() (ex.: depois de excluir/mover renders). O "cascading
    // render" que a regra alerta é exatamente o efeito desejado aqui.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(initialRenders)
    setExhausted(initialRenders.length < pageSize)
  }, [initialRenders, pageSize])

  const hasMore = !exhausted && loaded.length < folderCounts.total

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    const last = loaded[loaded.length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/renders/list?cursor=${encodeURIComponent(last.created_at)}`)
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Falha ao carregar' }))
        alert(error || 'Falha ao carregar')
        return
      }
      const { renders: next, pageSize: serverPageSize } = await res.json() as { renders: Render[], pageSize: number }
      setLoaded(prev => [...prev, ...next])
      if (next.length < serverPageSize) setExhausted(true)
    } catch {
      alert('Falha ao carregar')
    } finally {
      setLoadingMore(false)
    }
  }

  const [search,        setSearch]        = useState('')
  const [typeFilter,    setTypeFilter]    = useState('all')
  const [sort,          setSort]          = useState<'desc' | 'asc'>('desc')
  const [folderFilter,  setFolderFilter]  = useState<FolderFilter>('all')

  // Filtros técnicos do arquivo do projeto. Módulo/engine/autor já ativos;
  // TODO(filters): resolução, status e período seguem o mesmo padrão — basta
  // adicionar o estado + cláusula no `filtered` + <select> nos controls.
  const [moduleFilter, setModuleFilter] = useState<'all' | 'render' | 'upscale' | 'video'>('all')
  const [engineFilter, setEngineFilter] = useState('all')
  const [authorFilter, setAuthorFilter] = useState('all')

  // ── Tabs do histórico ──────────────────────────────────────────────────────
  const [historyTab, setHistoryTab] = useState<HistoryTab>('renders')

  // ── Painel "Detalhes da geração" ───────────────────────────────────────────
  const [detail, setDetail] = useState<{ kind: GenerationKind; id: string } | null>(null)
  const openDetail = useCallback((kind: GenerationKind, id: string) => setDetail({ kind, id }), [])

  // ── Modo de seleção ─────────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false)
  const [selected,   setSelected]   = useState<Set<string>>(() => new Set())
  const [busy,       setBusy]       = useState(false)
  const [moveOpen,   setMoveOpen]   = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return loaded
      .filter(r => {
        if (folderFilter === 'none' && r.folder_id) return false
        if (folderFilter !== 'all' && folderFilter !== 'none' && r.folder_id !== folderFilter) return false
        if (typeFilter !== 'all' && r.style !== typeFilter) return false
        if (moduleFilter !== 'all' && renderModule(r) !== moduleFilter) return false
        if (engineFilter !== 'all' && engineLabel(renderEngineRaw(r)) !== engineFilter) return false
        if (authorFilter !== 'all' && r.user_id !== authorFilter) return false
        if (q) return (r.ambient + ' ' + r.lighting + ' ' + r.style).toLowerCase().includes(q)
        return true
      })
      .sort((a, b) => {
        const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        return sort === 'desc' ? diff : -diff
      })
  }, [loaded, search, typeFilter, sort, folderFilter, moduleFilter, engineFilter, authorFilter])

  // Autores distintos entre os renders carregados — o filtro por autor só
  // aparece quando o projeto tem mais de um (cenário de equipes).
  const distinctAuthors = useMemo(() => {
    const ids = new Set<string>()
    for (const r of loaded) if (r.user_id) ids.add(r.user_id)
    return Array.from(ids)
  }, [loaded])

  // ── Hierarquia de pastas (1 nível: pasta do cliente > subpasta de projeto) ──
  const topFolders = useMemo(() => folders.filter(f => !f.parent_id), [folders])
  const subfoldersByParent = useMemo(() => {
    const map: Record<string, Folder[]> = {}
    for (const f of folders) {
      if (f.parent_id) (map[f.parent_id] ??= []).push(f)
    }
    return map
  }, [folders])
  const activeFolder = useMemo(() => folders.find(f => f.id === folderFilter) ?? null, [folders, folderFilter])
  // Pasta de topo cujas subpastas devem aparecer na segunda fileira: a
  // própria (se o filtro ativo é uma pasta de topo) ou a pasta-mãe (se o
  // filtro ativo é uma subpasta) — assim clicar num chip de topo "entra"
  // nele, e o chip da pasta-mãe continua visível/clicável pra "subir" de novo.
  const expandedParentId = activeFolder ? (activeFolder.parent_id ?? activeFolder.id) : null

  const selectedRenders = useMemo(
    () => loaded.filter(r => selected.has(r.id)),
    [loaded, selected],
  )

  const enterSelectMode = () => { setSelectMode(true); setSelected(new Set()) }
  const exitSelectMode  = () => { setSelectMode(false); setSelected(new Set()) }

  const toggleOne = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // Atalho: duplo clique num card (fora do modo seleção) entra em modo
  // seleção já com aquele card marcado.
  const activateSelectWith = useCallback((id: string) => {
    setSelectMode(true)
    setSelected(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const selectAllVisible = () => setSelected(new Set(filtered.map(r => r.id)))
  const clearSelection   = () => setSelected(new Set())

  // ── Ações em lote ───────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (selectedRenders.length === 0 || busy) return
    setBusy(true)
    try {
      let i = 0
      for (const r of selectedRenders) {
        const isVideo = r.ambient === 'video'
        // Vídeo gerado mora em output_url; input_url é a foto base.
        const target  = isVideo ? (r.output_url ?? r.input_url) : r.output_url
        if (!target) continue
        const a = document.createElement('a')
        a.href = `/api/download?url=${encodeURIComponent(target)}&filename=${encodeURIComponent(buildFilename(r, i + 1))}`
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
        i++
        if (i < selectedRenders.length) await sleep(350)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (selectedRenders.length === 0 || busy) return
    const n = selectedRenders.length
    const ok = window.confirm(
      `Excluir ${n} render${n !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`
    )
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch('/api/renders/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: [...selected], action: 'delete' }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Falha ao excluir' }))
        alert(error || 'Falha ao excluir')
        return
      }
      exitSelectMode()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleMove = async (folderId: string | null) => {
    if (selectedRenders.length === 0 || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/renders/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: [...selected], action: 'move', folder_id: folderId }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Falha ao mover' }))
        alert(error || 'Falha ao mover')
        return
      }
      setMoveOpen(false)
      exitSelectMode()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  // ── Pastas: criar e excluir ────────────────────────────────────────────────
  // parentId presente = cria SUBpasta dentro dela; ausente = pasta de topo.
  const createFolder = async (initialName?: string, parentId?: string | null): Promise<Folder | null> => {
    const isSubfolder = parentId != null
    const name = (initialName ?? window.prompt(isSubfolder ? 'Nome da subpasta:' : 'Nome da pasta:'))?.trim()
    if (!name) return null
    setBusy(true)
    try {
      const res = await fetch('/api/folders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(isSubfolder ? { name, parent_id: parentId } : { name }),
      })
      if (!res.ok) {
        const fallback = isSubfolder ? 'Falha ao criar subpasta' : 'Falha ao criar pasta'
        const { error } = await res.json().catch(() => ({ error: fallback }))
        alert(error || fallback)
        return null
      }
      const { folder } = await res.json()
      router.refresh()
      return folder as Folder
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    // Subpastas são excluídas em cascata pelo banco (ON DELETE CASCADE) —
    // avisamos disso quando a pasta tem filhas. Renders nunca são apagados,
    // só ficam sem pasta.
    const childIds     = (subfoldersByParent[folderId] ?? []).map(c => c.id)
    const directCount   = folderCounts.counts[folderId] ?? 0
    const cascadeCount  = directCount + childIds.reduce((sum, id) => sum + (folderCounts.counts[id] ?? 0), 0)
    const msg = childIds.length > 0
      ? `Excluir a pasta "${folderName}" e ${childIds.length} subpasta${childIds.length !== 1 ? 's' : ''}? ${cascadeCount} render${cascadeCount !== 1 ? 's' : ''} dentro delas ficará${cascadeCount !== 1 ? 'ão' : ''} sem pasta (não serão apagados).`
      : directCount > 0
        ? `Excluir a pasta "${folderName}"? Os ${directCount} render${directCount !== 1 ? 's' : ''} dentro dela ficarão sem pasta (não serão apagados).`
        : `Excluir a pasta "${folderName}"?`
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/folders/${folderId}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Falha ao excluir pasta' }))
        alert(error || 'Falha ao excluir pasta')
        return
      }
      if (folderFilter === folderId || childIds.includes(folderFilter)) setFolderFilter('all')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id))

  return (
    <div style={S.main}>

      {/* ── Topbar ── */}
      <div style={S.topbar}>
        <span style={S.pageTitle}>HISTÓRICO</span>
        <div style={S.creditsChip}>
          <span style={S.creditDot} />
          <span style={S.creditNum}>{credits}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>nodes</span>
        </div>
      </div>

      <div style={{ ...S.content, paddingBottom: selected.size > 0 ? 120 : 64 }}>

        {/* ── Header ── */}
        <div style={S.header}>
          <div>
            <h1 style={S.headerTitle}>Histórico</h1>
            <p style={S.headerSub}>
              {historyTab === 'renders'   && 'Seus renders salvos e prontos para reutilizar.'}
              {historyTab === 'edits'     && 'Edições localizadas geradas no Editar.'}
              {historyTab === 'vistas'    && 'Vistas geradas dentro dos seus Spaces.'}
              {historyTab === 'finalizar' && 'Versões exportadas dos seus projetos do Finalizar.'}
              {historyTab === 'blocos3d'  && 'Modelos 3D gerados no Blocos 3D.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {historyTab === 'renders' && folderCounts.total > 0 && !selectMode && (
              <span style={S.count}>{filtered.length} render{filtered.length !== 1 ? 's' : ''}</span>
            )}
            {historyTab === 'renders' && folderCounts.total > 0 && (
              selectMode ? (
                <>
                  <button
                    onClick={allVisibleSelected ? clearSelection : selectAllVisible}
                    style={S.headerGhostBtn}
                  >
                    {allVisibleSelected ? 'Limpar' : 'Selecionar todos'}
                  </button>
                  <button onClick={exitSelectMode} style={S.headerGhostBtn}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button onClick={enterSelectMode} style={S.headerGhostBtn}>
                  Selecionar
                </button>
              )
            )}
          </div>
        </div>

        {/* ── Tabs (Renders / Edições / Vistas / Finalizar / Blocos 3D) ── */}
        <div style={{
          display: 'flex', gap: 4, padding: 4,
          background: 'var(--color-surface)', borderRadius: 10,
          marginBottom: 16, maxWidth: 680,
        }}>
          {(['renders', 'edits', 'vistas', 'finalizar', 'blocos3d'] as HistoryTab[]).map(t => {
            const active = historyTab === t
            const label = t === 'renders' ? 'Renders' : t === 'edits' ? 'Edições' : t === 'vistas' ? 'Vistas' : t === 'finalizar' ? 'Finalizar' : 'Blocos 3D'
            return (
              <button
                key={t}
                onClick={() => setHistoryTab(t)}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 7,
                  background: active ? 'var(--color-bg-elevated)' : 'transparent',
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em',
                  cursor: 'pointer',
                  boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
                  border: 'none',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* ── Tabs alternativas: Edições + Vistas + Finalizar + Blocos 3D ── */}
        {historyTab === 'edits'     && <EditsTabView  authors={authors} onOpenDetail={openDetail} />}
        {historyTab === 'vistas'    && <VistasTabView authors={authors} onOpenDetail={openDetail} />}
        {historyTab === 'finalizar' && <FinalizarTabView />}
        {historyTab === 'blocos3d'  && <Blocos3DTabView />}

        {/* ── Controls (só renderiza na tab Renders) ── */}
        {historyTab === 'renders' && folderCounts.total > 0 && (
          <div style={S.controls}>
            <div style={S.searchWrap}>
              <svg style={S.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Buscar renders…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={S.searchInput}
              />
              {search && (
                <button onClick={() => setSearch('')} style={S.clearBtn}>✕</button>
              )}
            </div>

            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={S.select}>
              <option value="all">Todos os tipos</option>
              <option value="exterior">Exterior</option>
              <option value="interior">Interior</option>
            </select>

            <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value as typeof moduleFilter)} style={S.select}>
              <option value="all">Todos os módulos</option>
              <option value="render">Renderizar</option>
              <option value="upscale">Ampliar</option>
              <option value="video">Animar</option>
            </select>

            <select value={engineFilter} onChange={e => setEngineFilter(e.target.value)} style={S.select}>
              <option value="all">Todas as engines</option>
              <option value="Vega">Vega</option>
              <option value="Quasar">Quasar</option>
              <option value="Pulsar">Pulsar</option>
            </select>

            {distinctAuthors.length > 1 && (
              <select value={authorFilter} onChange={e => setAuthorFilter(e.target.value)} style={S.select}>
                <option value="all">Todos os autores</option>
                {distinctAuthors.map(uid => (
                  <option key={uid} value={uid}>
                    {authors[uid]?.name || authors[uid]?.email || 'Autor não registrado'}
                    {uid === currentUserId ? ' (você)' : ''}
                  </option>
                ))}
              </select>
            )}

            <select value={sort} onChange={e => setSort(e.target.value as 'desc' | 'asc')} style={S.select}>
              <option value="desc">Mais recentes</option>
              <option value="asc">Mais antigos</option>
            </select>
          </div>
        )}

        {/* ── Folder chips (só na tab Renders) — pastas de topo, contagem agregada
             (inclui subpastas) ── */}
        {historyTab === 'renders' && folderCounts.total > 0 && (
          <div style={{ ...S.chipRow, marginBottom: expandedParentId ? 10 : S.chipRow.marginBottom }}>
            <FolderChip
              active={folderFilter === 'all'}
              onClick={() => setFolderFilter('all')}
              label="Todos"
              count={folderCounts.total}
            />
            <FolderChip
              active={folderFilter === 'none'}
              onClick={() => setFolderFilter('none')}
              label="Sem pasta"
              count={folderCounts.unfiled}
            />
            {topFolders.map(f => (
              <FolderChip
                key={f.id}
                active={folderFilter === f.id}
                expanded={expandedParentId === f.id}
                onClick={() => setFolderFilter(f.id)}
                onDelete={() => handleDeleteFolder(f.id, f.name)}
                label={f.name}
                count={aggregateFolderCount(f.id, folders, folderCounts.counts)}
              />
            ))}
            <button onClick={() => createFolder()} style={S.chipAdd} disabled={busy}>
              <PlusIcon /> Nova pasta
            </button>
          </div>
        )}

        {/* ── Subpastas da pasta de topo ativa — organiza projetos dentro do
             cliente. Só aparece quando o filtro atual é essa pasta (ou uma
             das subpastas dela). ── */}
        {historyTab === 'renders' && expandedParentId && (
          <div style={S.subchipRow}>
            <span style={S.subchipHint}>
              Subpastas de {topFolders.find(f => f.id === expandedParentId)?.name}
            </span>
            {(subfoldersByParent[expandedParentId] ?? []).map(sf => (
              <FolderChip
                key={sf.id}
                active={folderFilter === sf.id}
                onClick={() => setFolderFilter(sf.id)}
                onDelete={() => handleDeleteFolder(sf.id, sf.name)}
                label={sf.name}
                count={folderCounts.counts[sf.id] ?? 0}
              />
            ))}
            <button onClick={() => createFolder(undefined, expandedParentId)} style={S.chipAdd} disabled={busy}>
              <PlusIcon /> Nova subpasta
            </button>
          </div>
        )}

        {/* ── Grid / Empty (só na tab Renders) ── */}
        {historyTab === 'renders' && folderCounts.total === 0 ? (
          <EmptyState />
        ) : historyTab === 'renders' ? (
          <>
            {filtered.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
                  {hasMore
                    ? 'Sem resultados nos renders carregados.'
                    : (search
                        ? <>Nenhum resultado para &ldquo;{search}&rdquo;</>
                        : 'Nada por aqui ainda.')}
                </div>
                {!hasMore && (
                  <button
                    onClick={() => { setSearch(''); setTypeFilter('all'); setFolderFilter('all') }}
                    style={S.clearFilterBtn}
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <div style={S.grid}>
                {filtered.map(r => (
                  <RenderCard
                    key={r.id}
                    render={r}
                    author={r.user_id ? authors[r.user_id] ?? null : null}
                    selectMode={selectMode}
                    selected={selected.has(r.id)}
                    onToggle={() => toggleOne(r.id)}
                    onActivateSelect={() => activateSelectWith(r.id)}
                    onOpenDetail={() => openDetail('render', r.id)}
                  />
                ))}
              </div>
            )}

            {hasMore && (
              <div style={S.loadMoreWrap}>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={S.loadMoreBtn}
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
                <div style={S.loadMoreCount}>
                  {loaded.length} de {folderCounts.total} carregados
                </div>
              </div>
            )}
          </>
        ) : null}

      </div>

      {/* ── Action bar (modo seleção) ── */}
      {selected.size > 0 && (
        <div style={S.actionBar}>
          <div style={S.actionBarInner}>
            <span style={S.actionBarCount}>
              {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleDownload} disabled={busy} style={S.actionPrimary}>
                <DownloadIcon /> Baixar
              </button>
              <button onClick={() => setMoveOpen(true)} disabled={busy} style={S.actionSecondary}>
                <FolderIcon /> Mover
              </button>
              <button onClick={handleDelete} disabled={busy} style={S.actionDanger}>
                <TrashIcon /> Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Painel "Detalhes da geração" ── */}
      {detail && (
        <GenerationDetailDrawer
          kind={detail.kind}
          id={detail.id}
          onClose={() => setDetail(null)}
        />
      )}

      {/* ── Modal mover para pasta ── */}
      {moveOpen && (
        <MoveModal
          folders={folders}
          count={selected.size}
          busy={busy}
          onClose={() => setMoveOpen(false)}
          onPick={handleMove}
          onCreate={async () => {
            const f = await createFolder()
            if (f) await handleMove(f.id)
          }}
        />
      )}
    </div>
  )
}

// ── AuthorChip ─────────────────────────────────────────────────────────────────
//
// Indicação discreta de autoria na thumb (cenário de equipes: mais de um
// usuário gerando no mesmo projeto/escritório). Iniciais + tooltip nativo.

function AuthorChip({ author }: { author: AuthorInfo | null }) {
  const name = author?.name || author?.email || null
  return (
    <span
      title={name ? `Gerado por ${name}` : 'Autor não registrado'}
      style={{
        position: 'absolute', bottom: 8, left: 8, zIndex: 2,
        width: 20, height: 20, borderRadius: '50%',
        background: 'var(--color-scrim)', backdropFilter: 'blur(4px)',
        border: '0.5px solid rgba(255,255,255,0.22)',
        color: 'rgba(255,255,255,0.85)',
        fontSize: 7.5, fontWeight: 600, letterSpacing: '0.04em',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {name ? authorInitials({ name: author!.name, email: author!.email }) : '—'}
    </span>
  )
}

// ── FolderChip ─────────────────────────────────────────────────────────────────

function FolderChip({
  active, expanded, onClick, onDelete, label, count,
}: {
  active:    boolean
  expanded?: boolean  // pasta de topo cujas subpastas estão visíveis abaixo (sem ser a seleção exata)
  onClick:   () => void
  onDelete?: () => void
  label:     string
  count:     number
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      style={{ ...S.chip, ...(expanded && !active ? S.chipExpanded : null), ...(active ? S.chipActive : null) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button onClick={onClick} style={S.chipBtn}>
        <span>{label}</span>
        <span style={S.chipCount}>{count}</span>
      </button>
      {onDelete && (active || hover) && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={S.chipDelete}
          title="Excluir pasta"
          aria-label="Excluir pasta"
        >
          ✕
        </button>
      )}
    </div>
  )
}

// ── EditsTabView ───────────────────────────────────────────────────────────────

function EditsTabView({
  authors, onOpenDetail,
}: {
  authors: Record<string, AuthorInfo>
  onOpenDetail: (kind: GenerationKind, id: string) => void
}) {
  const [items, setItems] = useState<Edit[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch('/api/edits')
      .then(r => r.ok ? r.json() : null)
      .then(d => setItems((d?.edits ?? []) as Edit[]))
      .finally(() => setLoading(false))
  }, [])

  if (loading)             return <TabLoading />
  if ((items ?? []).length === 0) return (
    <TabEmpty
      message="Sem edições ainda."
      action={{ href: '/app/editar', label: 'Abrir Editar →' }}
    />
  )

  return (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    }}>
      {items!.map(it => (
        <div
          key={it.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpenDetail('edit', it.id)}
          onKeyDown={e => { if (e.key === 'Enter') onOpenDetail('edit', it.id) }}
          title="Ver detalhes da geração"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border)',
            borderRadius: 12, overflow: 'hidden',
            color: 'inherit', cursor: 'pointer',
            display: 'block',
          }}
        >
          <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface)', position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.result_image_url} alt={it.prompt}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <AuthorChip author={it.user_id ? authors[it.user_id] ?? null : null} />
          </div>
          <div style={{ padding: '10px 12px 12px' }}>
            <div style={{
              fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
              letterSpacing: '-0.005em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {it.prompt}
            </div>
            <div style={{
              fontSize: 10, color: 'var(--color-text-quaternary)',
              letterSpacing: '0.02em', marginTop: 4,
            }}>
              {it.quality.toUpperCase()} · {new Date(it.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── VistasTabView ──────────────────────────────────────────────────────────────

// Subconjunto de Vista que a grid usa. A projeção é EXPLÍCITA de propósito:
// select('*') entregaria ao browser prompt final proprietário, fal_request_id,
// model/provider e preservation_check — exatamente o que /api/history/detail
// redige. A lista só carrega o que renderiza.
interface VistaListItem {
  id:         string
  space_id:   string
  user_id:    string
  image_url:  string | null
  axis_label: string | null
  quality:    string
  is_edited:  boolean
  created_at: string
}

function VistasTabView({
  authors, onOpenDetail,
}: {
  authors: Record<string, AuthorInfo>
  onOpenDetail: (kind: GenerationKind, id: string) => void
}) {
  const [items, setItems] = useState<VistaListItem[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sb = createClient()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    sb.from('vistas')
      .select('id, space_id, user_id, image_url, axis_label, quality, is_edited, created_at')
      .eq('status', 'completed')
      .not('image_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => setItems((data ?? []) as VistaListItem[]))
      .then(undefined, () => setItems([]))
      // .finally(() => setLoading(false))  -- supabase-js 2.x query doesn't have finally
    // Workaround pra setLoading sem finally: marca terminado quando items mudam
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (items !== null) setLoading(false)
  }, [items])

  if (loading)                       return <TabLoading />
  if ((items ?? []).length === 0)    return (
    <TabEmpty
      message="Sem vistas geradas em projetos ainda."
      action={{ href: '/app/spaces', label: 'Abrir Meus projetos →' }}
    />
  )

  return (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    }}>
      {items!.map(v => (
        <div
          key={v.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpenDetail('vista', v.id)}
          onKeyDown={e => { if (e.key === 'Enter') onOpenDetail('vista', v.id) }}
          title="Ver detalhes da geração"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border)',
            borderRadius: 12, overflow: 'hidden',
            color: 'inherit', cursor: 'pointer',
            display: 'block', position: 'relative',
          }}
        >
          <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface)', position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={toMediaProxyUrl(v.image_url) ?? undefined} alt={v.axis_label ?? ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <AuthorChip author={v.user_id ? authors[v.user_id] ?? null : null} />
            {v.is_edited && (
              <div style={{
                position: 'absolute', top: 8, right: 8,
                padding: '3px 8px', borderRadius: 4,
                background: 'var(--color-accent-green)', color: '#000',
                fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                editada
              </div>
            )}
          </div>
          <div style={{ padding: '10px 12px 12px' }}>
            <div style={{
              fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
              letterSpacing: '-0.005em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {v.axis_label ?? 'Vista'}
            </div>
            <div style={{
              fontSize: 10, color: 'var(--color-text-quaternary)',
              letterSpacing: '0.02em', marginTop: 4,
            }}>
              {v.quality.toUpperCase()} · {new Date(v.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── FinalizarTabView ───────────────────────────────────────────────────────────

// Versões exportadas do Finalizar (finalize_exports, RLS = só as próprias).
// Clique abre o projeto no editor; o ícone abre o arquivo exportado.
interface FinalizeExportItem {
  id:         string
  project_id: string | null
  png_url:    string
  format:     string
  width:      number | null
  height:     number | null
  created_at: string
  finalize_projects: { name: string } | null
}

function FinalizarTabView() {
  const router = useRouter()
  const [items, setItems] = useState<FinalizeExportItem[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sb = createClient()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    sb.from('finalize_exports')
      .select('id, project_id, png_url, format, width, height, created_at, finalize_projects(name)')
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => setItems((data ?? []) as unknown as FinalizeExportItem[]))
      .then(undefined, () => setItems([]))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (items !== null) setLoading(false)
  }, [items])

  if (loading)                    return <TabLoading />
  if ((items ?? []).length === 0) return (
    <TabEmpty
      message="Sem versões exportadas ainda — no Finalizar, exporte com “Salvar como versão no projeto”."
      action={{ href: '/app/finalizar', label: 'Abrir Finalizar →' }}
    />
  )

  return (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    }}>
      {items!.map(x => {
        const projectName = x.finalize_projects?.name ?? 'Projeto do Finalizar'
        const openProject = () => { if (x.project_id) router.push(`/app/finalizar/${x.project_id}`) }
        return (
          <div
            key={x.id}
            role="button"
            tabIndex={0}
            onClick={openProject}
            onKeyDown={e => { if (e.key === 'Enter') openProject() }}
            title={x.project_id ? 'Abrir o projeto no Finalizar' : 'Exportação avulsa'}
            style={{
              background: 'var(--color-bg-elevated)',
              border: '0.5px solid var(--color-border)',
              borderRadius: 12, overflow: 'hidden',
              color: 'inherit', cursor: x.project_id ? 'pointer' : 'default',
              display: 'block', position: 'relative',
            }}
          >
            <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface)', position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={toMediaProxyUrl(x.png_url) ?? undefined} alt={projectName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button"
                title="Abrir o arquivo exportado"
                onClick={e => { e.stopPropagation(); window.open(x.png_url, '_blank', 'noopener') }}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, borderRadius: 7, border: 'none',
                  background: 'var(--color-scrim)', color: '#ffffff', cursor: 'pointer',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </button>
            </div>
            <div style={{ padding: '10px 12px 12px' }}>
              <div style={{
                fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
                letterSpacing: '-0.005em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {projectName}
              </div>
              <div style={{
                fontSize: 10, color: 'var(--color-text-quaternary)',
                letterSpacing: '0.02em', marginTop: 4,
              }}>
                {x.format.toUpperCase()}
                {x.width && x.height ? ` · ${x.width}×${x.height}` : ''}
                {' · '}
                {new Date(x.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Blocos3DTabView ────────────────────────────────────────────────────────────
//
// Blocos 3D vivem em tabela própria (blocos3d_jobs — o output é modelo, não
// imagem), então a aba busca do endpoint do módulo. Clique abre o bloco no
// próprio módulo via deep-link (?job=), onde estão o viewer e os downloads.

function Blocos3DTabView() {
  const [items, setItems] = useState<Blocos3DJobView[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch('/api/blocos3d?limit=50')
      .then(r => r.ok ? r.json() : null)
      .then(d => setItems((d?.jobs ?? []) as Blocos3DJobView[]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <TabLoading />
  if ((items ?? []).length === 0) return (
    <TabEmpty
      message="Sem blocos 3D ainda."
      action={{ href: '/app/blocos-3d', label: 'Abrir Blocos 3D →' }}
    />
  )

  return (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {items!.map(it => {
        const thumb = it.thumbnailUrl ?? it.inputUrl
        const engineLabel = BLOCOS3D_ENGINES[it.quality]?.label ?? it.quality
        return (
          <Link
            key={it.id}
            href={`/app/blocos-3d?job=${it.id}`}
            title={it.status === 'failed' ? 'Falhou (estornado)' : it.status === 'processing' ? 'Gerando…' : 'Abrir bloco 3D'}
            style={{
              background: 'var(--color-bg-elevated)',
              border: '0.5px solid var(--color-border)',
              borderRadius: 12, overflow: 'hidden',
              color: 'inherit', cursor: 'pointer',
              display: 'block', textDecoration: 'none',
              opacity: it.status === 'failed' ? 0.55 : 1,
            }}
          >
            <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface)', position: 'relative' }}>
              {thumb ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={thumb} alt="Bloco 3D"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-quaternary)' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l7.5 4.2v9.6L12 21l-7.5-4.2V7.2L12 3z" />
                    <path d="M4.5 7.2L12 11.4l7.5-4.2M12 11.4V21" />
                  </svg>
                </div>
              )}
              {it.status === 'processing' && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'color-mix(in srgb, var(--color-bg) 55%, transparent)',
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: '2px solid var(--color-border-strong)',
                    borderTop: '2px solid var(--color-text-primary)',
                    animation: 'spin 0.9s linear infinite',
                  }} />
                </div>
              )}
              {/* Selo 3D — diferencia dos cards de imagem das outras abas. */}
              <span style={{
                position: 'absolute', top: 8, right: 8,
                fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.9)', background: 'var(--color-scrim)',
                backdropFilter: 'blur(4px)', border: '0.5px solid rgba(255,255,255,0.22)',
                padding: '2px 6px', borderRadius: 6,
              }}>
                3D
              </span>
            </div>
            <div style={{ padding: '10px 12px 12px' }}>
              <div style={{
                fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
                letterSpacing: '-0.005em',
              }}>
                {engineLabel}
                {it.status === 'processing' && ' · gerando…'}
                {it.status === 'failed' && ' · falhou'}
              </div>
              <div style={{
                fontSize: 10, color: 'var(--color-text-tertiary)',
                letterSpacing: '0.02em', marginTop: 4,
              }}>
                {it.nodesCost} nodes · {new Date(it.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function TabLoading() {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
      carregando…
    </div>
  )
}

function TabEmpty({ message, action }: { message: string; action?: { href: string; label: string } }) {
  return (
    <div style={{
      padding: '48px 24px', textAlign: 'center',
      background: 'var(--color-bg-elevated)',
      border: '0.5px dashed var(--color-border-strong)',
      borderRadius: 14,
    }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
        {message}
      </div>
      {action && (
        <Link href={action.href} style={{
          display: 'inline-block', padding: '10px 18px', borderRadius: 10,
          background: 'var(--color-text-primary)', color: 'var(--color-bg)',
          fontSize: 13, fontWeight: 500,
        }}>
          {action.label}
        </Link>
      )}
    </div>
  )
}

// ── RenderCard ─────────────────────────────────────────────────────────────────

function RenderCard({
  render, author, selectMode, selected, onToggle, onActivateSelect, onOpenDetail,
}: {
  render: Render
  author: AuthorInfo | null
  selectMode: boolean
  selected: boolean
  onToggle: () => void
  onActivateSelect: () => void
  onOpenDetail: () => void
}) {
  const router = useRouter()
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Fecha menu quando o card sai de hover ou modo seleção é ativado
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hovered || selectMode) setMenuOpen(false)
  }, [hovered, selectMode])

  const isCreateSpaceEligible = render.ambient !== 'upscale' && render.ambient !== 'video' && !!render.output_url

  const date      = formatDate(render.created_at)
  const isUpscale = render.ambient === 'upscale'
  const isVideo   = render.ambient === 'video'
  // Card usa o derivado WebP quando existe — o master PNG (10-30 MB) fica pro
  // download/lightbox. Renders antigos (sem preview) seguem no master.
  const display   = isVideo
    ? render.input_url
    : (render.preview_url ?? render.output_url ?? render.input_url)
  const nodes     = renderNodes(render)
  const quality   = (isUpscale || isVideo) ? null : qualityLabel(nodes)
  const engine    = (isUpscale || isVideo) ? null : engineLabel(renderEngineRaw(render))
  const title     = isUpscale ? 'Upscale' : isVideo ? 'Animação' : (render.ambient || render.lighting || 'Render')
  const sub       = isUpscale
    ? getUpscaleDisplayLabel(render.style, render.lighting)
    : isVideo
      ? getVideoDisplayLabel(render.style, render.lighting)
      : [render.style === 'exterior' ? 'Exterior' : render.style === 'interior' ? 'Interior' : render.style, render.lighting].filter(Boolean).join(' · ')

  // Clique simples abre o painel "Detalhes da geração"; no modo seleção,
  // alterna o checkbox. Entrar em seleção não depende mais de duplo clique
  // (conflitava com o clique simples abrindo o painel) — agora é o checkbox
  // que aparece no hover, canto superior esquerdo (mesmo padrão do Google/Apple Fotos).
  const handleCardClick = () => { if (selectMode) onToggle(); else onOpenDetail() }

  return (
    <div
      style={{
        ...S.card,
        cursor:    'pointer',
        boxShadow: selected
          ? '0 0 0 2px var(--color-text-primary), var(--shadow-md)'
          : hovered
            ? 'var(--shadow-md)'
            : 'var(--shadow-sm)',
        transform: hovered && !selectMode ? 'translateY(-3px)' : 'translateY(0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleCardClick}
      title={selectMode ? undefined : 'Ver detalhes da geração'}
    >
      {/* Image */}
      <div style={S.cardImg}>
        {display && (
          <img src={display} alt={title} draggable={false}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', pointerEvents: 'none',
              filter: selectMode && !selected ? 'brightness(0.78)' : 'none',
              transition: 'filter 0.15s',
            }}
          />
        )}

        {/* Before thumbnail on hover — não mostrar para vídeo nem em modo seleção.
            Deslocado pra direita pra não sobrepor o checkbox de seleção (hover). */}
        {hovered && !selectMode && render.output_url && render.input_url && !isVideo && (
          <div style={S.beforeThumb}>
            <img src={render.input_url} alt="antes" draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <span style={S.beforeLabel}>antes</span>
          </div>
        )}

        {/* Ícone de play para cards de vídeo */}
        {isVideo && !selectMode && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-scrim)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 2 }}>
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          </div>
        )}

        {/* Checkbox de seleção — sempre visível em modo seleção; fora dele,
            aparece no hover como atalho pra entrar em seleção já marcando
            este card (substitui o antigo duplo clique, que conflitava com
            o clique simples abrindo o painel de detalhes). */}
        {selectMode ? (
          <div style={{ ...S.checkbox, ...(selected ? S.checkboxOn : null) }}>
            {selected && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        ) : hovered && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onActivateSelect() }}
            aria-label="Selecionar"
            title="Selecionar"
            style={S.hoverCheckbox}
          />
        )}

        {/* Badges */}
        {!selectMode && (
          <div style={S.badgeRow}>
            {quality && <span style={S.badge}>{quality}</span>}
            {engine  && <span style={S.badge}>{engine}</span>}
          </div>
        )}

        {/* Autoria — discreto, canto inferior esquerdo */}
        {!selectMode && <AuthorChip author={author} />}

        {/* Kebab menu — top-right, on hover, not in select mode */}
        {hovered && !selectMode && isCreateSpaceEligible && (
          <div
            style={{
              position: 'absolute', top: 8, right: 8, zIndex: 4,
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o) }}
              aria-label="Mais ações"
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'var(--color-scrim)', backdropFilter: 'blur(8px)',
                border: '0.5px solid rgba(255,255,255,0.18)',
                color: '#fff', cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5"  r="1.6"/>
                <circle cx="12" cy="12" r="1.6"/>
                <circle cx="12" cy="19" r="1.6"/>
              </svg>
            </button>

            {menuOpen && (
              <div style={{
                position: 'absolute', top: 32, right: 0,
                minWidth: 200, padding: 6,
                background: 'var(--color-bg-elevated)',
                border: '0.5px solid var(--color-border-strong)',
                borderRadius: 10,
                boxShadow: 'var(--shadow-lg)',
              }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    router.push(`/app/spaces/new/from-render?render_id=${render.id}`)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '8px 10px', borderRadius: 6,
                    background: 'transparent', border: 'none',
                    color: 'var(--color-text-primary)', fontSize: 12, textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-accent-green-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: 'var(--color-accent-green-bg)', color: 'var(--color-accent-green)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>
                    </svg>
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', color: 'var(--color-text-primary)', fontWeight: 500 }}>Criar Space</span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      Usa esta render como Vista Mestre
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Hover overlay actions — desativadas no modo seleção. "Ver" abre o
            painel de detalhes (mesmo destino do clique no card — é o que o
            tooltip do card promete); o download passa pelo proxy /api/download.
            Nenhuma das duas ações navega pra fora do site. */}
        {hovered && !selectMode && render.output_url && (
          <div style={S.hoverActions}>
            <button type="button"
              style={S.actionBtn}
              onClick={e => { e.stopPropagation(); onOpenDetail() }}>
              {isVideo ? 'Assistir →' : 'Ver →'}
            </button>
            <a href={downloadHref(render) ?? undefined}
              style={S.actionBtnGhost}
              onClick={e => e.stopPropagation()}>
              <DownloadIcon /> baixar
            </a>
          </div>
        )}
      </div>

      {/* Meta */}
      <div style={S.cardMeta}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.metaTitle}>{title}</div>
          {sub && <div style={S.metaSub}>{sub}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <span style={S.metaDate}>{date}</span>
          {nodes > 0 && (
            <span style={S.metaNodes}>{nodes} node{nodes !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Move Modal ─────────────────────────────────────────────────────────────────

function MoveModal({
  folders, count, busy, onClose, onPick, onCreate,
}: {
  folders: Folder[]
  count: number
  busy: boolean
  onClose: () => void
  onPick: (folderId: string | null) => void
  onCreate: () => void | Promise<void>
}) {
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.modalHeader}>
          <div>
            <div style={S.modalTitle}>Mover para pasta</div>
            <div style={S.modalSub}>
              {count} render{count !== 1 ? 's' : ''} selecionado{count !== 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={onClose} style={S.modalClose} aria-label="Fechar">✕</button>
        </div>

        <div style={S.modalBody}>
          <ul style={S.spaceList}>
            {/* Pastas de topo com subpastas indentadas logo abaixo — deixa
                claro em qual cliente/projeto cada subpasta vive. */}
            {folders.filter(f => !f.parent_id).map(f => (
              <li key={f.id}>
                <button
                  onClick={() => onPick(f.id)}
                  disabled={busy}
                  style={S.spaceItem}
                >
                  <FolderIcon />
                  <span style={{ flex: 1, textAlign: 'left' }}>{f.name}</span>
                </button>
                {folders.filter(sf => sf.parent_id === f.id).map(sf => (
                  <button
                    key={sf.id}
                    onClick={() => onPick(sf.id)}
                    disabled={busy}
                    style={S.spaceItemSub}
                  >
                    <FolderIcon />
                    <span style={{ flex: 1, textAlign: 'left' }}>{sf.name}</span>
                  </button>
                ))}
              </li>
            ))}
            <li>
              <button
                onClick={() => onCreate()}
                disabled={busy}
                style={{ ...S.spaceItem, color: 'var(--color-text-secondary)' }}
              >
                <PlusIcon />
                <span style={{ flex: 1, textAlign: 'left' }}>Nova pasta…</span>
              </button>
            </li>
          </ul>
        </div>

        <div style={S.modalFooter}>
          <button onClick={() => onPick(null)} disabled={busy} style={S.modalGhostBtn}>
            Tirar da pasta
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: '80px 48px' }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.4" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
      <div style={{ textAlign: 'center', maxWidth: 300 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>
          Nenhum render ainda
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.65 }}>
          Seus renders aparecem aqui depois de gerados. Crie o primeiro agora.
        </div>
      </div>
      <a href="/app/generate"
        style={{ marginTop: 8, padding: '10px 22px', background: 'var(--color-text-primary)', color: 'var(--color-bg)', borderRadius: 10, fontSize: 13, fontWeight: 500, textDecoration: 'none', letterSpacing: '-0.01em' }}>
        Gerar render
      </a>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function DownloadIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/>
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
  main:          { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg)' },
  topbar:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '0.5px solid var(--color-border)', flexShrink: 0 },
  pageTitle:     { fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 500 },
  creditsChip:   { display: 'flex', alignItems: 'center', gap: 6 },
  creditDot:     { width: 5, height: 5, borderRadius: '50%', background: 'var(--color-accent-green)', boxShadow: '0 0 5px var(--color-accent-green-glow)', display: 'inline-block' },
  creditNum:     { color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 12 },

  content:       { flex: 1, overflowY: 'auto', padding: '36px 36px 64px' },

  header:        { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 },
  headerTitle:   { fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 6 },
  headerSub:     { fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '-0.01em' },
  count:         { fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.01em', paddingBottom: 2 },
  headerGhostBtn:{ background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, padding: '7px 13px', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },

  controls:      { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  searchWrap:    { position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 180 },
  searchIcon:    { position: 'absolute', left: 11, color: 'var(--color-text-tertiary)', pointerEvents: 'none', flexShrink: 0 },
  searchInput:   { width: '100%', padding: '8px 32px 8px 32px', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, fontSize: 12, color: 'var(--color-text-primary)', background: 'var(--color-bg-elevated)', fontFamily: 'inherit', outline: 'none', letterSpacing: '-0.01em' },
  clearBtn:      { position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--color-text-tertiary)', padding: 2 },
  select:        { padding: '8px 12px', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--color-bg-elevated)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', letterSpacing: '-0.01em' },
  clearFilterBtn:{ background: 'none', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, padding: '7px 16px', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit' },

  // ── Carregar mais ─
  loadMoreWrap:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 28, padding: '8px 0 24px' },
  loadMoreBtn:   { background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 10, padding: '10px 24px', fontSize: 12, color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em', fontWeight: 500 },
  loadMoreCount: { fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.01em' },

  // ── Folder chips ─
  chipRow:       { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 },
  chip:          { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 4px 4px 12px', borderRadius: 999, background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', color: 'var(--color-text-secondary)', fontSize: 12, letterSpacing: '-0.01em' },
  chipActive:    { background: 'var(--color-text-primary)', borderColor: 'var(--color-text-primary)', color: 'var(--color-bg)' },
  // Pasta de topo "aberta" (subpastas visíveis abaixo) sem ser a seleção
  // exata — realce sutil, sem usar verde (reservado pra estados funcionais).
  chipExpanded:  { borderColor: 'var(--color-text-tertiary)', background: 'var(--color-surface-hover)' },

  // ── Fileira de subpastas (dentro da pasta de topo ativa) ─
  subchipRow:    { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 22, paddingLeft: 14, borderLeft: '2px solid var(--color-border)' },
  subchipHint:   { fontSize: 10, color: 'var(--color-text-quaternary)', letterSpacing: '0.02em', marginRight: 2 },
  chipBtn:       { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '3px 4px 3px 0', font: 'inherit' },
  chipCount:     { fontSize: 10, opacity: 0.7, fontVariantNumeric: 'tabular-nums' },
  chipDelete:    { width: 18, height: 18, marginLeft: 2, marginRight: 2, padding: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.18)', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipAdd:       { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999, background: 'transparent', border: '0.5px dashed var(--color-border-strong)', color: 'var(--color-text-tertiary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },

  grid:          { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },

  card:          { background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 12, overflow: 'hidden', transition: 'box-shadow 0.18s, transform 0.18s', userSelect: 'none' },
  cardImg:       { position: 'relative', aspectRatio: '4/3', background: 'var(--color-surface)', overflow: 'hidden' },
  cardMeta:      { padding: '13px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  metaTitle:     { fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 },
  metaSub:       { fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.01em' },
  metaDate:      { fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' },
  metaNodes:     { fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-quaternary)', whiteSpace: 'nowrap' },

  badgeRow:      { position: 'absolute', top: 10, right: 10, display: 'flex', gap: 5 },
  badge:         { fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, padding: '3px 7px', borderRadius: 5, background: 'var(--color-scrim)', color: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)' },

  checkbox:      { position: 'absolute', top: 10, left: 10, width: 22, height: 22, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  checkboxOn:    { background: 'var(--color-text-primary)', borderColor: 'var(--color-text-primary)', color: 'var(--color-bg)' },
  // Mesma posição/tamanho do checkbox de seleção — aparece só no hover, fora
  // do modo seleção, como atalho pra entrar em seleção (ver RenderCard).
  hoverCheckbox: { position: 'absolute', top: 10, left: 10, zIndex: 3, width: 22, height: 22, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', cursor: 'pointer', padding: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },

  hoverActions:  { position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 6 },
  actionBtn:     { display: 'inline-flex', alignItems: 'center', padding: '5px 13px', background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: 7, fontSize: 11, color: '#0a0a0a', fontWeight: 500, textDecoration: 'none', fontFamily: 'inherit', letterSpacing: '-0.01em', cursor: 'pointer' },
  actionBtnGhost:{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'var(--color-scrim)', border: '0.5px solid rgba(255,255,255,0.25)', borderRadius: 7, fontSize: 10, color: '#fafafa', textDecoration: 'none', backdropFilter: 'blur(4px)', fontFamily: 'inherit' },

  // left:40 (não 10) pra não sobrepor o checkbox de hover, que ocupa o
  // mesmo canto superior esquerdo.
  beforeThumb:   { position: 'absolute', top: 10, left: 40, width: 72, height: 54, borderRadius: 6, overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.6)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  beforeLabel:   { position: 'absolute', bottom: 3, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#fff', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', textShadow: '0 1px 2px rgba(0,0,0,0.8)' },

  // ── Action bar (modo seleção) ─
  actionBar:     { position: 'fixed', bottom: 18, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 50 },
  actionBarInner:{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px', background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', pointerEvents: 'auto', backdropFilter: 'blur(12px)' },
  actionBarCount:{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em', paddingLeft: 4 },
  actionPrimary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--color-text-primary)', color: 'var(--color-bg)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },
  actionSecondary:{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--color-bg)', color: 'var(--color-text-primary)', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },
  actionDanger:  { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--color-bg)', color: 'var(--color-error)', border: '0.5px solid var(--color-error-border)', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },

  // ── Modal ─
  modalOverlay:  { position: 'fixed', inset: 0, background: 'var(--color-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24, backdropFilter: 'blur(2px)' },
  modal:         { width: '100%', maxWidth: 440, maxHeight: '80vh', background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-xl)' },
  modalHeader:   { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '0.5px solid var(--color-border)' },
  modalTitle:    { fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: 3 },
  modalSub:      { fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.01em' },
  modalClose:    { background: 'none', border: 'none', color: 'var(--color-text-tertiary)', fontSize: 14, cursor: 'pointer', padding: 4, lineHeight: 1 },
  modalBody:     { flex: 1, overflowY: 'auto', padding: '8px 12px' },
  modalFooter:   { padding: '12px 20px', borderTop: '0.5px solid var(--color-border)' },
  modalGhostBtn: { width: '100%', background: 'none', border: '0.5px dashed var(--color-border-strong)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },

  spaceList:     { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  spaceItem:     { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'none', border: 'none', borderRadius: 8, fontSize: 13, color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em', textAlign: 'left' },
  // Subpasta dentro da lista de mover — indentada, cor mais suave.
  spaceItemSub:  { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px 8px 30px', background: 'none', border: 'none', borderRadius: 8, fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em', textAlign: 'left' },
}
