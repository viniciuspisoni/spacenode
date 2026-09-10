'use client'

// EditV4Flow — o Editar V4.
//
// Duas zonas: o canvas (protagonista) e o painel de vidro à direita. Na
// superfície do painel ficam só os dois campos que o usuário PRECISA preencher
// — o que fazer e a frase que descreve a mudança. Tudo o mais tem default
// defensável e mora atrás de duas linhas que já mostram o valor atual:
// "Seleção" e "Precisão" (docs/VIDRO-NO-APP.md, seção 3).
//
// As ferramentas de seleção não ocupam coluna: elas colam no canvas, que é
// onde a mão do usuário está. É a mesma decisão que o V3 tomou na PR #187, e
// aqui ela vale mais ainda, porque o V4 tem sete ferramentas em vez de cinco.
//
// Material e primitivas vêm do kit de vidro (`components/app/glass` +
// globals.css). O CSS local (namespace `.edv4-*`) é só a geometria desta tela.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditV4Canvas, type EditV4CanvasHandle, type EditV4Tool } from './EditV4Canvas'
import { BeforeAfter } from '@/components/edit-v3/BeforeAfter'
import { EditV2ImportModal } from '@/components/editar/EditV2ImportModal'
import { consumeHandoff } from '@/components/nodi/actions-bus'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import { DEFAULT_WAND_OPTIONS, type WandOptions } from './selection/magic-wand'
import {
  ChoiceGroup,
  RowIcon,
  SettingGroup,
  SettingRow,
  Sheet,
  summarize,
  useAmbient,
} from '@/components/app/glass'
import {
  IconBrush, IconCompare, IconDownload, IconEraser, IconExpand, IconHand,
  IconHistory, IconInvert, IconLasso, IconPolygon, IconRect, IconRedo, IconSnap,
  IconTrash, IconUndo, IconUpload, IconWand,
} from './icons'

type Action = 'remove' | 'swap_material' | 'insert_element' | 'refine_area' | 'replace_object'
type Preservation = 'maximum' | 'standard'
type Intensity = 'subtle' | 'standard' | 'strong'
type EdgeSoftness = 'hard' | 'soft'

interface ActionDef {
  id: Action
  label: string
  note: string
  placeholder: string
  ref: 'material' | 'object' | null
  refLabel?: string
  /** Ação que EXIGE seleção — sem âncora não existe "onde" nem "qual". */
  requiresSelection: boolean
  defaultEdge: EdgeSoftness
}

const ACTIONS: ActionDef[] = [
  {
    id: 'swap_material',
    label: 'Trocar material',
    note: 'Piso, parede, bancada, marcenaria',
    placeholder: 'Ex.: trocar o piso por porcelanato amadeirado',
    ref: 'material',
    refLabel: 'Usar referência de material',
    requiresSelection: false,
    defaultEdge: 'soft',
  },
  {
    id: 'remove',
    label: 'Remover',
    note: 'Tira um objeto da cena',
    placeholder: 'Ex.: retirar o tapete da sala',
    ref: null,
    requiresSelection: false,
    defaultEdge: 'hard',
  },
  {
    id: 'insert_element',
    label: 'Inserir',
    note: 'Vegetação, mobiliário, detalhes',
    placeholder: 'Ex.: inserir um vaso com planta no canto',
    ref: 'object',
    refLabel: 'Usar imagem de referência',
    requiresSelection: true,
    defaultEdge: 'soft',
  },
  {
    id: 'replace_object',
    label: 'Substituir',
    note: 'Troca um objeto por outro',
    placeholder: 'Ex.: trocar este sofá por um de couro caramelo',
    ref: 'object',
    refLabel: 'Usar imagem de referência',
    requiresSelection: true,
    defaultEdge: 'soft',
  },
  {
    id: 'refine_area',
    label: 'Refinar',
    note: 'Corrige falhas e artefatos',
    placeholder: 'Ex.: corrigir a textura da parede do fundo',
    ref: null,
    requiresSelection: false,
    defaultEdge: 'hard',
  },
]

