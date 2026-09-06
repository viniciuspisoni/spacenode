'use client'

// EditV3Flow — Editar V3 (Google/Gemini-first, premium minimalista).
//
// Três zonas: barra vertical de ferramentas (esquerda) · canvas grande (centro)
// · painel contextual da ação (direita) · rodapé com histórico de versões e
// antes/depois. Quatro ações: Remover · Trocar material · Inserir elemento ·
// Refinar área. CTA verde, hairlines 0.5px, radius 14, zero jargão de provider —
// toda a complexidade vive em /api/edit-v3/google.
//
// Fonte da verdade do estilo: tokens --color-* / --font-sans (globals.css). Os
// estilos ficam neste módulo (namespace .edv3-*) — não tocamos globals.css.

import { useCallback, useEffect, useRef, useState } from 'react'
import { EditV3Canvas, type EditV3CanvasHandle, type EditV3Tool } from './EditV3Canvas'
import { BeforeAfter } from './BeforeAfter'
import { EditV2ImportModal } from '@/components/editar/EditV2ImportModal'
import { consumeHandoff } from '@/components/nodi/actions-bus'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import {
  IconWand, IconLasso, IconPolygon, IconBrush, IconEraser, IconHand,
  IconUndo, IconRedo, IconTrash,
  IconRemove, IconMaterial, IconInsert, IconRefine,
  IconUpload, IconHistory, IconDownload,
} from './icons'

// Varinha mágica (seleção por clique via detecção de área no servidor).
// Mesma flag da segmentação de superfície do v1/v2 — o backend é o mesmo
// (/api/edits/segment). Inlinada no build (NEXT_PUBLIC).
const WAND_ENABLED = process.env.NEXT_PUBLIC_EDIT_SURFACE_SEGMENTATION === '1'

// Warm-up dos modelos de segmentação (SAM2 + evf-sam): dispara ao carregar uma
// imagem, fire-and-forget, deduplicado por janela — o 1º clique da varinha cai
// de ~10-30s (cold boot) para ~3s. Custo de casa mínimo; falha é silenciosa.
const WARMUP_WINDOW_MS = 120_000
let lastWarmupAt = 0
function fireWandWarmup(): void {
  if (!WAND_ENABLED) return
  const now = Date.now()
  if (now - lastWarmupAt < WARMUP_WINDOW_MS) return
  lastWarmupAt = now
  void fetch('/api/edits/segment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ warmup: true }),
  }).catch(() => {})
}

/** Tarefa de seleção assistida em andamento (null = ocioso). */
type WandTask = 'point' | 'floor' | 'wall' | 'query'

type Action = 'remove' | 'swap_material' | 'insert_element' | 'refine_area'

// Controles fixos (decisão do dono): sempre preservação MÁXIMA + intensidade
// PADRÃO. Sem toggles na UI — simplicidade e foco em preservar o projeto.

interface ActionDef {
  id: Action
  label: string
  short: string
  Icon: typeof IconRemove
  desc: string
  hint: string
  placeholder: string
  ref: 'material' | 'object' | null
  refLabel?: string
}

const ACTIONS: ActionDef[] = [
  {
    id: 'remove',
    label: 'Remover',
    short: 'Remover',
    Icon: IconRemove,
    desc: 'Objetos, móveis ou elementos que você quer tirar da cena.',
    hint: 'Opcional: contorne o objeto para mirar só nele (sombras/reflexos próximos).',
    placeholder: 'Ex.: retirar o tapete da sala',
    ref: null,
  },
  {
    id: 'swap_material',
    label: 'Trocar material',
    short: 'Material',
    Icon: IconMaterial,
    desc: 'Parede, piso, painel, bancada, marcenaria, pedra, madeira ou metal.',
    hint: 'Opcional: contorne a superfície para trocar só o material dela.',
    placeholder: 'Ex.: trocar o piso por porcelanato amadeirado',
    ref: 'material',
    refLabel: 'Usar referência de material',
  },
  {
    id: 'insert_element',
    label: 'Inserir elemento',
    short: 'Inserir',
    Icon: IconInsert,
    desc: 'Vegetação, mobiliário e detalhes que você quer acrescentar.',
    hint: 'Marque o lugar onde o elemento será inserido.',
    placeholder: 'Ex.: inserir um vaso com planta no canto',
    ref: 'object',
    refLabel: 'Usar imagem de referência',
  },
  {
    id: 'refine_area',
    label: 'Refinar área',
    short: 'Refinar',
    Icon: IconRefine,
    desc: 'Corrigir falhas, artefatos e pequenas imperfeições de uma região.',
    hint: 'Opcional: marque a região que precisa de ajuste.',
    placeholder: 'Ex.: corrigir a textura da parede do fundo',
    ref: null,
  },
]

