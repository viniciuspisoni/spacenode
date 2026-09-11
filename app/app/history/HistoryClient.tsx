'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Fragment, type CSSProperties } from 'react'
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
import {
  Sheet, SettingGroup, SettingRow, summarize, Segmented, PillGroup, RowIcon,
} from '@/components/app/glass'

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
  /** Histórico em escopo de ESCRITÓRIO: a grade traz o que a equipe inteira
   *  produziu, não só o de quem abriu. Só muda a linguagem da tela — quem
   *  decide as linhas é o servidor (lib/history/scope.ts). */
  teamView:      boolean
}

type FolderFilter = 'all' | 'none' | string  // string = folder id

/** Sufixo do pedido de escopo nas listagens. As rotas são pessoais por padrão
 *  (o plugin SketchUp e os modais de importação dependem disso) — é o Histórico
 *  que pede o escritório, e só o servidor decide se pode. Ver
 *  lib/history/scope.ts. */
function scopeQuery(teamView: boolean, sep: '?' | '&' = '?'): string {
  return teamView ? `${sep}scope=office` : ''
}

// Aba de filtro aberta (a folha que a linha correspondente abre).
type FilterSheet = 'conteudo' | 'origem' | 'ordem' | null

// As três perguntas que o histórico faz. Antes eram confirm/alert/prompt
// nativos — proibidos pelo contrato (regra 5) porque não têm tema, não têm
// foco preso e travam a aba. Um feitio só, três formatos.
type AskSpec =
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string }
  | { kind: 'prompt';  title: string; message?: string; placeholder: string; confirmLabel: string }
  | { kind: 'alert';   title: string; message: string }

// Rótulos das pílulas de filtro. O usuário lê "Exterior"; o filtro guarda
// 'exterior' — o mesmo valor que a coluna tem no banco.
const TYPE_OPTIONS   = { 'Todos os tipos': 'all', 'Exterior': 'exterior', 'Interior': 'interior' } as const
const MODULE_OPTIONS = { 'Todos os módulos': 'all', 'Renderizar': 'render', 'Ampliar': 'upscale', 'Animar': 'video' } as const
const ENGINE_OPTIONS = { 'Todas as engines': 'all', 'Vega': 'Vega', 'Quasar': 'Quasar', 'Pulsar': 'Pulsar' } as const
const SORT_OPTIONS   = { 'Mais recentes': 'desc', 'Mais antigos': 'asc' } as const
const ALL_AUTHORS    = 'Todos os autores'

/** Rótulo atual de um mapa de opções — o inverso do que a pílula devolve. */
function labelOf(map: Record<string, string>, value: string): string {
  return Object.keys(map).find(k => map[k] === value) ?? Object.keys(map)[0]
}

function qualityLabel(nodes: number): string | null {
  if (nodes === 4)  return 'HD'
  if (nodes === 8)  return '2K'
  if (nodes === 20) return '4K'
  return null
}