const TOOLS: { id: EditV4Tool; label: string; hint: string; Icon: typeof IconWand }[] = [
  { id: 'wand', label: 'Varinha', hint: 'Clique numa superfície e ela vem inteira (V)', Icon: IconWand },
  { id: 'brush', label: 'Pincel', hint: 'Pinta a seleção à mão (B)', Icon: IconBrush },
  { id: 'eraser', label: 'Borracha', hint: 'Tira da seleção (E)', Icon: IconEraser },
  { id: 'lasso', label: 'Laço', hint: 'Contorna à mão livre (L)', Icon: IconLasso },
  { id: 'polygon', label: 'Polígono', hint: 'Clique a clique, para cantos retos (P)', Icon: IconPolygon },
  { id: 'rect', label: 'Retângulo', hint: 'Arraste uma caixa (R)', Icon: IconRect },
  { id: 'pan', label: 'Mover', hint: 'Arraste a imagem (barra de espaço)', Icon: IconHand },
]

interface ResultState {
  url: string
  before: string
  nodes: number
  charged: boolean
  warning?: string
}

interface HistItem {
  url: string
  kind: 'original' | 'result'
}

export function EditV4Flow({ initialBalance }: { initialBalance: number }) {
  const canvasRef = useRef<EditV4CanvasHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const refInputRef = useRef<HTMLInputElement | null>(null)
  const submittingRef = useRef(false)

  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number } | null>(null)
  const [action, setAction] = useState<Action>('swap_material')
  const [instruction, setInstruction] = useState('')
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)

  const [tool, setTool] = useState<EditV4Tool>('wand')
  const [brushSize, setBrushSize] = useState(46)
  const [wand, setWand] = useState<WandOptions>(DEFAULT_WAND_OPTIONS)
  const [coverage, setCoverage] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [wandAvailable, setWandAvailable] = useState(true)

  const [preservation, setPreservation] = useState<Preservation>('maximum')
  const [intensity, setIntensity] = useState<Intensity>('standard')
  const [edge, setEdge] = useState<EdgeSoftness | null>(null)

  const [sheet, setSheet] = useState<'selecao' | 'precisao' | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [busy, setBusy] = useState<'upload' | 'reference' | 'generate' | 'snap' | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [nodes, setNodes] = useState<number | null>(null)
  const [balance, setBalance] = useState(initialBalance)
  const [result, setResult] = useState<ResultState | null>(null)
  const [history, setHistory] = useState<HistItem[]>([])
  const [view, setView] = useState<'edit' | 'result'>('edit')

  const actionDef = useMemo(() => ACTIONS.find(a => a.id === action) ?? ACTIONS[0], [action])
  const effectiveEdge: EdgeSoftness = edge ?? actionDef.defaultEdge
  const hasSelection = coverage > 0

  // O papel de parede do vidro é a imagem em foco — como no plugin.
  useAmbient(result?.url ?? sourceUrl)

  // Handoff do Nodi: a ação confirmada no painel pré-preenche a instrução.
  useEffect(() => {
    const handoff = consumeHandoff('editar')
    if (!handoff?.prompt) return
    const raf = requestAnimationFrame(() => setInstruction(handoff.prompt!))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Custo: uma consulta seca, sem chamada paga e sem telemetria.
  useEffect(() => {
    let cancelled = false
    fetch('/api/edit-v4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'swap_material', dry_run: true }),
    })
      .then(r => r.json())
      .then(j => {
        if (!cancelled && typeof j?.nodes_cost === 'number') setNodes(j.nodes_cost)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (busy !== 'generate') return
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [busy])

  // ── Atalhos de teclado ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sourceUrl || view !== 'edit') return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const meta = e.ctrlKey || e.metaKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) canvasRef.current?.redo()
        else canvasRef.current?.undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        canvasRef.current?.redo()
        return
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        canvasRef.current?.clearSelection()
        return
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        canvasRef.current?.invert()
        return
      }
      if (meta) return
      const map: Record<string, EditV4Tool> = {
        v: 'wand', b: 'brush', e: 'eraser', l: 'lasso', p: 'polygon', r: 'rect', h: 'pan',
      }
      const next = map[e.key.toLowerCase()]
      if (next) setTool(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sourceUrl, view])

  // ── Upload ────────────────────────────────────────────────────────────────
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
    setCoverage(0)
    setError(null)
    setNotice(null)
    setImportOpen(false)
    setResult(null)
    setView('edit')
    setWandAvailable(true)
    setHistory(h => (keepHistory ? [...h, { url, kind: 'result' }] : [{ url, kind: 'original' }]))
  }, [])

  const handlePickSource = useCallback(
    async (file: File) => {
      setBusy('upload')
      setError(null)
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

  const handlePickReference = useCallback(async (file: File) => {
    setBusy('reference')
    setError(null)
    try {
      const { url } = await uploadDirect(file, 'retocar-reference', {}, { confirm: true })
      if (!url) throw new Error('Erro ao enviar a referência')
      setReferenceUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar a referência')
    } finally {
      setBusy(null)
    }
  }, [])

  // ── Colar na borda (grátis, local no servidor) ────────────────────────────
  const snapToEdges = useCallback(async () => {
    if (!sourceUrl || !canvasRef.current?.hasSelection() || busy) return
    setBusy('snap')
    setError(null)
    try {
      const blob = await canvasRef.current.exportMaskBlob()
      if (!blob) return
      const maskUrl = await uploadFile(new File([blob], 'mask.png', { type: 'image/png' }), 'mask')
      const res = await fetch('/api/edit-v4/mask/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: sourceUrl, mask_url: maskUrl }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.mask_url) {
        setError(json?.error ?? 'Não foi possível ajustar a borda.')
        return
      }
      const ok = await canvasRef.current.loadMask(json.mask_url)
      if (!ok) setError('Não foi possível carregar a borda ajustada.')
      else if (json.changed === false) {
        setNotice('A borda já estava boa — nada mudou.')
      } else {
        setNotice('Borda ajustada ao contorno real.')
      }
    } catch {
      setError('Falha de conexão ao ajustar a borda.')
    } finally {
      setBusy(null)
    }
  }, [busy, sourceUrl, uploadFile])

  // ── Gerar ─────────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!sourceUrl || busy || submittingRef.current) return
    setError(null)
    setNotice(null)
    const painted = !!canvasRef.current?.hasSelection()
    if (actionDef.requiresSelection && !painted) {
      setError(
        action === 'insert_element'
          ? 'Marque o lugar onde o elemento será inserido.'
          : 'Marque o objeto que deseja substituir.',
      )
      return
    }
    if (!painted && !instruction.trim() && !referenceUrl) {
      setError('Descreva o que deseja alterar ou marque uma área.')
      return
    }
    submittingRef.current = true
    setElapsed(0)
    setBusy('generate')
    try {
      let maskUrl: string | undefined
      if (painted) {
        const blob = await canvasRef.current?.exportMaskBlob()
        if (blob) maskUrl = await uploadFile(new File([blob], 'mask.png', { type: 'image/png' }), 'mask')
      }
      const res = await fetch('/api/edit-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          source_image_url: sourceUrl,
          ...(maskUrl ? { mask_url: maskUrl } : {}),
          instruction: instruction.trim(),
          preservation,
          intensity,
          edge_softness: effectiveEdge,
          references: actionDef.ref && referenceUrl ? [{ kind: actionDef.ref, url: referenceUrl }] : [],
        }),
      })
      const json = await res.json().catch(() => null)

      if (res.ok && json?.rejected === false && json?.result_url) {
        const debited = json?.charge?.debited === true
        const cost = json.nodes_cost ?? 0
        setResult({
          url: json.result_url,
          before: sourceUrl,
          nodes: cost,
          charged: debited,
          warning: json.warning,
        })
        if (debited) setBalance(b => Math.max(0, b - cost))
        setHistory(h => [...h, { url: json.result_url, kind: 'result' }])
        setView('result')
        return
      }
      if (json?.rejected === true) {
        setError(`${json.reasons?.[0] ?? 'A edição foi descartada.'} Nenhum node foi consumido.`)
        return
      }
      setError(json?.error ?? 'Não foi possível concluir a edição. Nenhum node foi consumido.')
    } catch {
      setError('Falha de conexão. Nenhum node foi consumido.')
    } finally {
      submittingRef.current = false
      setBusy(null)
    }
  }, [
    action, actionDef.ref, actionDef.requiresSelection, busy, effectiveEdge, instruction,
    intensity, preservation, referenceUrl, sourceUrl, uploadFile,
  ])

  const download = useCallback(async (url: string) => {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'spacenode-editar.png'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [])

  // ════════════════════════════ VAZIO ════════════════════════════
  if (!sourceUrl) {
    return (
      <div className="edv4-page" style={{ maxWidth: 760 }}>
        <style>{EDV4_CSS}</style>
        <h1 className="edv4-h1">Editar</h1>
        <p className="edv4-sub">
          Seleção precisa e edição local, preservando a arquitetura original.
        </p>
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (f) void handlePickSource(f)
          }}
          onClick={() => fileInputRef.current?.click()}
          className="spn-glass edv4-drop"
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)' }}>
              <IconUpload size={28} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, marginTop: 10 }}>
              {busy === 'upload' ? 'Enviando…' : 'Envie uma imagem do projeto'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
              Arraste aqui ou clique para escolher · JPG, PNG ou WebP até 10 MB
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button type="button" onClick={() => setImportOpen(true)} className="edv4-link">
            <IconHistory size={14} /> importar do histórico
          </button>
        </div>
        {error && <div className="spn-error" style={{ marginTop: 14 }}>{error}</div>}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void handlePickSource(f)
            e.currentTarget.value = ''
          }}
        />
        <EditV2ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSelect={url => void applySource(url)} />
      </div>
    )
  }

  // ════════════════════════════ RESULTADO ════════════════════════════
  if (view === 'result' && result) {
    return (
      <div className="edv4-page" style={{ maxWidth: 1080 }}>
        <style>{EDV4_CSS}</style>
        <div className="edv4-result-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Verde é ESTADO — aqui diz "deu certo", não "clique". */}
            <span className="edv4-ok">✓</span>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Edição aplicada</h1>
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
            {result.nodes} nodes · {result.charged ? 'debitados' : 'cobrança simulada nesta fase'} · salva no{' '}
            <a href="/app/history" className="edv4-a">Histórico</a>
          </span>
        </div>

        {result.warning && <div className="spn-error" style={{ marginBottom: 12 }}>{result.warning}</div>}

        <div className="spn-glass" style={{ borderRadius: 'var(--r-card)', padding: 12 }}>
          <BeforeAfter
            before={result.before}
            after={result.url}
            aspect={sourceDims ? sourceDims.w / sourceDims.h : 4 / 3}
          />
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
            <IconCompare size={12} /> Arraste a alça para comparar antes e depois
          </div>
        </div>

        <div className="edv4-result-actions">
          <button
            type="button"
            className="spn-cta"
            style={{ width: 'auto', minWidth: 210 }}
            onClick={() => {
              void applySource(result.url, true)
              setNotice('Editando a partir do resultado.')
            }}
          >
            Continuar editando este resultado
          </button>
          <button type="button" className="spn-ghost" onClick={() => setView('edit')}>Voltar e ajustar</button>
          <button type="button" className="spn-ghost edv4-ghost-row" onClick={() => void download(result.url)}>
            <IconDownload size={14} /> Baixar
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="spn-ghost"
            onClick={() => {
              setView('edit')
              setResult(null)
              setHistory([])
              setSourceUrl(null)
            }}
          >
            Nova imagem
          </button>
        </div>

        {history.length > 1 && (
          <div className="spn-glass edv4-versions">
            <span className="spn-field-label" style={{ marginBottom: 0, flexShrink: 0 }}>Versões</span>
            {history.map((h, i) => (
              <button
                key={`${h.url}-${i}`}
                type="button"
                onClick={() => void applySource(h.url, true)}
                className="edv4-version"
                title={h.kind === 'original' ? 'Original' : `Versão ${i}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={h.url} alt={h.kind === 'original' ? 'Original' : `Versão ${i}`} />
                <span>{h.kind === 'original' ? 'orig' : `v${i}`}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ════════════════════════════ TRABALHO ════════════════════════════
  const coveragePct = Math.round(coverage * 100)
  const generating = busy === 'generate'

  return (
    <div className="edv4-page" style={{ maxWidth: 1440 }}>
      <style>{EDV4_CSS}</style>

      <div className="edv4-head">
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Editar</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {result && (
            <button type="button" onClick={() => setView('result')} className="edv4-link">Ver resultado</button>
          )}
          <button type="button" onClick={() => fileInputRef.current?.click()} className="edv4-link">Nova imagem</button>
          <button type="button" onClick={() => setImportOpen(true)} className="edv4-link">Histórico</button>
        </div>
      </div>

      <div className="edv4-grid">
        {/* ── Palco ── */}
        <div className="edv4-stage">
          <EditV4Canvas
            ref={canvasRef}
            imageUrl={sourceUrl}
            tool={tool}
            brushSize={brushSize}
            wand={wand}
            disabled={generating}
            onSelectionChange={info => {
              setCoverage(info.coverage)
              setCanUndo(info.canUndo)
              setCanRedo(info.canRedo)
            }}
            onZoomChange={setZoom}
            onSampleUnavailable={() => {
              setWandAvailable(false)
              setTool(t => (t === 'wand' ? 'brush' : t))
            }}
          />

          {/* Ferramentas: coladas no canvas, que é onde a mão está. */}
          <div className="edv4-tools spn-glass spn-glass--chrome">
            {TOOLS.map(t => {
              const off = t.id === 'wand' && !wandAvailable
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`edv4-tool${tool === t.id ? ' is-on' : ''}`}
                  onClick={() => setTool(t.id)}
                  disabled={off || generating}
                  title={off ? 'Varinha indisponível para esta imagem' : t.hint}
                  aria-pressed={tool === t.id}
                >
                  <t.Icon size={17} />
                </button>
              )
            })}
          </div>

          {/* Ações da seleção: à direita do palco, sempre no mesmo lugar. */}
          <div className="edv4-selactions spn-glass spn-glass--chrome">
            <button type="button" className="edv4-tool" onClick={() => canvasRef.current?.undo()} disabled={!canUndo || generating} title="Desfazer (Ctrl+Z)">
              <IconUndo size={16} />
            </button>
            <button type="button" className="edv4-tool" onClick={() => canvasRef.current?.redo()} disabled={!canRedo || generating} title="Refazer (Ctrl+Shift+Z)">
              <IconRedo size={16} />
            </button>
            <span className="edv4-tooldiv" />
            <button type="button" className="edv4-tool" onClick={() => canvasRef.current?.invert()} disabled={!hasSelection || generating} title="Inverter seleção (Ctrl+Shift+I)">
              <IconInvert size={16} />
            </button>
            <button type="button" className="edv4-tool" onClick={() => void snapToEdges()} disabled={!hasSelection || !!busy} title="Colar na borda real — grátis">
              <IconSnap size={16} />
            </button>
            <button type="button" className="edv4-tool" onClick={() => canvasRef.current?.clearSelection()} disabled={!hasSelection || generating} title="Desmarcar (Ctrl+D)">
              <IconTrash size={16} />
            </button>
          </div>

          {/* Zoom + estado da seleção. */}
          <div className="edv4-status spn-glass spn-glass--chrome">
            <button type="button" className="edv4-zoom" onClick={() => canvasRef.current?.setZoom(zoom / 1.4)} title="Reduzir">−</button>
            <button type="button" className="edv4-zoomlabel" onClick={() => canvasRef.current?.fit()} title="Ajustar à tela">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="edv4-zoom" onClick={() => canvasRef.current?.setZoom(zoom * 1.4)} title="Ampliar">+</button>
            <span className="edv4-tooldiv" />
            <span className="edv4-cov">
              {hasSelection ? `${coveragePct < 1 ? '<1' : coveragePct}% selecionado` : 'nada selecionado'}
            </span>
          </div>

          {(tool === 'brush' || tool === 'eraser') && (
            <div className="edv4-brush spn-glass spn-glass--chrome">
              <span>Pincel</span>
              <input
                type="range"
                min={4}
                max={220}
                value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
                aria-label="Tamanho do pincel"
              />
              <b>{brushSize}</b>
            </div>
          )}
        </div>

        {/* ── Painel ── */}
        <div className="edv4-panel">
          <div className="edv4-panel-scroll">
            <ChoiceGroup
              label="O que deseja fazer"
              cols={2}
              value={action}
              onChange={v => {
                setAction(v)
                setEdge(null)
                setReferenceUrl(null)
              }}
              options={ACTIONS.map(a => ({ value: a.id, title: a.label, note: a.note }))}
            />

            <div style={{ marginTop: 16 }}>
              <label className="spn-field-label" htmlFor="edv4-instr">Descreva a mudança</label>
              <textarea
                id="edv4-instr"
                className="spn-textarea"
                rows={3}
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                placeholder={actionDef.placeholder}
                disabled={generating}
              />
              <p className="spn-hint">
                {actionDef.requiresSelection
                  ? 'Marque a área na imagem — é ela que diz onde a mudança acontece.'
                  : 'Marque uma área para mirar só nela. Sem marcação, a IA localiza o alvo pela descrição.'}
              </p>
            </div>

            {actionDef.ref && (
              <div style={{ marginTop: 12 }}>
                {referenceUrl ? (
                  <div className="edv4-ref">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={referenceUrl} alt="Referência" />
                    <span>{actionDef.ref === 'material' ? 'Material de referência' : 'Objeto de referência'}</span>
                    <button type="button" className="spn-ghost" onClick={() => setReferenceUrl(null)}>Remover</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="spn-ghost"
                    style={{ width: '100%' }}
                    onClick={() => refInputRef.current?.click()}
                    disabled={busy === 'reference'}
                  >
                    {busy === 'reference' ? 'Enviando…' : `+ ${actionDef.refLabel}`}
                  </button>
                )}
              </div>
            )}

            <SettingGroup className="edv4-group">
              <SettingRow
                icon={<RowIcon name="area" />}
                title="Seleção"
                value={summarize([
                  `Tolerância ${wand.tolerance}`,
                  wand.contiguous ? '' : 'toda a imagem',
                  hasSelection ? `${coveragePct < 1 ? '<1' : coveragePct}% marcado` : '',
                ])}
                onOpen={() => setSheet('selecao')}
                controls="edv4-sheet-selecao"
              />
              <SettingRow
                icon={<RowIcon name="precision" />}
                title="Precisão"
                value={summarize([
                  preservation === 'maximum' ? 'Preserva o máximo' : 'Preservação padrão',
                  intensity === 'standard' ? '' : intensity === 'subtle' ? 'sutil' : 'forte',
                  effectiveEdge === 'soft' ? 'borda macia' : 'borda exata',
                ])}
                onOpen={() => setSheet('precisao')}
                controls="edv4-sheet-precisao"
              />
            </SettingGroup>

            {notice && <p className="edv4-notice">{notice}</p>}
            {error && <div className="spn-error" style={{ marginTop: 12 }}>{error}</div>}
          </div>

          {/* O CTA vive no dock — nunca some no scroll. */}
          <div className="spn-dock">
            <div className="spn-cost">
              <span>{nodes ?? '—'} nodes</span>
              <span className="spn-balance">Saldo: {balance} nodes</span>
            </div>
            <button
              type="button"
              className="spn-cta"
              onClick={() => void handleGenerate()}
              disabled={generating || !!busy}
            >
              {generating ? `Editando… ${elapsed}s` : 'Aplicar na imagem'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Folha: Seleção ── */}
      <Sheet id="edv4-sheet-selecao" open={sheet === 'selecao'} title="Seleção" onClose={() => setSheet(null)}>
        <p className="spn-hint" style={{ marginTop: 0 }}>
          A varinha compara cor levando sombra em conta: clicar num piso pega o piso
          inteiro, com sombra e reflexo, sem invadir o rodapé.
        </p>

        <label className="spn-field-label" htmlFor="edv4-tol">Tolerância</label>
        <div className="edv4-slider">
          <input
            id="edv4-tol"
            type="range"
            min={0}
            max={100}
            value={wand.tolerance}
            onChange={e => setWand(w => ({ ...w, tolerance: Number(e.target.value) }))}
          />
          <b>{wand.tolerance}</b>
        </div>
        <p className="spn-hint">Baixa mira o material exato; alta abraça variações de cor.</p>

        <div style={{ marginTop: 14 }}>
          <ChoiceGroup
            label="Alcance"
            cols={2}
            value={wand.contiguous ? 'perto' : 'toda'}
            onChange={v => setWand(w => ({ ...w, contiguous: v === 'perto' }))}
            options={[
              { value: 'perto', title: 'Área conectada', note: 'Só a mancha do clique' },
              { value: 'toda', title: 'Toda a imagem', note: 'Todo pixel parecido' },
            ]}
          />
          <p className="spn-hint">
            &quot;Toda a imagem&quot; pega todas as partes parecidas de uma vez — útil para ripados
            e peças repetidas.
          </p>
        </div>

        <div style={{ marginTop: 18 }}>
          <span className="spn-field-label">Ajustar a seleção</span>
          <div className="edv4-sheet-actions">
            <button type="button" className="spn-ghost" onClick={() => canvasRef.current?.expand(2)} disabled={!hasSelection}>
              <IconExpand size={14} /> Expandir 2px
            </button>
            <button type="button" className="spn-ghost" onClick={() => canvasRef.current?.contract(2)} disabled={!hasSelection}>
              Contrair 2px
            </button>
            <button type="button" className="spn-ghost" onClick={() => canvasRef.current?.smooth(2)} disabled={!hasSelection}>
              Suavizar
            </button>
            <button type="button" className="spn-ghost" onClick={() => canvasRef.current?.fillHoles()} disabled={!hasSelection}>
              Tapar buracos
            </button>
            <button type="button" className="spn-ghost" onClick={() => canvasRef.current?.cleanIslands()} disabled={!hasSelection}>
              Limpar respingos
            </button>
            <button type="button" className="spn-ghost" onClick={() => void snapToEdges()} disabled={!hasSelection || !!busy}>
              <IconSnap size={14} /> {busy === 'snap' ? 'Ajustando…' : 'Colar na borda'}
            </button>
            <button type="button" className="spn-ghost" onClick={() => canvasRef.current?.selectAll()}>
              Selecionar tudo
            </button>
            <button type="button" className="spn-ghost" onClick={() => canvasRef.current?.invert()} disabled={!hasSelection}>
              <IconInvert size={14} /> Inverter
            </button>
          </div>
          <p className="spn-hint">Ajustar a seleção não consome nenhum node.</p>
        </div>
      </Sheet>

      {/* ── Folha: Precisão ── */}
      <Sheet id="edv4-sheet-precisao" open={sheet === 'precisao'} title="Precisão" onClose={() => setSheet(null)}>
        <ChoiceGroup
          label="Preservação fora da área"
          cols={2}
          value={preservation}
          onChange={setPreservation}
          options={[
            { value: 'maximum', title: 'Preserva o máximo', note: 'Nada fora da marcação se mexe' },
            { value: 'standard', title: 'Padrão', note: 'Aceita ajuste natural na emenda' },
          ]}
        />
        <div style={{ marginTop: 16 }}>
          <ChoiceGroup
            label="Intensidade da mudança"
            cols={3}
            value={intensity}
            onChange={setIntensity}
            options={[
              { value: 'subtle', title: 'Sutil', note: 'O mínimo que resolve' },
              { value: 'standard', title: 'Padrão', note: 'Equilibrada' },
              { value: 'strong', title: 'Forte', note: 'Sem meio-termo' },
            ]}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <ChoiceGroup
            label="Borda da edição"
            cols={2}
            value={effectiveEdge}
            onChange={setEdge}
            options={[
              { value: 'hard', title: 'Exata', note: 'Corta no contorno marcado' },
              { value: 'soft', title: 'Macia', note: 'Funde com o entorno' },
            ]}
          />
          <p className="spn-hint">
            Material novo costuma pedir borda macia; remoção e correção pedem borda exata.
          </p>
        </div>
      </Sheet>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) void handlePickSource(f)
          e.currentTarget.value = ''
        }}
      />
      <input
        ref={refInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) void handlePickReference(f)
          e.currentTarget.value = ''
        }}
      />
      <EditV2ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSelect={url => void applySource(url)} />
    </div>
  )
}

const EDV4_CSS = `
.edv4-page { padding: 22px 24px 28px; margin: 0 auto; }
.edv4-h1 { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; }
.edv4-sub { color: var(--color-text-secondary); margin-top: 6px; font-size: 13.5px; }
.edv4-drop {
  margin-top: 28px; aspect-ratio: 16 / 9; display: grid; place-items: center;
  cursor: pointer; border-radius: var(--r-card);
  border-style: dashed; border-color: var(--glass-line-strong);
}
.edv4-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; gap: 12px; }
.edv4-link {
  background: none; border: 0; padding: 0; cursor: pointer; font-size: 12.5px;
  color: var(--color-text-secondary); display: inline-flex; align-items: center; gap: 6px;
}
.edv4-link:hover { color: var(--color-text); }
.edv4-a { color: var(--color-text-secondary); text-decoration: underline; text-underline-offset: 3px; }

.edv4-grid { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: stretch; }
@media (max-width: 1100px) { .edv4-grid { grid-template-columns: 1fr; } }

.edv4-stage { position: relative; min-height: 62vh; height: 72vh; }
@media (max-width: 1100px) { .edv4-stage { height: 58vh; } }

.edv4-tools, .edv4-selactions, .edv4-status, .edv4-brush {
  position: absolute; display: flex; align-items: center; gap: 2px;
  padding: 4px; border-radius: 12px;
}
.edv4-tools { left: 10px; top: 10px; flex-direction: column; }
.edv4-selactions { right: 10px; top: 10px; flex-direction: column; }
.edv4-status { left: 10px; bottom: 10px; gap: 6px; padding: 4px 8px; }
.edv4-brush { right: 10px; bottom: 10px; gap: 8px; padding: 6px 10px; font-size: 11.5px; color: var(--color-text-secondary); }
.edv4-brush input { width: 110px; }
.edv4-brush b { font-variant-numeric: tabular-nums; min-width: 24px; text-align: right; color: var(--color-text); }

.edv4-tool {
  width: 32px; height: 32px; display: grid; place-items: center;
  border: 0; background: transparent; border-radius: 9px; cursor: pointer;
  color: var(--color-text-secondary); transition: background var(--ease), color var(--ease);
}
.edv4-tool:hover:not(:disabled) { color: var(--color-text); background: var(--glass-fill-weak); }
.edv4-tool.is-on { color: var(--color-text); background: var(--glass-fill-strong); }
.edv4-tool:disabled { opacity: 0.35; cursor: not-allowed; }
.edv4-tooldiv { display: block; width: 18px; height: 1px; background: var(--glass-line); margin: 3px auto; }
.edv4-status .edv4-tooldiv { width: 1px; height: 16px; margin: 0 2px; }

.edv4-zoom {
  width: 22px; height: 22px; border: 0; background: transparent; cursor: pointer;
  color: var(--color-text-secondary); font-size: 15px; line-height: 1; border-radius: 6px;
}
.edv4-zoom:hover { color: var(--color-text); background: var(--glass-fill-weak); }
.edv4-zoomlabel {
  border: 0; background: transparent; cursor: pointer; font-size: 11.5px;
  color: var(--color-text); font-variant-numeric: tabular-nums; min-width: 42px;
}
.edv4-cov { font-size: 11.5px; color: var(--color-text-tertiary); }

.edv4-panel {
  display: flex; flex-direction: column; min-height: 0;
  border-radius: var(--r-card); overflow: hidden;
}
.edv4-panel-scroll { flex: 1; overflow-y: auto; padding: 2px 2px 14px; min-height: 0; }
.edv4-group { margin-top: 16px; }
.edv4-notice { font-size: 12px; color: var(--color-text-secondary); margin-top: 12px; }

.edv4-ref { display: flex; align-items: center; gap: 10px; }
.edv4-ref img { width: 44px; height: 44px; object-fit: cover; border-radius: 9px; }
.edv4-ref span { flex: 1; font-size: 12.5px; color: var(--color-text-secondary); }

.edv4-slider { display: flex; align-items: center; gap: 10px; }
.edv4-slider input { flex: 1; }
.edv4-slider b { font-variant-numeric: tabular-nums; min-width: 26px; text-align: right; }
.edv4-sheet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.edv4-sheet-actions .spn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }

.edv4-result-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; gap: 12px; flex-wrap: wrap; }
.edv4-ok {
  width: 24px; height: 24px; border-radius: 99px; background: var(--color-accent-green);
  color: #08140c; display: grid; place-items: center; flex-shrink: 0; font-size: 14px; font-weight: 700;
}
.edv4-result-actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; align-items: center; }
.edv4-ghost-row { display: inline-flex; align-items: center; gap: 6px; }
.edv4-versions { border-radius: var(--r-card); margin-top: 16px; padding: 12px; display: flex; align-items: center; gap: 10px; overflow-x: auto; }
.edv4-version { position: relative; flex-shrink: 0; border: 0; background: none; padding: 0; cursor: pointer; }
.edv4-version img { width: 56px; height: 40px; object-fit: cover; border-radius: 8px; border: 0.5px solid var(--glass-line-strong); display: block; }
.edv4-version span {
  position: absolute; bottom: 2px; left: 4px; font-size: 9px; color: rgba(255,255,255,0.9);
  background: rgba(0,0,0,0.5); padding: 0 4px; border-radius: 4px;
}
`