const MIN_USABLE = 0.0002
const SMALL_WARN = 0.004

interface HistItem {
  url: string
  kind: 'original' | 'result'
}
interface ResultState {
  url: string
  before: string
  nodes: number
  charged: boolean
  width: number | null
  height: number | null
  /** Aviso do gate semântico (advisory com máscara): confira antes de usar. */
  warning: string | null
}

const TOOLS: { id: EditV3Tool; label: string; Icon: typeof IconBrush }[] = [
  ...(WAND_ENABLED ? [{ id: 'wand' as const, label: 'Varinha mágica — clique para selecionar', Icon: IconWand }] : []),
  { id: 'lasso', label: 'Laço', Icon: IconLasso },
  { id: 'polygon', label: 'Polígono', Icon: IconPolygon },
  { id: 'brush', label: 'Pincel', Icon: IconBrush },
  { id: 'eraser', label: 'Borracha', Icon: IconEraser },
  { id: 'pan', label: 'Mover', Icon: IconHand },
]

export function EditV3Flow({ initialBalance }: { initialBalance: number }) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number } | null>(null)
  const [action, setAction] = useState<Action>('swap_material')
  const [instruction, setInstruction] = useState('')

  // Handoff do Nodi (ação confirmada no painel): pré-preenche a instrução.
  useEffect(() => {
    const handoff = consumeHandoff('editar')
    if (!handoff?.prompt) return
    const raf = requestAnimationFrame(() => setInstruction(handoff.prompt!))
    return () => cancelAnimationFrame(raf)
  }, [])
  const [quality] = useState<'standard' | 'high'>('standard') // Alta precisão: gated
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [coverage, setCoverage] = useState(0)
  const [tool, setTool] = useState<EditV3Tool>(WAND_ENABLED ? 'wand' : 'lasso')
  const [brushSize, setBrushSize] = useState(36)
  const [wandMode, setWandMode] = useState<'add' | 'subtract'>('add')
  const [wandTask, setWandTask] = useState<WandTask | null>(null)
  const [wandAt, setWandAt] = useState<{ x: number; y: number } | null>(null)
  const wandBusy = wandTask !== null
  const [cost, setCost] = useState<number | null>(null)
  const [busy, setBusy] = useState<null | 'upload' | 'generate'>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [history, setHistory] = useState<HistItem[]>([])
  const [result, setResult] = useState<ResultState | null>(null)
  const [view, setView] = useState<'edit' | 'result'>('edit')
  const [importOpen, setImportOpen] = useState(false)
  // Comparar o resultado com QUALQUER versão do rodapé (null = o "antes" da
  // edição). Reset a cada novo resultado.
  const [compareWith, setCompareWith] = useState<string | null>(null)

  const canvasRef = useRef<EditV3CanvasHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const refInputRef = useRef<HTMLInputElement | null>(null)
  // Latch SÍNCRONO anti-duplo-envio: `busy` (estado) não vira síncrono, então
  // dois disparos no mesmo tick poderiam submeter (e cobrar) duas vezes.
  const submittingRef = useRef(false)
  // Latch da varinha (1 detecção por vez) + guarda de imagem: uma resposta que
  // chega depois de o usuário trocar de imagem NUNCA vira camada na imagem nova.
  const wandBusyRef = useRef(false)
  const sourceUrlRef = useRef<string | null>(null)
  useEffect(() => {
    sourceUrlRef.current = sourceUrl
  }, [sourceUrl])

  const actionDef = ACTIONS.find(a => a.id === action)!
  const hasSelection = coverage >= MIN_USABLE
  // Seleção é OPCIONAL (exceto Inserir, que exige onde). A instrução nomeia o
  // alvo ("retirar o tapete"); marcar uma área é o reforço de precisão.
  const hasInstruction = instruction.trim().length > 0
  const hasReference = !!referenceUrl
  const taskDescribed = hasInstruction || hasReference
  const ready =
    action === 'insert_element' ? hasSelection && taskDescribed // posição + o quê
    : action === 'swap_material' ? taskDescribed                // precisa dizer o material
    : taskDescribed || hasSelection                             // remove/refine: texto OU área
  // wandBusy bloqueia o Gerar: a seleção em detecção ainda não virou camada.
  const canGenerate = !!sourceUrl && busy === null && ready && !wandBusy

  const softWarning =
    hasSelection && coverage < SMALL_WARN
      ? 'A seleção está pequena, mas você ainda pode gerar. Aumente um pouco a margem para um resultado melhor.'
      : null

  // ── Upload ──────────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File, kind: 'source' | 'mask') => {
    const { url } = await uploadDirect(file, 'retocar-asset', { kind })
    if (!url) throw new Error('Erro ao enviar imagem')
    return url
  }, [])

  const applySource = useCallback(async (url: string, keepHistory = false) => {
    const dims = await new Promise<{ w: number; h: number } | null>(resolve => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve(null)
      img.src = url
    })
    setSourceUrl(url)
    setSourceDims(dims)
    setReferenceUrl(null)
    setInstruction('')
    setCoverage(0)
    setError(null)
    setNotice(null)
    setImportOpen(false)
    setResult(null)
    setCompareWith(null)
    setView('edit')
    if (!keepHistory) setHistory([{ url, kind: 'original' }])
    fireWandWarmup() // modelos de seleção quentes antes do 1º clique
  }, [])

  const handlePickSource = useCallback(
    async (file: File) => {
      setError(null)
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Formato não suportado. Use JPG, PNG ou WebP.')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('Imagem maior que 10 MB.')
        return
      }
      setBusy('upload')
      try {
        await applySource(await uploadFile(file, 'source'))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao enviar imagem')
      } finally {
        setBusy(null)
      }
    },
    [applySource, uploadFile],
  )

  // ── Custo estimado (dry-run server-side; debounce) ──────────────────────
  useEffect(() => {
    if (!sourceUrl) return
    let cancelled = false
    const id = setTimeout(async () => {
      try {
        const res = await fetch('/api/edit-v3/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            source_image_url: sourceUrl,
            instruction: instruction.trim() || 'preview',
            preservation: 'maximum',
            intensity: 'standard',
            quality,
            references: actionDef.ref && referenceUrl ? [{ kind: actionDef.ref, url: referenceUrl }] : [],
            dry_run: true,
            assume_mask: true,
          }),
        })
        const json = await res.json().catch(() => null)
        if (!cancelled && res.ok && typeof json?.nodes_cost === 'number') setCost(json.nodes_cost)
      } catch {
        /* preview best-effort; a geração revalida */
      }
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [sourceUrl, action, quality, referenceUrl, actionDef.ref, instruction])

  useEffect(() => {
    if (busy !== 'generate') return
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [busy])

  // ── Seleção assistida (varinha, Piso/Parede, texto) → camada de seleção ──
  //
  // Um único executor: monta o payload do /api/edits/segment, aplica a máscara
  // detectada como camada bitmap e trata erros/429/imagem-trocada. Cada entrada
  // (clique, chip, instrução) só define a tarefa e o payload.
  const segmentToLayer = useCallback(
    async (
      task: WandTask,
      payload: Record<string, unknown>,
      opts: { subtract?: boolean; point?: { x: number; y: number } | null } = {},
    ) => {
      const src = sourceUrl
      if (!src || busy || wandBusyRef.current) return
      wandBusyRef.current = true
      setWandTask(task)
      setWandAt(opts.point ?? null)
      setError(null)
      try {
        const res = await fetch('/api/edits/segment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: src, skip_preview: true, ...payload }),
        })
        const json = await res.json().catch(() => null)
        if (sourceUrlRef.current !== src) return // trocou de imagem no meio
        if (!res.ok || typeof json?.surface_mask_url !== 'string') {
          setError(
            res.status === 429
              ? 'Muitas seleções em sequência. Aguarde um instante e tente de novo.'
              : res.status === 422 && typeof json?.error === 'string'
                ? json.error
                : 'Não foi possível detectar a área. Tente outro ponto ou marque com o pincel.',
          )
          return
        }
        const ok = await canvasRef.current?.addMaskLayer(json.surface_mask_url, opts.subtract ? 'subtract' : 'add')
        if (!ok) {
          setError('Não foi possível aplicar a área detectada. Marque com o pincel.')
          return
        }
        if (typeof json.target_label === 'string' && json.target_label) {
          const loc = typeof json.target_location === 'string' && json.target_location ? ` · ${json.target_location}` : ''
          setNotice(`Detectado: ${json.target_label}${loc}`)
        }
      } catch {
        if (sourceUrlRef.current === src) setError('Falha de conexão ao detectar a área. Tente novamente.')
      } finally {
        wandBusyRef.current = false
        setWandTask(null)
        setWandAt(null)
      }
    },
    [busy, sourceUrl],
  )

  const handleWandPoint = useCallback(
    (pt: { x: number; y: number }, opts: { alt: boolean }) => {
      // Subtrair só faz sentido com algo selecionado; sem seleção, todo clique soma.
      const subtract = (opts.alt || wandMode === 'subtract') && coverage >= MIN_USABLE
      void segmentToLayer('point', { points: [pt] }, { subtract, point: pt })
    },
    [coverage, segmentToLayer, wandMode],
  )

  const handleSemanticSelect = useCallback(
    (kind: 'floor' | 'wall') => {
      void segmentToLayer(kind, { semantic: kind })
    },
    [segmentToLayer],
  )

  const handleQueryDetect = useCallback(() => {
    const q = instruction.trim()
    if (!q) return
    void segmentToLayer('query', { query: q })
  }, [instruction, segmentToLayer])

  // ── Gerar ───────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!sourceUrl || busy || submittingRef.current) return
    setError(null)
    setNotice(null)
    const hasPaint = !!canvasRef.current?.hasSelection()
    // Só Inserir exige onde (posição). Demais aceitam edição por instrução.
    if (action === 'insert_element' && !hasPaint) {
      setError('Marque o lugar onde o elemento será inserido.')
      return
    }
    submittingRef.current = true
    setElapsed(0)
    setBusy('generate')
    try {
      let maskUrl: string | undefined
      if (hasPaint) {
        const blob = await canvasRef.current?.exportMaskBlob()
        if (blob) maskUrl = await uploadFile(new File([blob], 'mask.png', { type: 'image/png' }), 'mask')
      }
      const res = await fetch('/api/edit-v3/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          source_image_url: sourceUrl,
          ...(maskUrl ? { mask_url: maskUrl } : {}),
          instruction: instruction.trim(),
          preservation: 'maximum',
          intensity: 'standard',
          quality,
          references: actionDef.ref && referenceUrl ? [{ kind: actionDef.ref, url: referenceUrl }] : [],
        }),
      })
      const json = await res.json().catch(() => null)

      if (res.ok && json?.rejected === false && json?.result_url) {
        const r: ResultState = {
          url: json.result_url,
          before: sourceUrl,
          nodes: json.nodes_cost ?? 0,
          charged: json?.charge?.debited === true,
          width: json.output?.width ?? null,
          height: json.output?.height ?? null,
          warning: typeof json.warning === 'string' ? json.warning : null,
        }
        setResult(r)
        setCompareWith(null)
        setHistory(h => [...h, { url: r.url, kind: 'result' }])
        setView('result') // leva o usuário para a visão de resultado (claro que gerou)
        return
      }
      if (json?.rejected === true) {
        setError('A edição alterou mais do que o permitido e foi descartada. Tente uma seleção menor ou mais precisa. Nenhum node foi consumido.')
        return
      }
      setError(json?.error ?? 'Não foi possível concluir a edição. Nenhum node foi consumido.')
    } catch {
      setError('Falha de conexão. Nenhum node foi consumido.')
    } finally {
      submittingRef.current = false
      setBusy(null)
    }
  }, [busy, instruction, action, actionDef.ref, quality, referenceUrl, sourceUrl, uploadFile])

  const editFromResult = useCallback(() => {
    if (!result) return
    void applySource(result.url, true)
    setNotice('Editando a partir do resultado.')
  }, [applySource, result])

  const download = useCallback(async (url: string) => {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'spacenode-editar.png'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [])

  // ── Estilos (tokens da marca; namespace local) ──────────────────────────
  const card: React.CSSProperties = {
    border: '0.5px solid var(--color-border)',
    borderRadius: 14,
    background: 'var(--color-bg-elevated)',
    padding: 16,
  }
  // Títulos do painel em caixa-baixa amigável (não eyebrow técnico).
  const sectionLabel: React.CSSProperties = {
    fontSize: 12.5,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    marginBottom: 10,
  }
  const railBtn = (active: boolean, disabled = false): React.CSSProperties => ({
    width: 34,
    height: 34,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 10,
    border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'transparent'}`,
    background: active ? 'var(--color-surface-hover)' : 'transparent',
    color: disabled ? 'var(--color-text-quaternary)' : active ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
  })

  // ════════════════════════════ EMPTY ════════════════════════════
  if (!sourceUrl) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px' }}>
        <style>{EDV3_CSS}</style>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>Editar</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 6, fontSize: 14 }}>
          Ajustes precisos em imagens de projeto, preservando a arquitetura original.
        </p>
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (f) void handlePickSource(f)
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{ ...card, marginTop: 28, aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', cursor: 'pointer', borderStyle: 'dashed', borderColor: 'var(--color-border-strong)' }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)' }}><IconUpload size={28} /></div>
            <div style={{ fontSize: 15, fontWeight: 500, marginTop: 10 }}>
              {busy === 'upload' ? 'Enviando…' : 'Envie uma imagem do projeto'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
              Arraste aqui ou clique para escolher · JPG, PNG ou WebP até 10 MB
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button type="button" onClick={() => setImportOpen(true)} className="edv3-link">
            <IconHistory size={14} /> importar do histórico
          </button>
        </div>
        {error && <div style={{ marginTop: 14, fontSize: 13, color: 'var(--color-text-secondary)' }}>{error}</div>}
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void handlePickSource(f); e.currentTarget.value = '' }} />
        <EditV2ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSelect={url => void applySource(url)} />
      </div>
    )
  }

  // ════════════════════════════ RESULT ════════════════════════════
  if (view === 'result' && result) {
    return (
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 36px' }}>
        <style>{EDV3_CSS}</style>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 24, height: 24, borderRadius: 99, background: 'var(--color-accent-green)', color: '#08140c', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 14, fontWeight: 700 }}>✓</span>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Edição aplicada</h1>
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
            {result.nodes} nodes · {result.charged ? 'debitados' : 'cobrança simulada nesta fase'} · salva no{' '}
            <a href="/app/history" style={{ color: 'var(--color-text-secondary)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Histórico
            </a>
          </span>
        </div>

        <div style={{ ...card, padding: 12 }}>
          <BeforeAfter before={compareWith ?? result.before} after={result.url} aspect={sourceDims ? sourceDims.w / sourceDims.h : 4 / 3} />
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
            {compareWith
              ? 'Comparando o resultado com a versão selecionada — clique nas versões abaixo para trocar'
              : 'Arraste a alça para comparar antes e depois'}
          </div>
        </div>

        {result.warning && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, border: '0.5px solid var(--color-warning-border)', background: 'var(--color-warning-bg)', fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
            {result.warning}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="edv3-cta" style={{ width: 'auto', padding: '11px 20px' }} onClick={editFromResult}>
            Continuar editando este resultado
          </button>
          <button type="button" className="edv3-ghost" onClick={() => setView('edit')}>Voltar e ajustar</button>
          <button type="button" className="edv3-ghost" onClick={() => void download(result.url)}><IconDownload size={14} /> Baixar</button>
          <a className="edv3-ghost" style={{ textDecoration: 'none' }} href={`/app/upscale?source=${encodeURIComponent(result.url)}`}>
            Ampliar esta imagem
          </a>
          <div style={{ flex: 1 }} />
          <button type="button" className="edv3-ghost" onClick={() => { setView('edit'); setResult(null); setHistory([]); setSourceUrl(null) }}>Nova imagem</button>
        </div>

        {history.length > 1 && (
          <div style={{ ...card, marginTop: 16, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto' }}>
              <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', flexShrink: 0 }}>Versões</span>
              {history.map((h, i) => {
                const isCurrent = h.url === result.url
                const isCompared = !isCurrent && (compareWith ? h.url === compareWith : h.url === result.before)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { if (!isCurrent) setCompareWith(h.url === result.before ? null : h.url) }}
                    title={isCurrent ? 'Resultado atual' : 'Comparar o resultado com esta versão'}
                    style={{ position: 'relative', flexShrink: 0, padding: 0, background: 'none', border: 'none', cursor: isCurrent ? 'default' : 'pointer' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={h.url} alt={h.kind === 'original' ? 'Original' : `Versão ${i}`} style={{ display: 'block', width: 56, height: 40, objectFit: 'cover', borderRadius: 8, border: `1px solid ${isCurrent ? 'var(--color-accent-green)' : isCompared ? 'var(--color-border-strong)' : 'var(--color-border)'}`, opacity: isCurrent || isCompared ? 1 : 0.72 }} />
                    <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: 9, color: 'rgba(255,255,255,0.9)', background: 'rgba(0,0,0,0.5)', padding: '0 4px', borderRadius: 4 }}>
                      {h.kind === 'original' ? 'orig' : `v${i}`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ════════════════════════════ WORK ════════════════════════════
  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: '14px 20px 24px' }}>
      <style>{EDV3_CSS}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Editar</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>Saldo: {initialBalance} nodes</span>
          {result && (
            <button type="button" onClick={() => setView('result')} className="edv3-link" style={{ color: 'var(--color-accent-green)' }}>Ver resultado</button>
          )}
          <button type="button" onClick={() => fileInputRef.current?.click()} className="edv3-link">Nova imagem</button>
          <button type="button" onClick={() => setImportOpen(true)} className="edv3-link">Histórico</button>
        </div>
      </div>

      <div className="edv3-grid">
        {/* ── Zona 1: barra vertical de ferramentas ── */}
        <div className="edv3-rail" style={{ ...card, padding: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, alignSelf: 'start' }}>
          {TOOLS.map(t => (
            <button key={t.id} type="button" title={t.label} aria-label={t.label} style={railBtn(tool === t.id)} onClick={() => setTool(t.id)}>
              <t.Icon size={18} />
            </button>
          ))}
          <div className="edv3-rail-sep" />
          <button type="button" title="Desfazer" aria-label="Desfazer" style={railBtn(false)} onClick={() => canvasRef.current?.undo()}><IconUndo size={18} /></button>
          <button type="button" title="Refazer" aria-label="Refazer" style={railBtn(false)} onClick={() => canvasRef.current?.redo()}><IconRedo size={18} /></button>
          <button
            type="button"
            title="Limpar seleção"
            aria-label="Limpar seleção"
            style={railBtn(false)}
            onClick={() => { canvasRef.current?.clearSelection(); setCoverage(0) }}
          >
            <IconTrash size={18} />
          </button>
        </div>

        {/* ── Zona 2: canvas (protagonista) ── */}
        <div style={{ ...card, padding: 12, display: 'flex', flexDirection: 'column', minHeight: 'min(76vh, 780px)' }}>
          <EditV3Canvas
            ref={canvasRef}
            imageUrl={sourceUrl}
            tool={tool}
            brushSize={brushSize}
            onCoverageChange={setCoverage}
            onWandPoint={handleWandPoint}
            wandBusyAt={wandTask === 'point' ? wandAt : null}
            disabled={busy === 'generate'}
          />
          {tool === 'wand' && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', borderRadius: 9, border: '0.5px solid var(--color-border-strong)', overflow: 'hidden' }}>
                {([['add', '＋ Adicionar'], ['subtract', '－ Remover']] as const).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setWandMode(m)}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      border: 'none',
                      cursor: 'pointer',
                      background: wandMode === m ? 'var(--color-surface-hover)' : 'transparent',
                      color: wandMode === m ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-quaternary)' }}>Atalhos</span>
                <button type="button" className="edv3-chip" disabled={wandBusy} onClick={() => handleSemanticSelect('floor')}>Piso</button>
                <button type="button" className="edv3-chip" disabled={wandBusy} onClick={() => handleSemanticSelect('wall')}>Parede</button>
                <button
                  type="button"
                  className="edv3-chip"
                  disabled={wandBusy || !hasInstruction}
                  title={hasInstruction ? 'Localiza a área citada na sua descrição' : 'Escreva a mudança primeiro — a área citada é localizada automaticamente'}
                  onClick={handleQueryDetect}
                >
                  Detectar pela descrição
                </button>
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                Clique em um objeto ou superfície para selecioná-lo inteiro · Alt-clique remove da seleção
              </span>
            </div>
          )}
          {(tool === 'brush' || tool === 'eraser') && (
            <label style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Tamanho do pincel
              <input type="range" min={8} max={120} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent-green)' }} />
            </label>
          )}
          <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className={wandBusy ? 'edv3-pulse' : undefined} style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: wandBusy || hasSelection ? 'var(--color-accent-green)' : 'var(--color-text-tertiary)' }} />
            {wandBusy
              ? wandTask === 'floor' ? 'Detectando o piso…'
                : wandTask === 'wall' ? 'Detectando a parede…'
                : wandTask === 'query' ? 'Localizando a área citada na descrição…'
                : 'Detectando a área clicada…'
              : hasSelection
                ? `Área marcada — a edição fica só aqui · ${(coverage * 100).toFixed(1)}%`
                : action === 'insert_element'
                  ? 'Marque o lugar onde o elemento será inserido'
                  : tool === 'wand'
                    ? 'Clique no que você quer mudar — a área inteira é detectada'
                    : 'Imagem inteira — pinte uma área se quiser precisão máxima'}
          </div>
          {!hasSelection && action !== 'insert_element' && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Sem marcar uma área, a IA recria a cena para aplicar o pedido. Preservamos o projeto, a câmera e o enquadramento ao máximo, mas pode haver pequenas variações fora do ponto editado.
            </div>
          )}
          {softWarning && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>{softWarning}</div>}
          {busy === 'generate' && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, border: '0.5px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>{hasSelection ? 'Aplicando a edição na área selecionada…' : 'Aplicando a edição na imagem…'}</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{elapsed}s</span>
            </div>
          )}
          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, border: '0.5px solid var(--color-border-strong)', fontSize: 13, color: 'var(--color-text-primary)' }}>{error}</div>
          )}
          {notice && !error && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>{notice}</div>}
        </div>

        {/* ── Zona 3: painel contextual ── */}
        <aside className="edv3-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Ação */}
          <div style={card}>
            <div style={sectionLabel}>O que deseja fazer</div>
            <div className="edv3-actions">
              {ACTIONS.map(a => {
                const active = a.id === action
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setAction(a.id); setError(null); if (!a.ref) setReferenceUrl(null) }}
                    style={{
                      display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center',
                      padding: '11px 12px', borderRadius: 10, textAlign: 'left',
                      border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                      // Cada card tem superfície própria (não depende de hover): leitura imediata.
                      background: active ? 'var(--color-surface-hover)' : 'var(--color-surface)',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'inline-flex', color: active ? 'var(--color-accent-green)' : 'var(--color-text-secondary)' }}><a.Icon size={18} /></span>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{a.short}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 10 }}>{actionDef.desc}</div>
          </div>

          {/* Instrução + referência */}
          <div style={card}>
            <div style={sectionLabel}>Descreva a mudança</div>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder={actionDef.placeholder}
              rows={3}
              style={{ width: '100%', resize: 'vertical', background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 9, padding: '9px 11px', fontSize: 13, color: 'var(--color-text-primary)', outline: 'none' }}
            />
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {action === 'insert_element'
                ? 'Marque na imagem onde o elemento deve entrar.'
                : 'Vale para a imagem toda. Quer mais precisão? Marque a área na imagem.'}
            </div>
            {actionDef.ref && (
              <div style={{ marginTop: 10 }}>
                {referenceUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={referenceUrl} alt="Referência" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '0.5px solid var(--color-border-strong)' }} />
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      Referência ativa
                      <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>Ela orienta a edição — não será editada.</div>
                    </div>
                    <button type="button" onClick={() => setReferenceUrl(null)} className="edv3-link">Remover</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => refInputRef.current?.click()} style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', background: 'none', border: '0.5px dashed var(--color-border-strong)', borderRadius: 9, padding: '8px 12px', width: '100%', cursor: 'pointer' }}>
                    + {actionDef.refLabel}
                  </button>
                )}
                <input ref={refInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (!f) return; try { setError(null); setReferenceUrl(await uploadFile(f, 'source')) } catch { setError('Erro ao enviar referência.') } }} />
              </div>
            )}
          </div>

          {/* CTA (topo) + Custo + preservação — CTA sempre visível no painel */}
          <div style={{ ...card, position: 'sticky', bottom: 12 }}>
            <button type="button" className="edv3-cta" disabled={!canGenerate} onClick={handleGenerate}>
              {busy === 'generate' ? 'Gerando…' : hasSelection ? 'Aplicar na área marcada' : 'Aplicar na imagem'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }}>
              <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>Custo estimado</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{cost !== null ? `${cost} nodes` : '—'}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-quaternary)', textAlign: 'center' }}>
              {!canGenerate
                ? 'Descreva a mudança ou marque uma área para começar.'
                : hasSelection
                  ? 'Geometria, câmera e proporções são preservadas'
                  : 'Preservamos câmera, proporções e enquadramento ao máximo — pode haver pequenas variações.'}
            </div>
          </div>
        </aside>
      </div>

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void handlePickSource(f); e.currentTarget.value = '' }} />
      <EditV2ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSelect={url => void applySource(url)} />
    </div>
  )
}

// CSS local (namespace .edv3-*) — não toca globals.css.
const EDV3_CSS = `
.edv3-grid { display:grid; grid-template-columns: 46px minmax(0,1fr) 300px; gap:14px; align-items:start; }
.edv3-rail-sep { width:24px; height:1px; background:var(--color-border); margin:4px 0; }
.edv3-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.edv3-link { display:inline-flex; align-items:center; gap:5px; font-size:12.5px; color:var(--color-text-secondary); background:none; border:none; cursor:pointer; padding:0; }
.edv3-link:hover { color:var(--color-text-primary); }
.edv3-ghost { display:inline-flex; align-items:center; gap:5px; font-size:12.5px; font-weight:500; color:var(--color-text-secondary); background:var(--color-bg-elevated); border:0.5px solid var(--color-border-strong); border-radius:9px; padding:7px 12px; cursor:pointer; }
.edv3-ghost:hover { color:var(--color-text-primary); background:var(--color-surface-hover); }
.edv3-cta { width:100%; padding:12px 18px; border-radius:10px; font-size:13px; font-weight:600; letter-spacing:-0.01em; color:#08140c; background:var(--color-accent-green); border:0.5px solid var(--color-accent-green); cursor:pointer; transition:opacity .15s, transform .15s; }
.edv3-cta:hover:not(:disabled) { opacity:0.9; }
.edv3-cta:active:not(:disabled) { transform:scale(0.985); }
.edv3-cta:disabled { opacity:0.4; cursor:not-allowed; }
.edv3-pulse { animation: edv3-pulse 1s ease-in-out infinite; }
@keyframes edv3-pulse { 0%,100% { opacity:1 } 50% { opacity:0.25 } }
.edv3-chip { font-size:12px; font-weight:500; color:var(--color-text-secondary); background:var(--color-surface); border:0.5px solid var(--color-border-strong); border-radius:99px; padding:5px 11px; cursor:pointer; }
.edv3-chip:hover:not(:disabled) { color:var(--color-text-primary); background:var(--color-surface-hover); }
.edv3-chip:disabled { opacity:0.45; cursor:not-allowed; }
@media (max-width: 980px) {
  .edv3-grid { grid-template-columns: 46px minmax(0,1fr); }
  .edv3-panel { grid-column: 1 / -1; }
}
@media (max-width: 620px) {
  .edv3-grid { grid-template-columns: 1fr; }
  .edv3-rail { flex-direction: row !important; flex-wrap: wrap; }
  .edv3-rail-sep { width:1px; height:24px; }
}
`