function engineLabel(model: string | null | undefined): string | null {
  if (!model) return null
  if (model.includes('nano-banana-pro') || model.includes('vega'))   return 'Vega'
  if (model.includes('seedream') || model.includes('gpt-image') || model.includes('quasar')) return 'Quasar'
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
  teamView,
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
      const res = await fetch(`/api/renders/list?cursor=${encodeURIComponent(last.created_at)}${scopeQuery(teamView, '&')}`)
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Falha ao carregar' }))
        await askAlert('Não deu para carregar', error || 'Falha ao carregar')
        return
      }
      const { renders: next, pageSize: serverPageSize } = await res.json() as { renders: Render[], pageSize: number }
      setLoaded(prev => [...prev, ...next])
      if (next.length < serverPageSize) setExhausted(true)
    } catch {
      await askAlert('Não deu para carregar', 'Falha ao carregar mais renders. Tente de novo.')
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
  // Sem useCallback: com o React Compiler ligado, a memoização à mão aqui só
  // atrapalhava — o compilador deixava de otimizar o componente INTEIRO porque
  // não conseguia casar as dependências que ele infere com o `[]` escrito na
  // mão. Ele memoiza isto sozinho.
  const openDetail = (kind: GenerationKind, id: string) => setDetail({ kind, id })

  // ── Folhas de filtro ───────────────────────────────────────────────────────
  const [filterSheet, setFilterSheet] = useState<FilterSheet>(null)

  // ── Perguntas do sistema ───────────────────────────────────────────────────
  // `ask()` devolve promessa, então as chamadas continuam lendo como as antigas
  // (`if (!await confirm(…)) return`) e o fluxo assíncrono não precisou virar
  // do avesso. `askSpec` NÃO é limpo ao fechar: a folha precisa do conteúdo no
  // DOM durante a animação de saída — quem some é o `askOpen`.
  const [askSpec, setAskSpec] = useState<AskSpec | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const askResolve = useRef<((v: string | boolean | null) => void) | null>(null)

  // Também sem useCallback, pela mesma razão de `openDetail` acima.
  const runAsk = (spec: AskSpec) => {
    // Uma pergunta por vez: se houver outra no ar, ela sai como cancelada.
    askResolve.current?.(spec.kind === 'prompt' ? null : false)
    setAskSpec(spec)
    setAskOpen(true)
    return new Promise<string | boolean | null>(resolve => { askResolve.current = resolve })
  }

  const settleAsk = (value: string | boolean | null) => {
    setAskOpen(false)
    askResolve.current?.(value)
    askResolve.current = null
  }

  const askConfirm = async (title: string, message: string, confirmLabel: string) =>
    (await runAsk({ kind: 'confirm', title, message, confirmLabel })) === true

  const askAlert = (title: string, message: string) =>
    runAsk({ kind: 'alert', title, message })

  const askPrompt = async (title: string, placeholder: string, confirmLabel: string) => {
    const v = await runAsk({ kind: 'prompt', title, placeholder, confirmLabel })
    return typeof v === 'string' ? v : null
  }

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

  // A pílula devolve o TEXTO da opção, não o id — ao contrário do <select>
  // antigo, que carregava o uid em value. Dois autores sem linha em
  // `profiles` (ou homônimos) dariam o MESMO rótulo: key duplicada no React e
  // um `find` que casaria sempre o primeiro, filtrando pelo autor errado.
  // Daí o desempate no rótulo e a busca por uid nas duas pontas.
  const authorOptions = useMemo(() => {
    const seen = new Map<string, number>()
    return distinctAuthors.map(uid => {
      const base = authorLabel(authors, uid, currentUserId)
      const n = (seen.get(base) ?? 0) + 1
      seen.set(base, n)
      return { uid, label: n === 1 ? base : `${base} (${n})` }
    })
  }, [distinctAuthors, authors, currentUserId])

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

  // ── Quem pode MEXER no quê ───────────────────────────────────────────────────
  // Ver o trabalho do escritório é uma coisa; apagar e arquivar o trabalho dos
  // outros é outra, e não foi o que se decidiu. /api/renders/batch continua
  // filtrando por user_id no servidor (delete e move), então mandar o id do
  // colega não apagaria nada — só que a UI teria acabado de dizer "N renders
  // serão apagados para sempre" e dado refresh. Falha silenciosa em ação
  // destrutiva. A seleção então só alcança o que é de quem está olhando; as
  // pastas, idem, são pessoais.
  const canManage = useCallback(
    (r: Render) => !r.user_id || r.user_id === currentUserId,
    [currentUserId],
  )

  const selectedRenders = useMemo(
    () => loaded.filter(r => selected.has(r.id)),
    [loaded, selected],
  )

  // Ids que podem ir pro /api/renders/batch. Delete e move viajam DAQUI, nunca
  // do `selected` cru: se um id de colega entrasse na seleção por qualquer
  // caminho, o servidor o descartaria em silêncio depois do "apagados para
  // sempre". Aqui ele nem sai.
  const selectedManageableIds = useMemo(
    () => selectedRenders.filter(canManage).map(r => r.id),
    [selectedRenders, canManage],
  )

  const enterSelectMode = () => { setSelectMode(true); setSelected(new Set()) }
  const exitSelectMode  = () => { setSelectMode(false); setSelected(new Set()) }

  // Só é chamado por card gerenciável (a grid passa manageable={canManage(r)});
  // a rede de segurança de verdade está em selectedManageableIds.
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

  const selectAllVisible = () => setSelected(new Set(filtered.filter(canManage).map(r => r.id)))
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
    if (selectedManageableIds.length === 0 || busy) return
    const n = selectedManageableIds.length
    const ok = await askConfirm(
      'Excluir renders',
      `${n} render${n !== 1 ? 's' : ''} ${n !== 1 ? 'serão apagados' : 'será apagado'} para sempre. Esta ação não pode ser desfeita.`,
      `Excluir ${n} render${n !== 1 ? 's' : ''}`,
    )
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch('/api/renders/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: selectedManageableIds, action: 'delete' }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Falha ao excluir' }))
        await askAlert('Não deu para excluir', error || 'Falha ao excluir')
        return
      }
      exitSelectMode()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleMove = async (folderId: string | null) => {
    if (selectedManageableIds.length === 0 || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/renders/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: selectedManageableIds, action: 'move', folder_id: folderId }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Falha ao mover' }))
        await askAlert('Não deu para mover', error || 'Falha ao mover')
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
    const name = (initialName ?? await askPrompt(
      isSubfolder ? 'Nova subpasta' : 'Nova pasta',
      isSubfolder ? 'Nome da subpasta' : 'Nome da pasta',
      'Criar',
    ))?.trim()
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
        await askAlert('Não deu para criar', error || fallback)
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
      ? `A pasta e ${childIds.length} subpasta${childIds.length !== 1 ? 's' : ''} somem. ${cascadeCount} render${cascadeCount !== 1 ? 's' : ''} dentro delas ficará${cascadeCount !== 1 ? 'ão' : ''} sem pasta — nenhum é apagado.`
      : directCount > 0
        ? `Os ${directCount} render${directCount !== 1 ? 's' : ''} dentro dela ficam sem pasta — nenhum é apagado.`
        : 'A pasta está vazia.'
    if (!await askConfirm(`Excluir "${folderName}"`, msg, 'Excluir pasta')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/folders/${folderId}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Falha ao excluir pasta' }))
        await askAlert('Não deu para excluir', error || 'Falha ao excluir pasta')
        return
      }
      if (folderFilter === folderId || childIds.includes(folderFilter)) setFolderFilter('all')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const manageableVisible  = filtered.filter(canManage)
  const allVisibleSelected = manageableVisible.length > 0 && manageableVisible.every(r => selected.has(r.id))

  return (
    <div style={S.main}>

      {/* ── Topbar ── */}
      <div style={S.topbar}>
        <span style={S.pageTitle}>HISTÓRICO</span>
        <span className="spn-balance">
          <span className="spn-balance-dot" aria-hidden />
          <b>{credits}</b> nodes
        </span>
      </div>

      {/* A barra de ação do modo seleção é um .spn-dock DENTRO deste scroller
          (não mais uma ilha fixa no viewport): assim ela nunca cobre a
          sidebar e o rodapé da página não precisa reservar altura. */}
      <div style={S.content}>

        {/* ── Header ── */}
        <div style={S.header}>
          <div>
            <h1 style={S.headerTitle}>Histórico</h1>
            <p style={S.headerSub}>
              {/* No escritório a mesma grade mostra o trabalho da equipe — dizer
                  isso na primeira linha evita a leitura errada de que o
                  Histórico encolheu ou inchou sozinho. Blocos 3D e Finalizar
                  seguem pessoais (ver nota em app/api/vistas/list). */}
              {historyTab === 'renders'   && (teamView ? 'Renders do escritório — seus e da sua equipe, prontos para reutilizar.' : 'Seus renders salvos e prontos para reutilizar.')}
              {historyTab === 'edits'     && (teamView ? 'Edições localizadas feitas no Editar por você e pela sua equipe.' : 'Edições localizadas geradas no Editar.')}
              {historyTab === 'vistas'    && (teamView ? 'Vistas geradas nos Spaces do escritório.' : 'Vistas geradas dentro dos seus Spaces.')}
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
                    className="spn-ghost"
                    onClick={allVisibleSelected ? clearSelection : selectAllVisible}
                  >
                    {allVisibleSelected ? 'Limpar' : 'Selecionar todos'}
                  </button>
                  <button className="spn-ghost" onClick={exitSelectMode}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button className="spn-ghost" onClick={enterSelectMode}>
                  Selecionar
                </button>
              )
            )}
          </div>
        </div>

        {/* ── Abas ──
            Fica na superfície porque é o eixo que reconfigura tudo o mais
            (regra 4 da simplificação): trocar de aba troca a fonte de dados,
            os filtros e as ações. */}
        <Segmented
          className="spn-hist-tabs"
          label="Tipo de geração"
          value={historyTab}
          onChange={setHistoryTab}
          items={[
            { value: 'renders',   label: 'Renders' },
            { value: 'edits',     label: 'Edições' },
            { value: 'vistas',    label: 'Vistas' },
            { value: 'finalizar', label: 'Finalizar' },
            { value: 'blocos3d',  label: 'Blocos 3D' },
          ] as const}
        />

        {/* ── Tabs alternativas: Edições + Vistas + Finalizar + Blocos 3D ── */}
        {historyTab === 'edits'     && <EditsTabView  authors={authors} teamView={teamView} onOpenDetail={openDetail} />}
        {historyTab === 'vistas'    && <VistasTabView authors={authors} teamView={teamView} onOpenDetail={openDetail} />}
        {historyTab === 'finalizar' && <FinalizarTabView />}
        {historyTab === 'blocos3d'  && <Blocos3DTabView />}

        {/* ── Controles (só na tab Renders) ──
            Cinco <select> lado a lado viraram TRÊS linhas que mostram o valor
            já resolvido. A busca fica de fora porque é a ação principal da
            tela — e porque campo de texto não cabe atrás de uma linha. */}
        {historyTab === 'renders' && folderCounts.total > 0 && (
          <>
            <div style={S.controls}>
              <div style={S.searchWrap}>
                <svg style={S.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  className="spn-input"
                  type="text"
                  placeholder="Buscar renders…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={S.searchInput}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={S.clearBtn} aria-label="Limpar busca">✕</button>
                )}
              </div>
            </div>

            <SettingGroup className="spn-hist-filters">
              <SettingRow
                icon={<RowIcon name="scene" />}
                title="Conteúdo"
                value={summarize([
                  typeFilter   !== 'all' ? labelOf(TYPE_OPTIONS, typeFilter)     : '',
                  moduleFilter !== 'all' ? labelOf(MODULE_OPTIONS, moduleFilter) : '',
                ]) || 'Tudo'}
                onOpen={() => setFilterSheet('conteudo')}
              />
              <SettingRow
                icon={<RowIcon name="output" />}
                title="Origem"
                value={summarize([
                  engineFilter !== 'all' ? engineFilter : '',
                  authorFilter !== 'all' ? (authorOptions.find(o => o.uid === authorFilter)?.label ?? '') : '',
                ]) || 'Qualquer engine'}
                onOpen={() => setFilterSheet('origem')}
              />
              <SettingRow
                icon={<RowIcon name="scale" />}
                title="Ordem"
                value={labelOf(SORT_OPTIONS, sort)}
                onOpen={() => setFilterSheet('ordem')}
              />
            </SettingGroup>
          </>
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
            <button onClick={() => void createFolder()} style={S.chipAdd} disabled={busy}>
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
            <button onClick={() => void createFolder(undefined, expandedParentId)} style={S.chipAdd} disabled={busy}>
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
              <div className="spn-empty">
                <div style={{ marginBottom: 12 }}>
                  {hasMore
                    ? 'Sem resultados nos renders carregados.'
                    : (search
                        ? <>Nenhum resultado para &ldquo;{search}&rdquo;</>
                        : 'Nada por aqui ainda.')}
                </div>
                {!hasMore && (
                  <button
                    className="spn-ghost"
                    onClick={() => {
                      setSearch(''); setTypeFilter('all'); setFolderFilter('all')
                      setModuleFilter('all'); setEngineFilter('all'); setAuthorFilter('all')
                    }}
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              /* UMA superfície de vidro por trás da grade inteira, não uma por
                 cartão: com PAGE_SIZE=60 e "carregar mais" acumulando, a grade
                 passa de 200 cartões, e 200 backdrop-filter rolando sobre o
                 papel de parede é filtro reamostrado 200 vezes por frame. O
                 cartão fica sendo um chip apoiado nessa superfície — que é,
                 aliás, o que o painel do plugin faz com as linhas dele. */
              <div className="spn-glass" style={S.gridSurface}>
                <div style={S.grid}>
                  {filtered.map(r => (
                    <RenderCard
                      key={r.id}
                      render={r}
                      author={r.user_id ? authors[r.user_id] ?? null : null}
                      manageable={canManage(r)}
                      selectMode={selectMode}
                      selected={selected.has(r.id)}
                      onToggle={() => toggleOne(r.id)}
                      onActivateSelect={() => activateSelectWith(r.id)}
                      onOpenDetail={() => openDetail('render', r.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {hasMore && (
              <div style={S.loadMoreWrap}>
                <button className="spn-ghost" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
                <div style={S.loadMoreCount}>
                  {loaded.length} de {folderCounts.total} carregados
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* ── Dock do modo seleção ──
            Colado no rodapé do scroller (o CTA nunca some no scroll) e com a
            largura da coluna de conteúdo, nunca a do viewport. */}
        {selected.size > 0 && (
          <div className="spn-dock spn-glass spn-glass--chrome" style={S.dock}>
            <div style={S.dockInner}>
              <span style={S.dockCount}>
                {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
              </span>
              <button className="spn-cta" onClick={handleDownload} disabled={busy} style={S.dockCta}>
                <DownloadIcon /> Baixar
              </button>
              <button className="spn-ghost" onClick={() => setMoveOpen(true)} disabled={busy} style={S.dockBtn}>
                <FolderIcon /> Mover
              </button>
              <button className="spn-ghost" onClick={handleDelete} disabled={busy} style={S.dockDanger}>
                <TrashIcon /> Excluir
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ── Painel "Detalhes da geração" ── */}
      {detail && (
        <GenerationDetailDrawer
          kind={detail.kind}
          id={detail.id}
          onClose={() => setDetail(null)}
        />
      )}

      {/* ── Folha: mover para pasta ── */}
      <MoveSheet
        open={moveOpen}
        folders={folders}
        count={selected.size}
        busy={busy}
        onClose={() => setMoveOpen(false)}
        onPick={handleMove}
        onCreate={async () => {
          // Fecha esta folha ANTES de perguntar o nome: duas folhas abertas ao
          // mesmo tempo brigam pela trava de rolagem do <body>.
          setMoveOpen(false)
          const f = await createFolder()
          if (f) await handleMove(f.id)
        }}
      />

      {/* ── Folhas de filtro ── */}
      <Sheet open={filterSheet === 'conteudo'} title="Conteúdo" onClose={() => setFilterSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Tipo</span>
          <PillGroup
            label="Tipo"
            options={Object.keys(TYPE_OPTIONS)}
            value={labelOf(TYPE_OPTIONS, typeFilter)}
            onChange={l => setTypeFilter(TYPE_OPTIONS[l as keyof typeof TYPE_OPTIONS])}
          />
        </div>
        <div className="spn-field">
          <span className="spn-field-label">Módulo</span>
          <PillGroup
            label="Módulo"
            options={Object.keys(MODULE_OPTIONS)}
            value={labelOf(MODULE_OPTIONS, moduleFilter)}
            onChange={l => setModuleFilter(MODULE_OPTIONS[l as keyof typeof MODULE_OPTIONS])}
          />
          <p className="spn-hint">Renderizar, Ampliar e Animar moram na mesma lista — o módulo separa.</p>
        </div>
      </Sheet>

      <Sheet open={filterSheet === 'origem'} title="Origem" onClose={() => setFilterSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Engine</span>
          <PillGroup
            label="Engine"
            options={Object.keys(ENGINE_OPTIONS)}
            value={labelOf(ENGINE_OPTIONS, engineFilter)}
            onChange={l => setEngineFilter(ENGINE_OPTIONS[l as keyof typeof ENGINE_OPTIONS])}
          />
        </div>
        {/* Autor só existe quando há mais de um gerando no mesmo projeto. */}
        {distinctAuthors.length > 1 && (
          <div className="spn-field">
            <span className="spn-field-label">Autor</span>
            <PillGroup
              label="Autor"
              options={[ALL_AUTHORS, ...authorOptions.map(o => o.label)]}
              value={authorFilter === 'all'
                ? ALL_AUTHORS
                : (authorOptions.find(o => o.uid === authorFilter)?.label ?? ALL_AUTHORS)}
              onChange={l => setAuthorFilter(authorOptions.find(o => o.label === l)?.uid ?? 'all')}
            />
          </div>
        )}
      </Sheet>

      <Sheet open={filterSheet === 'ordem'} title="Ordem" onClose={() => setFilterSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Ordenar por data</span>
          <PillGroup
            label="Ordem"
            options={Object.keys(SORT_OPTIONS)}
            value={labelOf(SORT_OPTIONS, sort)}
            onChange={l => setSort(SORT_OPTIONS[l as keyof typeof SORT_OPTIONS])}
          />
        </div>
      </Sheet>

      {/* ── Folha: confirmar / perguntar / avisar ── */}
      <AskSheet spec={askSpec} open={askOpen} onSettle={settleAsk} />
    </div>
  )
}

// ── AskSheet ───────────────────────────────────────────────────────────────────
//
// A folha que substituiu os nove confirm/alert/prompt nativos do arquivo. Um
// componente só, três feitios — o que muda entre eles é ter campo, ter botão
// de confirmar e o rótulo do "fechar".

function AskSheet({
  spec, open, onSettle,
}: {
  spec: AskSpec | null
  open: boolean
  onSettle: (value: string | boolean | null) => void
}) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Intencional: cada abertura reinicia o campo. Sem isto o nome da pasta
    // anterior reapareceria na próxima pergunta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setText('')
  }, [open, spec])

  // O `prompt()` nativo entregava o cursor dentro do campo. `autoFocus` não
  // repõe isso: a folha manda o foco para ELA 40ms depois de abrir
  // (components/app/glass/Sheet.tsx:62), e numa segunda pergunta o React
  // reaproveita o mesmo <input>, então `autoFocus` nem dispara. O campo é
  // obrigatório (o botão só habilita com ele preenchido), então ele tem de
  // vir focado — daí o foco explícito, DEPOIS do da folha.
  useEffect(() => {
    if (!open || spec?.kind !== 'prompt') return
    const t = window.setTimeout(() => inputRef.current?.focus(), 90)
    return () => window.clearTimeout(t)
  }, [open, spec])

  const cancel = () => onSettle(spec?.kind === 'prompt' ? null : false)

  return (
    <Sheet
      open={open}
      title={spec?.title ?? ''}
      doneLabel={spec?.kind === 'alert' ? 'Fechar' : 'Cancelar'}
      onClose={cancel}
    >
      {spec && (
        <>
          {spec.message && (
            <p className="spn-hint" style={{ marginTop: 0 }}>{spec.message}</p>
          )}
          {spec.kind === 'prompt' && (
            <input
              ref={inputRef}
              className="spn-input"
              style={{ marginTop: 12 }}
              value={text}
              placeholder={spec.placeholder}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && text.trim()) onSettle(text.trim()) }}
            />
          )}
          {spec.kind !== 'alert' && (
            <button
              className="spn-cta"
              style={{ marginTop: 18 }}
              disabled={spec.kind === 'prompt' && !text.trim()}
              onClick={() => onSettle(spec.kind === 'prompt' ? text.trim() : true)}
            >
              {spec.confirmLabel}
            </button>
          )}
        </>
      )}
    </Sheet>
  )
}

/** Nome de exibição de um autor no filtro (e "(você)" no próprio). */
function authorLabel(
  authors: Record<string, AuthorInfo>, uid: string, currentUserId: string,
): string {
  const base = authors[uid]?.name || authors[uid]?.email || 'Autor não registrado'
  return uid === currentUserId ? `${base} (você)` : base
}

// ── AuthorChip ─────────────────────────────────────────────────────────────────
//
// Indicação discreta de autoria na thumb (cenário de equipes: mais de um
// usuário gerando no mesmo projeto/escritório). Iniciais + tooltip nativo.

// Chip sobre FOTO: o contraste vem do véu escuro, não do borrão — e o borrão
// custava um backdrop-filter POR CARTÃO (×200 na grade). Fica o véu, sai o
// filtro. Escuro fixo porque a imagem embaixo não segue o tema — é a mesma
// razão do .spn-overlay.
function AuthorChip({ author, title }: { author: AuthorInfo | null; title?: string }) {
  const name = author?.name || author?.email || null
  return (
    <span
      title={title ?? (name ? `Gerado por ${name}` : 'Autor não registrado')}
      style={S.authorChip}
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
  authors, teamView, onOpenDetail,
}: {
  authors: Record<string, AuthorInfo>
  teamView: boolean
  onOpenDetail: (kind: GenerationKind, id: string) => void
}) {
  const [items, setItems] = useState<Edit[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/edits${scopeQuery(teamView)}`)
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
    <div style={S.tabGrid}>
      {items!.map(it => (
        <div
          key={it.id}
          className="spn-card spn-glass"
          role="button"
          tabIndex={0}
          onClick={() => onOpenDetail('edit', it.id)}
          onKeyDown={e => { if (e.key === 'Enter') onOpenDetail('edit', it.id) }}
          title="Ver detalhes da geração"
          style={S.tabCard}
        >
          <div style={S.tabThumb}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.result_image_url} alt={it.prompt} style={S.tabImg} />
            <AuthorChip author={it.user_id ? authors[it.user_id] ?? null : null} />
          </div>
          <div className="spn-card-body">
            <div className="spn-card-title">{it.prompt}</div>
            <div className="spn-card-meta">
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
  authors, teamView, onOpenDetail,
}: {
  authors: Record<string, AuthorInfo>
  teamView: boolean
  onOpenDetail: (kind: GenerationKind, id: string) => void
}) {
  const [items, setItems] = useState<VistaListItem[] | null>(null)
  const [loading, setLoading] = useState(true)

  // Via rota (/api/vistas/list) e não mais direto do banco: é lá que o escopo
  // do Histórico decide entre "minhas vistas" e "as do escritório", e é lá que
  // a image_url sai assinada. Ver app/api/vistas/list/route.ts.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/vistas/list${scopeQuery(teamView)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setItems((d?.vistas ?? []) as VistaListItem[]))
      .then(undefined, () => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading)                       return <TabLoading />
  if ((items ?? []).length === 0)    return (
    <TabEmpty
      message="Sem vistas geradas em projetos ainda."
      action={{ href: '/app/spaces', label: 'Abrir Meus projetos →' }}
    />
  )

  return (
    <div style={S.tabGrid}>
      {items!.map(v => (
        <div
          key={v.id}
          className="spn-card spn-glass"
          role="button"
          tabIndex={0}
          onClick={() => onOpenDetail('vista', v.id)}
          onKeyDown={e => { if (e.key === 'Enter') onOpenDetail('vista', v.id) }}
          title="Ver detalhes da geração"
          style={S.tabCard}
        >
          <div style={S.tabThumb}>
            {/* URL já assinada na rota — nada de toMediaProxyUrl aqui: o proxy
                exige chave no namespace de quem pede e devolveria 403 na
                imagem do colega. Mesmo caminho de renders e edições. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.image_url ?? undefined} alt={v.axis_label ?? ''} style={S.tabImg} />
            <AuthorChip author={v.user_id ? authors[v.user_id] ?? null : null} />
            {/* Verde aqui é ESTADO ("foi editada"), não ação — o contrato
                permite exatamente este uso. */}
            {v.is_edited && <span style={S.editedBadge}>editada</span>}
          </div>
          <div className="spn-card-body">
            <div className="spn-card-title">{v.axis_label ?? 'Vista'}</div>
            <div className="spn-card-meta">
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
    <div style={S.tabGrid}>
      {items!.map(x => {
        const projectName = x.finalize_projects?.name ?? 'Projeto do Finalizar'
        const openProject = () => { if (x.project_id) router.push(`/app/finalizar/${x.project_id}`) }
        return (
          <div
            key={x.id}
            className="spn-card spn-glass"
            role="button"
            tabIndex={0}
            onClick={openProject}
            onKeyDown={e => { if (e.key === 'Enter') openProject() }}
            title={x.project_id ? 'Abrir o projeto no Finalizar' : 'Exportação avulsa'}
            style={{ ...S.tabCard, cursor: x.project_id ? 'pointer' : 'default' }}
          >
            <div style={S.tabThumb}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={toMediaProxyUrl(x.png_url) ?? undefined} alt={projectName} style={S.tabImg} />
              <button
                type="button"
                title="Abrir o arquivo exportado"
                onClick={e => { e.stopPropagation(); window.open(x.png_url, '_blank', 'noopener') }}
                style={S.thumbIconBtn}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </button>
            </div>
            <div className="spn-card-body">
              <div className="spn-card-title">{projectName}</div>
              <div className="spn-card-meta">
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
    <div style={S.tabGrid}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {items!.map(it => {
        const thumb = it.thumbnailUrl ?? it.inputUrl
        const engineLabel = BLOCOS3D_ENGINES[it.quality]?.label ?? it.quality
        return (
          <Link
            key={it.id}
            className="spn-card spn-glass"
            href={`/app/blocos-3d?job=${it.id}`}
            title={it.status === 'failed' ? 'Falhou (estornado)' : it.status === 'processing' ? 'Gerando…' : 'Abrir bloco 3D'}
            style={{ ...S.tabCard, textDecoration: 'none', opacity: it.status === 'failed' ? 0.55 : 1 }}
          >
            <div style={S.tabThumb}>
              {thumb ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={thumb} alt="Bloco 3D" style={S.tabImg} />
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
              <span style={S.badge3d}>3D</span>
            </div>
            <div className="spn-card-body">
              <div className="spn-card-title">
                {engineLabel}
                {it.status === 'processing' && ' · gerando…'}
                {it.status === 'failed' && ' · falhou'}
              </div>
              <div className="spn-card-meta">
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
  return <div className="spn-empty">carregando…</div>
}

function TabEmpty({ message, action }: { message: string; action?: { href: string; label: string } }) {
  return (
    <div className="spn-empty">
      <div style={{ marginBottom: action ? 14 : 0 }}>{message}</div>
      {action && (
        <Link href={action.href} className="spn-cta" style={S.inlineCta}>
          {action.label}
        </Link>
      )}
    </div>
  )
}

// ── RenderCard ─────────────────────────────────────────────────────────────────

function RenderCard({
  render, author, manageable, selectMode, selected, onToggle, onActivateSelect, onOpenDetail,
}: {
  render: Render
  author: AuthorInfo | null
  /** Render de quem está olhando — só esses podem ser selecionados para apagar
   *  ou mover. No histórico de escritório o cartão do colega é de leitura. */
  manageable: boolean
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
  const handleCardClick = () => { if (selectMode && manageable) onToggle(); else onOpenDetail() }

  return (
    <div
      className="spn-card"
      style={{
        ...S.card,
        // Sem translateY no hover: o cartão está apoiado numa superfície de
        // vidro e subir 3px obrigaria a recompor a pilha inteira a cada
        // frame. Borda e sombra dizem "levantou" pelo mesmo preço de zero.
        borderColor: selected || hovered ? 'var(--glass-line-strong)' : 'var(--glass-line)',
        boxShadow: selected
          ? '0 0 0 2px var(--color-text-primary), var(--shadow-float)'
          : hovered
            ? 'var(--shadow-float)'
            : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleCardClick}
      title={selectMode ? undefined : 'Ver detalhes da geração'}
    >
      {/* Image */}
      <div style={S.cardImg}>
        {display && (
          <img src={display} alt={title} draggable={false} style={S.cardImgTag} />
        )}

        {/* Apagar as não-selecionadas era `filter: brightness(0.78)` na <img>.
            Filtro obriga a imagem a virar camada própria e a ser reprocessada;
            um véu opaco por cima faz o mesmo efeito só compondo. */}
        {selectMode && !selected && <div style={S.dimVeil} aria-hidden />}

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
          <div style={S.playWrap}>
            <div style={S.playDisc}>
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
          manageable ? (
            <div style={{ ...S.checkbox, ...(selected ? S.checkboxOn : null) }}>
              {selected && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          ) : (
            // Sem caixa: a ausência já diz que não entra na seleção, e o cartão
            // segue clicável para abrir os detalhes. Fica o chip de autoria, que
            // responde de quem é e, no title, por que não dá pra marcar.
            <AuthorChip author={author} title="Só quem gerou pode apagar ou mover este render" />
          )
        ) : hovered && manageable && (
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
          <div style={S.kebabWrap} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o) }}
              aria-label="Mais ações"
              style={S.kebabBtn}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5"  r="1.6"/>
                <circle cx="12" cy="12" r="1.6"/>
                <circle cx="12" cy="19" r="1.6"/>
              </svg>
            </button>

            {/* Popover, não folha: nasce ancorado no botão e some ao sair do
                hover — não tem estado nem decisão para sustentar uma folha. */}
            {menuOpen && (
              <div className="spn-glass" style={S.kebabMenu}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    router.push(`/app/spaces/new/from-render?render_id=${render.id}`)
                  }}
                  style={S.kebabItem}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-chip-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={S.kebabItemIcon}>
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
//
// Era um modal próprio (overlay + caixa + cabeçalho + rodapé, tudo em estilo
// inline). Virou a folha do kit com as linhas do kit: uma peça a menos no
// sistema, e o comportamento de Esc/foco/scrim passa a ser o mesmo do resto.

function MoveSheet({
  open, folders, count, busy, onClose, onPick, onCreate,
}: {
  open: boolean
  folders: Folder[]
  count: number
  busy: boolean
  onClose: () => void
  onPick: (folderId: string | null) => void
  onCreate: () => void | Promise<void>
}) {
  return (
    <Sheet open={open} title="Mover para pasta" onClose={onClose} doneLabel="Cancelar">
      <p className="spn-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        {count} render{count !== 1 ? 's' : ''} selecionado{count !== 1 ? 's' : ''}.
      </p>

      <SettingGroup>
        {/* Pastas de topo com subpastas indentadas logo abaixo — deixa claro
            em qual cliente/projeto cada subpasta vive. */}
        {folders.filter(f => !f.parent_id).map(f => (
          <Fragment key={f.id}>
            <button className="spn-row" onClick={() => onPick(f.id)} disabled={busy}>
              <span className="spn-row-ico" aria-hidden><FolderIcon /></span>
              <span className="spn-row-title">{f.name}</span>
            </button>
            {folders.filter(sf => sf.parent_id === f.id).map(sf => (
              <button key={sf.id} className="spn-row" style={S.rowSub} onClick={() => onPick(sf.id)} disabled={busy}>
                <span className="spn-row-ico" aria-hidden><FolderIcon /></span>
                <span className="spn-row-title" style={{ fontWeight: 400 }}>{sf.name}</span>
              </button>
            ))}
          </Fragment>
        ))}
        <button className="spn-row" onClick={() => onCreate()} disabled={busy}>
          <span className="spn-row-ico" aria-hidden><PlusIcon /></span>
          <span className="spn-row-title" style={{ color: 'var(--color-text-secondary)' }}>Nova pasta…</span>
        </button>
      </SettingGroup>

      <button className="spn-ghost" style={S.sheetWideBtn} onClick={() => onPick(null)} disabled={busy}>
        Tirar da pasta
      </button>
    </Sheet>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="spn-empty" style={{ marginTop: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>
        Nenhum render ainda
      </div>
      <div style={{ marginBottom: 16 }}>
        Seus renders aparecem aqui depois de gerados. Crie o primeiro agora.
      </div>
      <Link href="/app/generate" className="spn-cta" style={S.inlineCta}>
        Gerar render
      </Link>
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
  // O fundo chapado saiu: quem pinta é o <Ambient/> do layout, e sem ele o
  // vidro dos cartões e das folhas vira cinza.
  main:          { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbar:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '0.5px solid var(--glass-line)', flexShrink: 0 },
  pageTitle:     { fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 500 },

  content:       { flex: 1, overflowY: 'auto', padding: '36px 36px 64px' },

  header:        { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 },
  headerTitle:   { fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 6 },
  headerSub:     { fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '-0.01em' },
  count:         { fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.01em', paddingBottom: 2 },

  // ── Busca ─
  // O campo é .spn-input; aqui fica só o que a lupa e o ✕ exigem de espaço.
  controls:      { display: 'flex', gap: 10, margin: '16px 0 12px', flexWrap: 'wrap' },
  searchWrap:    { position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 180 },
  searchIcon:    { position: 'absolute', left: 12, color: 'var(--color-text-tertiary)', pointerEvents: 'none', flexShrink: 0 },
  searchInput:   { paddingLeft: 33, paddingRight: 33 },
  clearBtn:      { position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--color-text-tertiary)', padding: 2 },

  // ── Carregar mais ─
  loadMoreWrap:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 24, padding: '8px 0 8px' },
  loadMoreCount: { fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.01em' },

  // ── Chips de pasta ─
  // Mesma receita da .spn-pill (fundo de chip, fio de vidro, ativo invertido);
  // continua sendo um <div> porque carrega o ✕ dentro da própria pílula.
  chipRow:       { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18, marginBottom: 22 },
  chip:          { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 4px 4px 12px', borderRadius: 999, background: 'var(--color-chip)', border: '0.5px solid var(--glass-line)', boxShadow: 'inset 0 0.5px 0 var(--glass-spec)', color: 'var(--color-text-secondary)', fontSize: 12, letterSpacing: '-0.01em' },
  chipActive:    { background: 'var(--color-chip-active)', borderColor: 'transparent', color: 'var(--color-chip-active-foreground)' },
  // Pasta de topo "aberta" (subpastas visíveis abaixo) sem ser a seleção
  // exata — realce sutil, sem usar verde (reservado pra estados funcionais).
  chipExpanded:  { borderColor: 'var(--glass-line-strong)', background: 'var(--color-chip-hover)' },

  // ── Fileira de subpastas (dentro da pasta de topo ativa) ─
  subchipRow:    { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 22, paddingLeft: 14, borderLeft: '2px solid var(--glass-line)' },
  subchipHint:   { fontSize: 10, color: 'var(--color-text-quaternary)', letterSpacing: '0.02em', marginRight: 2 },
  chipBtn:       { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '3px 4px 3px 0', font: 'inherit' },
  chipCount:     { fontSize: 10, opacity: 0.7, fontVariantNumeric: 'tabular-nums' },
  chipDelete:    { width: 18, height: 18, marginLeft: 2, marginRight: 2, padding: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.18)', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipAdd:       { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999, background: 'transparent', border: '0.5px dashed var(--glass-line-strong)', color: 'var(--color-text-tertiary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' },

  // ── Grade ─
  gridSurface:   { borderRadius: 'var(--r-card)', padding: 14 },
  grid:          { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },

  // Cartão apoiado na superfície de vidro da grade: chip, não outro vidro.
  card:          { background: 'var(--color-chip)', border: '0.5px solid var(--glass-line)', cursor: 'pointer', transition: 'box-shadow 180ms var(--ease), border-color 180ms var(--ease)', userSelect: 'none' },
  cardImg:       { position: 'relative', aspectRatio: '4/3', background: 'var(--color-preview-bg)', overflow: 'hidden' },
  cardImgTag:    { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' },
  dimVeil:       { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.30)', pointerEvents: 'none' },
  cardMeta:      { padding: '13px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  metaTitle:     { fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 },
  metaSub:       { fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.01em' },
  metaDate:      { fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' },
  metaNodes:     { fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-quaternary)', whiteSpace: 'nowrap' },

  // ── Selos e chips SOBRE a imagem ─
  // Todos perderam o backdrop-filter inline (eram 4 por cartão, ×200 cartões).
  // Sobre foto quem dá contraste é o véu escuro; o borrão era enfeite caro. E
  // escuro fixo, porque a imagem embaixo não segue o tema (regra do .spn-overlay).
  badgeRow:      { position: 'absolute', top: 10, right: 10, display: 'flex', gap: 5, zIndex: 2 },
  badge:         { fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, padding: '3px 7px', borderRadius: 5, background: 'var(--color-scrim)', color: 'rgba(255,255,255,0.88)' },
  badge3d:       { position: 'absolute', top: 8, right: 8, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.9)', background: 'var(--color-scrim)', border: '0.5px solid rgba(255,255,255,0.22)', padding: '2px 6px', borderRadius: 6 },
  editedBadge:   { position: 'absolute', top: 8, right: 8, padding: '3px 8px', borderRadius: 5, background: 'var(--color-accent-green)', color: '#000', fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' },
  authorChip:    { position: 'absolute', bottom: 8, left: 8, zIndex: 2, width: 20, height: 20, borderRadius: '50%', background: 'var(--color-scrim)', border: '0.5px solid rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.85)', fontSize: 7.5, fontWeight: 600, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' },
  thumbIconBtn:  { position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, border: 'none', background: 'var(--color-scrim)', color: '#ffffff', cursor: 'pointer' },

  checkbox:      { position: 'absolute', top: 10, left: 10, zIndex: 3, width: 22, height: 22, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  checkboxOn:    { background: 'var(--color-text-primary)', borderColor: 'var(--color-text-primary)', color: 'var(--color-bg)' },
  // Mesma posição/tamanho do checkbox de seleção — aparece só no hover, fora
  // do modo seleção, como atalho pra entrar em seleção (ver RenderCard).
  hoverCheckbox: { position: 'absolute', top: 10, left: 10, zIndex: 3, width: 22, height: 22, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.45)', cursor: 'pointer', padding: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },

  playWrap:      { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  playDisc:      { width: 36, height: 36, borderRadius: '50%', background: 'var(--color-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  // ── Kebab ─
  kebabWrap:     { position: 'absolute', top: 8, right: 8, zIndex: 4 },
  kebabBtn:      { width: 28, height: 28, borderRadius: 6, background: 'var(--color-scrim)', border: '0.5px solid rgba(255,255,255,0.18)', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  kebabMenu:     { position: 'absolute', top: 32, right: 0, minWidth: 200, padding: 6, borderRadius: 'var(--r-inner)', boxShadow: 'var(--shadow-float)' },
  kebabItem:     { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', color: 'var(--color-text-primary)', fontSize: 12, textAlign: 'left', cursor: 'pointer', font: 'inherit' },
  // Neutro: "Criar Space" é AÇÃO, e verde é estado (regra 3 do contrato).
  kebabItemIcon: { width: 22, height: 22, borderRadius: 6, background: 'var(--color-chip)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  hoverActions:  { position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 6, zIndex: 3 },
  actionBtn:     { display: 'inline-flex', alignItems: 'center', padding: '5px 13px', background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: 7, fontSize: 11, color: '#0a0a0a', fontWeight: 500, textDecoration: 'none', fontFamily: 'inherit', letterSpacing: '-0.01em', cursor: 'pointer' },
  actionBtnGhost:{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'var(--color-scrim)', border: '0.5px solid rgba(255,255,255,0.25)', borderRadius: 7, fontSize: 10, color: '#fafafa', textDecoration: 'none', fontFamily: 'inherit' },

  // left:40 (não 10) pra não sobrepor o checkbox de hover, que ocupa o
  // mesmo canto superior esquerdo.
  beforeThumb:   { position: 'absolute', top: 10, left: 40, width: 72, height: 54, borderRadius: 6, overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.6)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)', zIndex: 3 },
  beforeLabel:   { position: 'absolute', bottom: 3, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#fff', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', textShadow: '0 1px 2px rgba(0,0,0,0.8)' },

  // ── Dock do modo seleção ─
  // As margens negativas sangram o dock até as bordas da coluna de conteúdo
  // (que tem 36px de padding), pra ele ler como rodapé e não como cartão.
  dock:          { marginInline: -36, marginTop: 24, borderColor: 'var(--glass-line)' },
  dockInner:     { display: 'flex', alignItems: 'center', gap: 10, maxWidth: 1100, margin: '0 auto' },
  dockCount:     { fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em', marginRight: 'auto' },
  dockCta:       { width: 'auto', minHeight: 36, padding: '0 16px', borderRadius: 999, gap: 6 },
  dockBtn:       { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999 },
  dockDanger:    { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, color: 'var(--color-error)' },

  // ── Abas alternativas (Edições / Vistas / Finalizar / Blocos 3D) ─
  // Aqui o cartão PODE ser vidro: as quatro abas carregam no máximo 50-60
  // itens e não têm "carregar mais".
  tabGrid:       { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' },
  tabCard:       { color: 'inherit', cursor: 'pointer', display: 'block', position: 'relative' },
  tabThumb:      { position: 'relative', aspectRatio: '4 / 3', background: 'var(--color-preview-bg)', overflow: 'hidden' },
  tabImg:        { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },

  // ── Folhas ─
  rowSub:        { paddingLeft: 34 },
  sheetWideBtn:  { width: '100%', marginTop: 14 },
  inlineCta:     { width: 'auto', display: 'inline-flex', textDecoration: 'none', padding: '0 20px', minHeight: 38 },
}
