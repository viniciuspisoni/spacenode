'use client'

// FinalizeEditor — orquestrador do Finalizar v2 (pós-produção arquitetônica).
//
// Área de trabalho desktop-first: barra superior, trilho de ferramentas à
// esquerda, canvas central e painel contextual à direita (recolhível).
//
// TUDO local e não destrutivo: ajustes, curvas, HSL, máscaras, geometria,
// elementos e exportação rodam no navegador (motor WebGL) — zero Nodes.
// Exceção única: a Limpeza (IA) usa a infra de /api/edits, com custo mostrado
// ANTES da execução. A imagem original nunca é sobrescrita.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  type CropRect, type ElementTransform, type FinalizeDoc, type FinalizeProject,
  type FinalizeProjectSummary, type MaskShape, type MaskStroke,
  MAX_ELEMENTS, MAX_LOCAL_ADJUSTMENTS, MAX_SNAPSHOTS,
} from '@/lib/finalizar/types'
import {
  compactStroke, createDocument, deserializeDocument, isGeometryIdentity,
  makeId, newElementLayer, newLocalAdjustment, serializeDocument,
} from '@/lib/finalizar/composition'
import { DocHistory } from '@/lib/finalizar/history'
import {
  adjustmentsSummary, downloadBlob, renderExport,
} from '@/lib/finalizar/export'
import { computeColorMatch, displayToSource, imageStats, solveNeutral, type Histogram } from '@/lib/finalizar/engine/color-math'
import { estimateStrokeCoverage, strokesMaskPngCanvas } from '@/lib/finalizar/engine/masks'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import {
  CanvasViewport,
  type BrushSettings, type CanvasViewportHandle, type CompareMode,
  type MaskOverlayColor, type StrokeTarget,
} from './CanvasViewport'
import { TopBar, StatusStrip, type SaveStatus } from './TopBar'
import { ToolRail, type EditorTool } from './ToolRail'
import { ExportDialog, type ExportOptions } from './ExportDialog'
import { FinalizeImportModal } from './FinalizeImportModal'
import { AdjustPanel, type QuickFix } from './panels/AdjustPanel'
import { ColorPanel } from './panels/ColorPanel'
import { MasksPanel, type QuickMask } from './panels/MasksPanel'
import { CleanupPanel, type CleanupPreview } from './panels/CleanupPanel'
import { GeometryPanel } from './panels/GeometryPanel'
import { ElementsPanel } from './panels/ElementsPanel'
import { HistoryPanel } from './panels/HistoryPanel'

interface Props {
  initialProject?: FinalizeProject | null
  initialSourceUrl?: string | null
  savedProjects?: FinalizeProjectSummary[]
}

const PANEL_TITLE: Record<EditorTool, string> = {
  adjust: 'Ajustes',
  color: 'Cor e atmosfera',
  masks: 'Máscaras e ajustes locais',
  cleanup: 'Limpeza (IA)',
  geometry: 'Geometria',
  elements: 'Elementos',
  history: 'Histórico e versões',
}

const AUTOSAVE_DELAY = 3500
const TREATMENT_CLIPBOARD_KEY = 'spn-finalizar-treatment-v1'
const PANEL_WIDTH_KEY = 'spn-finalizar-panel-w'

/** URLs assinadas do Storage expiram — persiste sempre a forma pública
 *  (estável; o proxy de mídia resolve o acesso quando o bucket for privado). */
function toStableStorageUrl(url: string): string {
  if (!url.includes('/storage/v1/object/sign/')) return url
  const noQuery = url.split('?')[0]
  return noQuery.replace('/storage/v1/object/sign/', '/storage/v1/object/public/')
}

export function FinalizeEditor({ initialProject, initialSourceUrl, savedProjects = [] }: Props) {
  const router = useRouter()
  const viewportRef = useRef<CanvasViewportHandle | null>(null)
  const historyRef = useRef(new DocHistory())
  const thumbUrlRef = useRef<string | null>(initialProject?.thumbnail_url ?? null)

  // ── documento ──────────────────────────────────────────────────────────────
  const [doc, setDoc] = useState<FinalizeDoc | null>(() => {
    if (!initialProject) return null
    const d = deserializeDocument(initialProject.document)
    if (d) return d
    if (initialProject.base_image_url && initialProject.width && initialProject.height) {
      return createDocument(initialProject.base_image_url, initialProject.width, initialProject.height)
    }
    return null
  })
  const docRef = useRef<FinalizeDoc | null>(doc)
  const [projectId, setProjectId] = useState<string | null>(initialProject?.id ?? null)
  const [name, setName] = useState(initialProject?.name ?? 'Projeto sem título')

  /** Espelho do histórico para render (regra: refs não são lidos no render). */
  interface HistoryUi { canUndo: boolean; canRedo: boolean; steps: { label: string; at: number; current: boolean }[] }
  const [historyUi, setHistoryUi] = useState<HistoryUi>({ canUndo: false, canRedo: false, steps: [] })
  const syncHistoryUi = useCallback(() => {
    const h = historyRef.current
    setHistoryUi({ canUndo: h.canUndo(), canRedo: h.canRedo(), steps: h.list() })
  }, [])

  // ── UI ─────────────────────────────────────────────────────────────────────
  const [tool, setTool] = useState<EditorTool>('adjust')
  const [panelsOpen, setPanelsOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(312)
  const panelWidthRef = useRef(panelWidth)
  useEffect(() => { panelWidthRef.current = panelWidth }, [panelWidth])
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(PANEL_WIDTH_KEY))
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do localStorage no cliente
      if (Number.isFinite(saved) && saved >= 264 && saved <= 480) setPanelWidth(saved)
    } catch { /* sem storage */ }
  }, [])
  const [compare, setCompare] = useState(false)
  const [compareMode, setCompareMode] = useState<CompareMode>('none')
  const [maskOverlayColor, setMaskOverlayColor] = useState<MaskOverlayColor>('green')
  const [pasteAvailable, setPasteAvailable] = useState(false)
  const [zoomPct, setZoomPct] = useState(100)
  const [activeLocalId, setActiveLocalId] = useState<string | null>(null)
  const [activeElementId, setActiveElementId] = useState<string | null>(null)
  const [elementMaskMode, setElementMaskMode] = useState(false)
  const [maskInteraction, setMaskInteraction] = useState<'brush' | 'shape'>('brush')
  const [showMaskOverlay, setShowMaskOverlay] = useState(true)
  const [brush, setBrush] = useState<BrushSettings>({ size: 64, hardness: 0.5, flow: 1, erase: false })
  const [wbPicking, setWbPicking] = useState(false)
  const [histogram, setHistogram] = useState<Histogram | null>(null)
  const [matchBusy, setMatchBusy] = useState(false)
  const [skyBusy, setSkyBusy] = useState(false)

  // ── persistência ───────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(initialProject ? 'saved' : 'none')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Reprograma o autosave após cada save (cobre edições mid-save). */
  const [saveEpoch, setSaveEpoch] = useState(0)
  /** updated_at da última leitura/gravação — pré-condição contra abas concorrentes. */
  const lastUpdatedAtRef = useRef<string | null>(initialProject?.updated_at ?? null)

  const [exportOpen, setExportOpen] = useState(false)
  const [importPurpose, setImportPurpose] = useState<'base' | 'element' | null>(
    initialProject || initialSourceUrl ? null : 'base',
  )

  // ── limpeza (IA) ───────────────────────────────────────────────────────────
  const [cleanupStrokes, setCleanupStrokes] = useState<MaskStroke[]>([])
  const [cleanupMode, setCleanupMode] = useState<'remove' | 'fix'>('remove')
  const [cleanupPrompt, setCleanupPrompt] = useState('')
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(null)
  const [cleanupPreviewLoading, setCleanupPreviewLoading] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [cleanupMsg, setCleanupMsg] = useState<{ text: string; kind: 'error' | 'info' } | null>(null)
  const [balance, setBalance] = useState<number | null>(null)

  // ═══════════════════════════════════════════════════════════════════════════
  // Mutação do documento + histórico
  // ═══════════════════════════════════════════════════════════════════════════

  const markDirty = useCallback(() => {
    dirtyRef.current = true
    setSaveStatus((s) => (s === 'saving' ? s : 'dirty'))
  }, [])

  const patch = useCallback((label: string, updater: (d: FinalizeDoc) => FinalizeDoc, coalesceKey?: string) => {
    const cur = docRef.current
    if (!cur) return
    const next = updater(cur)
    if (next === cur) return
    docRef.current = next
    historyRef.current.push(label, next, coalesceKey)
    setDoc(next)
    syncHistoryUi()
    markDirty()
  }, [markDirty, syncHistoryUi])

  const applyHistoryDoc = useCallback((d: FinalizeDoc | null) => {
    if (!d) return
    docRef.current = d
    setDoc(d)
    syncHistoryUi()
    markDirty()
    // Seleções podem apontar para itens removidos pelo undo.
    setActiveLocalId((id) => (id && d.locals.some((l) => l.id === id) ? id : null))
    setActiveElementId((id) => (id && d.elements.some((e) => e.id === id) ? id : null))
  }, [markDirty, syncHistoryUi])

  const undo = useCallback(() => applyHistoryDoc(historyRef.current.undo()), [applyHistoryDoc])
  const redo = useCallback(() => applyHistoryDoc(historyRef.current.redo()), [applyHistoryDoc])

  // ── nova base ──────────────────────────────────────────────────────────────
  const loadDims = (url: string) => new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve({ w: img.naturalWidth || 1024, h: img.naturalHeight || 1024 })
    img.onerror = () => reject(new Error('Não foi possível carregar a imagem.'))
    img.src = url
  })

  const chooseBase = useCallback(async (url: string) => {
    setError(null)
    try {
      const { w, h } = await loadDims(url)
      const d = createDocument(url, w, h)
      docRef.current = d
      setDoc(d)
      historyRef.current.reset(d)
      syncHistoryUi()
      setProjectId(null)
      setName('Projeto sem título')
      thumbUrlRef.current = null
      setSaveStatus('none')
      dirtyRef.current = true
      setImportPurpose(null)
      setActiveLocalId(null)
      setActiveElementId(null)
      setCleanupStrokes([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar imagem.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // histórico inicial + ?source= pré-carrega a base (init de montagem)
  useEffect(() => {
    if (docRef.current) historyRef.current.reset(docRef.current)
    syncHistoryUi()
    if (!docRef.current && initialSourceUrl) void chooseBase(initialSourceUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addElement = useCallback(async (url: string) => {
    setError(null)
    const cur = docRef.current
    if (!cur) return
    if (cur.elements.length >= MAX_ELEMENTS) {
      setError(`Limite de ${MAX_ELEMENTS} elementos por projeto.`)
      setImportPurpose(null)
      return
    }
    try {
      await loadDims(url) // valida que a imagem carrega antes de adicionar
      // entra ocupando ~45% da largura, centralizado
      const el = newElementLayer({ url, name: `Elemento ${cur.elements.length + 1}`, width: 0.45 })
      patch(`Adicionar ${el.name}`, (d) => ({ ...d, elements: [...d.elements, el] }))
      setActiveElementId(el.id)
      setTool('elements')
      setElementMaskMode(false)
      setImportPurpose(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar imagem.')
    }
  }, [patch])

  // ═══════════════════════════════════════════════════════════════════════════
  // Interações vindas do viewport
  // ═══════════════════════════════════════════════════════════════════════════

  const onStrokeCommit = useCallback((target: StrokeTarget, rawStroke: MaskStroke) => {
    // Enxuga o traço antes de persistir (jsonb pequeno, sem perda visual).
    const stroke = compactStroke(rawStroke)
    if (target.kind === 'cleanup') {
      setCleanupStrokes((prev) => [...prev, stroke])
      setCleanupMsg(null)
      return
    }
    if (target.kind === 'local') {
      const local = docRef.current?.locals.find((l) => l.id === target.id)
      patch(`Pincel — ${local?.name ?? 'máscara'}`, (d) => ({
        ...d,
        locals: d.locals.map((l) => (l.id === target.id ? { ...l, strokes: [...l.strokes, stroke] } : l)),
      }))
      return
    }
    const el = docRef.current?.elements.find((e) => e.id === target.id)
    patch(`Máscara — ${el?.name ?? 'elemento'}`, (d) => ({
      ...d,
      elements: d.elements.map((e) => (e.id === target.id ? { ...e, maskStrokes: [...e.maskStrokes, stroke] } : e)),
    }))
  }, [patch])

  const onShapeChange = useCallback((localId: string, shape: MaskShape) => {
    patch('Ajustar gradiente', (d) => ({
      ...d,
      locals: d.locals.map((l) => (l.id === localId ? { ...l, shape } : l)),
    }), `shape.${localId}`)
  }, [patch])

  const onElementChange = useCallback((id: string, t: ElementTransform) => {
    // Clique sem arrasto devolve o transform inalterado — não vira passo de histórico.
    const cur = docRef.current?.elements.find((e) => e.id === id)
    if (!cur) return
    const same = cur.transform.x === t.x && cur.transform.y === t.y
      && cur.transform.width === t.width && cur.transform.rotation === t.rotation
      && cur.transform.flipH === t.flipH && cur.transform.flipV === t.flipV
    if (same) return
    patch('Transformar elemento', (d) => ({
      ...d,
      elements: d.elements.map((e) => (e.id === id ? { ...e, transform: t } : e)),
    }), `el.t.${id}`)
  }, [patch])

  const onCropChange = useCallback((crop: CropRect) => {
    patch('Corte', (d) => ({ ...d, geometry: { ...d.geometry, crop } }), 'geo.crop')
  }, [patch])

  const onPickWb = useCallback((rgb: [number, number, number]) => {
    const solved = solveNeutral(rgb[0], rgb[1], rgb[2])
    setWbPicking(false)
    if (!solved) {
      setError('Não foi possível calcular a correção a partir desse ponto.')
      return
    }
    patch('Corrigir dominante de cor', (d) => ({
      ...d,
      adjust: { ...d.adjust, temperature: solved.temperature, tint: solved.tint },
    }))
  }, [patch])

  // ═══════════════════════════════════════════════════════════════════════════
  // Máscaras rápidas (inclui céu heurístico)
  // ═══════════════════════════════════════════════════════════════════════════

  const onAddLocal = useCallback(async (kind: QuickMask) => {
    const cur = docRef.current
    if (!cur || cur.locals.length >= MAX_LOCAL_ADJUSTMENTS) return
    const n = cur.locals.length + 1

    if (kind === 'sky') {
      setSkyBusy(true)
      setError(null)
      try {
        const canvas = viewportRef.current?.makeSkyMask()
        if (!canvas) {
          setError('Não encontrei céu nesta imagem — use o pincel ou um gradiente linear.')
          return
        }
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
        if (!blob) throw new Error('Falha ao gerar a máscara de céu.')
        const { url } = await uploadDirect(blob, 'finalizar-asset', { kind: 'mask' })
        const local = newLocalAdjustment({ kind: 'sky', bakedUrl: url }, 'Céu')
        patch('Nova máscara: Céu (auto)', (d) => ({ ...d, locals: [...d.locals, local] }))
        setActiveLocalId(local.id)
        setMaskInteraction('brush')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao criar a máscara de céu.')
      } finally {
        setSkyBusy(false)
      }
      return
    }

    let local
    switch (kind) {
      case 'linear':
        local = newLocalAdjustment({ kind: 'linear', x0: 0.5, y0: 0.1, x1: 0.5, y1: 0.55 }, `Gradiente ${n}`)
        setMaskInteraction('shape')
        break
      case 'radial':
        local = newLocalAdjustment({ kind: 'radial', cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.22, feather: 0.5 }, `Radial ${n}`)
        setMaskInteraction('shape')
        break
      case 'windows':
        local = newLocalAdjustment({ kind: 'luminosity', min: 0.75, max: 1, smooth: 0.12 }, 'Janelas estouradas')
        local.values.highlights = -55
        setMaskInteraction('brush')
        break
      case 'shadows':
        local = newLocalAdjustment({ kind: 'luminosity', min: 0, max: 0.3, smooth: 0.15 }, 'Sombras')
        local.values.shadows = 25
        setMaskInteraction('brush')
        break
      default:
        local = newLocalAdjustment({ kind: 'brush' }, `Pincel ${n}`)
        setMaskInteraction('brush')
    }
    patch(`Nova máscara: ${local.name}`, (d) => ({ ...d, locals: [...d.locals, local] }))
    setActiveLocalId(local.id)
  }, [patch])

  // ═══════════════════════════════════════════════════════════════════════════
  // Correções rápidas de arquitetura (combinações reais de máscaras + ajustes)
  // ═══════════════════════════════════════════════════════════════════════════

  const onQuickFix = useCallback((kind: QuickFix) => {
    const cur = docRef.current
    if (!cur) return
    switch (kind) {
      case 'janelas':
        void onAddLocal('windows')
        return
      case 'interior-exterior': {
        if (cur.locals.length > MAX_LOCAL_ADJUSTMENTS - 2) {
          setError(`Sem espaço para 2 novas máscaras (limite de ${MAX_LOCAL_ADJUSTMENTS}).`)
          return
        }
        const sombras = newLocalAdjustment({ kind: 'luminosity', min: 0, max: 0.35, smooth: 0.15 }, 'Interior (sombras)')
        sombras.values.shadows = 30
        sombras.values.exposure = 8
        const realces = newLocalAdjustment({ kind: 'luminosity', min: 0.7, max: 1, smooth: 0.12 }, 'Exterior (realces)')
        realces.values.highlights = -25
        patch('Equilibrar interior/exterior', (d) => ({ ...d, locals: [...d.locals, sombras, realces] }))
        setActiveLocalId(sombras.id)
        return
      }
      case 'estouradas':
        patch('Reduzir estouradas', (d) => ({
          ...d,
          adjust: {
            ...d.adjust,
            highlights: Math.max(-100, d.adjust.highlights - 35),
            whites: Math.max(-100, d.adjust.whites - 15),
          },
        }))
        return
      case 'materiais':
        patch('Realçar materiais', (d) => ({
          ...d,
          adjust: {
            ...d.adjust,
            clarity: Math.min(100, d.adjust.clarity + 18),
            sharpen: Math.min(100, d.adjust.sharpen + 12),
          },
        }))
        return
      case 'luz-artificial':
        patch('Suavizar luz artificial', (d) => ({
          ...d,
          adjust: {
            ...d.adjust,
            temperature: Math.max(-100, d.adjust.temperature - 8),
            highlights: Math.max(-100, d.adjust.highlights - 12),
          },
        }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch])

  // ═══════════════════════════════════════════════════════════════════════════
  // Tratamento: copiar/colar entre projetos (consistência entre vistas)
  // ═══════════════════════════════════════════════════════════════════════════

  const onCopyTreatment = useCallback(() => {
    const d = docRef.current
    if (!d) return
    try {
      window.localStorage.setItem(TREATMENT_CLIPBOARD_KEY, JSON.stringify({
        adjust: d.adjust, vignette: d.vignette, curve: d.curve,
        hsl: d.hsl, grading: d.grading, treatmentAmount: d.treatmentAmount,
      }))
      setPasteAvailable(true)
    } catch {
      setError('Não foi possível copiar o tratamento (armazenamento local indisponível).')
    }
  }, [])

  const onPasteTreatment = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(TREATMENT_CLIPBOARD_KEY)
      if (!raw) return
      const t = JSON.parse(raw) as Record<string, unknown>
      patch('Colar tratamento', (d) => {
        // O sanitizador do documento garante shape/limites do que veio do storage.
        const merged = deserializeDocument({ ...d, ...t, snapshots: d.snapshots, versions: d.versions })
        return merged ?? d
      })
    } catch {
      setError('O tratamento copiado é inválido.')
    }
  }, [patch])

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do localStorage no cliente
      setPasteAvailable(Boolean(window.localStorage.getItem(TREATMENT_CLIPBOARD_KEY)))
    } catch { /* sem storage */ }
  }, [])

  // ═══════════════════════════════════════════════════════════════════════════
  // Elementos: correspondência automática de cor com a base
  // ═══════════════════════════════════════════════════════════════════════════

  const onAutoColorMatch = useCallback(async (id: string) => {
    const cur = docRef.current
    const el = cur?.elements.find((e) => e.id === id)
    const baseImg = viewportRef.current?.baseImage()
    if (!el || !baseImg) return
    try {
      const elImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Não foi possível carregar o elemento.'))
        img.src = el.url
      })
      const m = computeColorMatch(
        imageStats(elImg, elImg.naturalWidth, elImg.naturalHeight),
        imageStats(baseImg, baseImg.naturalWidth, baseImg.naturalHeight),
      )
      patch('Ajustar cor do elemento ao fundo', (d) => ({
        ...d,
        elements: d.elements.map((e) => (e.id === id ? { ...e, colorMatch: { gain: m.gain, offset: m.offset, amount: 70 } } : e)),
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao analisar o elemento.')
    }
  }, [patch])

  // ═══════════════════════════════════════════════════════════════════════════
  // Snapshots (marcos nomeados persistidos no documento)
  // ═══════════════════════════════════════════════════════════════════════════

  const onSaveSnapshot = useCallback((sname: string) => {
    patch(`Snapshot: ${sname}`, (d) => {
      if (d.snapshots.length >= MAX_SNAPSHOTS) return d
      const inner: FinalizeDoc = { ...d, snapshots: [] }
      return {
        ...d,
        snapshots: [...d.snapshots, { id: makeId('s'), name: sname, createdAt: new Date().toISOString(), doc: inner }],
      }
    })
  }, [patch])

  const onRestoreSnapshot = useCallback((id: string) => {
    const s = docRef.current?.snapshots.find((x) => x.id === id)
    if (!s) return
    patch(`Restaurar snapshot: ${s.name}`, (d) => ({
      ...s.doc,
      // snapshots e versões acompanham o PROJETO, não o marco restaurado
      snapshots: d.snapshots,
      versions: d.versions,
    }))
  }, [patch])

  const onDeleteSnapshot = useCallback((id: string) => {
    patch('Remover snapshot', (d) => ({ ...d, snapshots: d.snapshots.filter((x) => x.id !== id) }))
  }, [patch])

  // ═══════════════════════════════════════════════════════════════════════════
  // Correspondência de cor
  // ═══════════════════════════════════════════════════════════════════════════

  const onMatchReference = useCallback(async (file: File) => {
    const baseImg = viewportRef.current?.baseImage()
    if (!baseImg) return
    setMatchBusy(true)
    setError(null)
    try {
      const url = URL.createObjectURL(file)
      const refImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Não foi possível ler a imagem de referência.'))
        img.src = url
      })
      const src = imageStats(baseImg, baseImg.naturalWidth, baseImg.naturalHeight)
      const ref = imageStats(refImg, refImg.naturalWidth, refImg.naturalHeight)
      const match = computeColorMatch(src, ref)
      // miniatura pequena p/ exibir no painel (vai no document — manter leve)
      const thumb = document.createElement('canvas')
      const k = 72 / Math.max(refImg.naturalWidth, refImg.naturalHeight)
      thumb.width = Math.max(2, Math.round(refImg.naturalWidth * k))
      thumb.height = Math.max(2, Math.round(refImg.naturalHeight * k))
      thumb.getContext('2d')?.drawImage(refImg, 0, 0, thumb.width, thumb.height)
      const refThumbUrl = thumb.toDataURL('image/jpeg', 0.7)
      URL.revokeObjectURL(url)
      patch('Correspondência de cor', (d) => ({
        ...d,
        colorMatch: { gain: match.gain, offset: match.offset, amount: 60, refThumbUrl },
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na correspondência de cor.')
    } finally {
      setMatchBusy(false)
    }
  }, [patch])

  // ═══════════════════════════════════════════════════════════════════════════
  // Limpeza (IA) — única parte que consome Nodes
  // ═══════════════════════════════════════════════════════════════════════════

  // saldo ao entrar na ferramenta
  useEffect(() => {
    if (tool !== 'cleanup' || balance !== null) return
    fetch('/api/users/me/balance')
      .then((r) => r.json())
      .then((j) => { if (typeof j?.total_balance === 'number') setBalance(j.total_balance) })
      .catch(() => {})
  }, [tool, balance])

  // preview de custo (debounced; autoritativo no servidor)
  useEffect(() => {
    if (tool !== 'cleanup' || cleanupStrokes.length === 0 || !doc) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa o preview quando a máscara some
      setCleanupPreview(null)
      setCleanupPreviewLoading(false)
      return
    }
    setCleanupPreviewLoading(true)
    const abort = new AbortController()
    const t = setTimeout(async () => {
      try {
        const coverage = estimateStrokeCoverage(cleanupStrokes, doc.width, doc.height)
        const res = await fetch('/api/edits/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abort.signal,
          body: JSON.stringify({
            has_mask: true,
            mask_coverage: coverage,
            mode: cleanupMode === 'remove' ? 'remove' : 'fix',
            prompt: cleanupMode === 'fix' ? cleanupPrompt : '',
            quality: 'hd',
            source_type: 'upload',
            image_megapixels: (doc.width * doc.height) / 1e6,
          }),
        })
        const j = await res.json().catch(() => null)
        if (abort.signal.aborted) return
        if (res.ok && j && typeof j.cost_nodes === 'number') {
          setCleanupPreview({
            cost: j.cost_nodes,
            isFree: Boolean(j.is_free_fix),
            label: typeof j.label === 'string' ? j.label : '',
            explanation: typeof j.explanation === 'string' ? j.explanation : '',
          })
        } else {
          // Falha ao precificar → sem preview, botão desabilita (nunca custo velho).
          setCleanupPreview(null)
        }
      } catch {
        if (!abort.signal.aborted) setCleanupPreview(null)
      } finally {
        if (!abort.signal.aborted) setCleanupPreviewLoading(false)
      }
    }, 350)
    return () => {
      abort.abort()
      clearTimeout(t)
    }
  }, [tool, cleanupStrokes, cleanupMode, cleanupPrompt, doc])

  const runCleanup = useCallback(async () => {
    const cur = docRef.current
    if (!cur || cleanupStrokes.length === 0 || cleanupBusy) return
    setCleanupBusy(true)
    setCleanupMsg(null)
    try {
      // 1. máscara nas dimensões EXATAS da imagem (exigência do /api/edits).
      //    Os traços foram desenhados sobre a imagem JÁ CORRIGIDA (geometria);
      //    a IA edita a imagem ORIGINAL → mapeia cada ponto de volta.
      const aspect = cur.width / Math.max(1, cur.height)
      const mappedStrokes = isGeometryIdentity(cur.geometry)
        ? cleanupStrokes
        : cleanupStrokes.map((s) => ({
            ...s,
            points: s.points.map((p) => displayToSource(p, cur.geometry, aspect)),
          }))
      const maskCanvas = strokesMaskPngCanvas(mappedStrokes, cur.width, cur.height)
      const maskBlob = await new Promise<Blob | null>((r) => maskCanvas.toBlob(r, 'image/png'))
      if (!maskBlob) throw new Error('Falha ao gerar a máscara neste navegador. Tente novamente.')
      // Upload DIRETO browser→Storage (rotas da Vercel rejeitam corpo >4,5MB —
      // era a causa do "Falha ao enviar a máscara" em imagens grandes).
      let maskUrl: string
      try {
        const up = await uploadDirect(maskBlob, 'retocar-asset', { kind: 'mask' })
        if (!up.url) throw new Error('sem URL')
        maskUrl = up.url
      } catch (e) {
        throw new Error(`Falha ao enviar a máscara (${e instanceof Error ? e.message : 'conexão'}). Sua seleção foi mantida — toque em Tentar novamente.`)
      }

      // 2. imagem fonte: precisa ser URL absoluta alcançável pelo servidor
      let sourceUrl = cur.baseUrl
      if (sourceUrl.startsWith('/')) {
        const baseImg = viewportRef.current?.baseImage()
        if (!baseImg) throw new Error('Imagem base indisponível. Recarregue a página.')
        const c = document.createElement('canvas')
        c.width = baseImg.naturalWidth
        c.height = baseImg.naturalHeight
        c.getContext('2d')?.drawImage(baseImg, 0, 0)
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
        if (!blob) throw new Error('Falha ao preparar a imagem (CORS). Recarregue a página.')
        try {
          const up = await uploadDirect(blob, 'retocar-asset', { kind: 'source' })
          if (!up.url) throw new Error('sem URL')
          sourceUrl = up.url
        } catch (e) {
          throw new Error(`Falha ao preparar a imagem (${e instanceof Error ? e.message : 'conexão'}). Sua seleção foi mantida — toque em Tentar novamente.`)
        }
      }

      // 3. execução — o servidor debita e reembolsa em falha/rejeição
      const coverage = estimateStrokeCoverage(cleanupStrokes, cur.width, cur.height)
      const res = await fetch('/api/edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_image_url: sourceUrl,
          mask_url: maskUrl,
          prompt: cleanupMode === 'fix' ? cleanupPrompt.trim() : '',
          mode: cleanupMode === 'remove' ? 'remove' : 'fix',
          quality: 'hd',
          source_type: 'upload',
          mask_coverage: coverage,
          image_megapixels: (cur.width * cur.height) / 1e6,
        }),
      })
      const j = await res.json().catch(() => null)

      const applyBalance = (b: unknown) => {
        const total = (b as { total_balance?: number } | null)?.total_balance
        if (typeof total === 'number') setBalance(total)
      }

      if (j?.rejected) {
        applyBalance(j.balance_after)
        setCleanupMsg({ kind: 'error', text: j.message ?? 'O resultado foi rejeitado pelo controle de qualidade. Os Nodes foram devolvidos.' })
        return
      }
      if (res.status === 402) {
        if (typeof j?.available === 'number') setBalance(j.available)
        setCleanupMsg({ kind: 'error', text: j?.message ?? 'Saldo insuficiente.' })
        return
      }
      if (!res.ok || typeof j?.result_url !== 'string') {
        throw new Error(j?.message ?? j?.error ?? 'Falha ao processar a limpeza.')
      }

      applyBalance(j.balance_after)
      // URL assinada expira — persiste a forma ESTÁVEL (pública/proxy).
      const resultUrl = toStableStorageUrl(j.result_url as string)
      patch('Limpeza IA', (d) => ({ ...d, baseUrl: resultUrl }))
      setCleanupStrokes([])
      setCleanupMsg({ kind: 'info', text: 'Pronto — área substituída. Use Desfazer para voltar.' })
    } catch (e) {
      setCleanupMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Falha ao processar a limpeza.' })
    } finally {
      setCleanupBusy(false)
    }
  }, [cleanupStrokes, cleanupBusy, cleanupMode, cleanupPrompt, patch])

  // ═══════════════════════════════════════════════════════════════════════════
  // Salvar / autosave
  // ═══════════════════════════════════════════════════════════════════════════

  const save = useCallback(async (opts: { auto?: boolean } = {}) => {
    const cur = docRef.current
    if (!cur || saving) return
    setSaving(true)
    setSaveStatus('saving')
    setError(null)
    try {
      let thumbnail_url = thumbUrlRef.current
      if (!opts.auto) {
        const thumbBlob = await viewportRef.current?.thumbnail(420)
        if (thumbBlob) {
          const up = await uploadDirect(thumbBlob, 'finalizar-asset', { kind: 'thumb' })
          thumbnail_url = up.url
        }
      }
      const payload = {
        name: name.trim() || 'Projeto sem título',
        base_image_url: cur.originalBaseUrl,
        width: cur.width,
        height: cur.height,
        document: serializeDocument(cur),
        thumbnail_url,
      }
      const res = await fetch(projectId ? `/api/finalizar/projects/${projectId}` : '/api/finalizar/projects', {
        method: projectId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, expected_updated_at: projectId ? lastUpdatedAtRef.current : undefined }),
      })
      const json = await res.json().catch(() => null)
      if (res.status === 409) {
        throw new Error('Este projeto foi alterado em outra aba. Recarregue a página para continuar.')
      }
      if (!res.ok || !json?.project) throw new Error(json?.error ?? 'Falha ao salvar')
      thumbUrlRef.current = thumbnail_url
      if (typeof json.project.updated_at === 'string') lastUpdatedAtRef.current = json.project.updated_at
      if (!projectId) setProjectId(String(json.project.id))
      // Edições feitas DURANTE o save não entraram no payload — nesse caso o
      // documento continua sujo e o autosave cobre a diferença.
      if (docRef.current === cur) {
        dirtyRef.current = false
        setSaveStatus(opts.auto ? 'autosaved' : 'saved')
      } else {
        setSaveStatus('dirty')
      }
    } catch (e) {
      setSaveStatus('error')
      if (!opts.auto) setError(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
      setSaveEpoch((n) => n + 1)
    }
  }, [name, projectId, saving])

  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save })

  // autosave: só depois do primeiro salvamento manual (evita projetos fantasmas).
  // saveEpoch reprograma o timer após cada save — cobre edições feitas
  // durante um save em andamento.
  useEffect(() => {
    if (!doc || !projectId || !dirtyRef.current) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      if (dirtyRef.current && !cleanupBusy) void saveRef.current({ auto: true })
    }, AUTOSAVE_DELAY)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  }, [doc, name, projectId, cleanupBusy, saveEpoch])

  // aviso ao fechar com alterações pendentes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault()
        // Navegadores mais antigos exigem returnValue para exibir o diálogo.
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // ═══════════════════════════════════════════════════════════════════════════
  // Exportação
  // ═══════════════════════════════════════════════════════════════════════════

  const onExport = useCallback(async (opts: ExportOptions) => {
    const cur = docRef.current
    if (!cur) return
    const result = await renderExport(cur, {
      format: opts.format,
      quality: opts.quality,
      scale: opts.scale,
      aspectRatio: opts.aspectRatio,
    })
    // result.format pode diferir do pedido (navegador sem encoder — ex.: WebP
    // no Safari sai como PNG); nome e registro seguem o formato REAL.
    downloadBlob(result.blob, `${opts.fileName}.${result.format}`)
    if (result.format !== opts.format) {
      setError(`Este navegador não exporta ${opts.format.toUpperCase()} — o arquivo foi salvo como ${result.format.toUpperCase()}.`)
    }

    if (opts.saveToProject && projectId) {
      try {
        const { key } = await uploadDirect(result.blob, 'finalizar-export', {}, { confirm: false })
        const res = await fetch('/api/finalizar/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, project_id: projectId, format: result.format, width: result.width, height: result.height }),
        })
        const j = await res.json().catch(() => null)
        if (res.ok && typeof j?.url === 'string') {
          patch('Salvar versão no projeto', (d) => ({
            ...d,
            versions: [...d.versions, {
              url: j.url as string,
              name: opts.fileName,
              format: result.format,
              width: result.width,
              height: result.height,
              createdAt: new Date().toISOString(),
              summary: adjustmentsSummary(d),
            }],
          }))
          // Persiste a versão imediatamente (não depende do próximo autosave).
          void saveRef.current({ auto: true })
        }
      } catch {
        setError('A imagem foi baixada, mas não foi possível salvar a versão no projeto.')
      }
    }
    if (result.capped) {
      setError('A resolução foi limitada pela capacidade gráfica deste dispositivo.')
    }
  }, [projectId, patch])

  // ═══════════════════════════════════════════════════════════════════════════
  // Histograma (throttled) + atalhos de teclado
  // ═══════════════════════════════════════════════════════════════════════════

  const [baseTick, setBaseTick] = useState(0)
  useEffect(() => {
    if (!doc || (tool !== 'adjust' && tool !== 'color')) return
    const t = setTimeout(() => {
      const h = viewportRef.current?.resultHistogram()
      if (h) setHistogram(h)
    }, 450)
    return () => clearTimeout(t)
  }, [doc, tool, baseTick])

  // Modais abertos suspendem os atalhos (o diálogo cuida do próprio teclado).
  const modalOpenRef = useRef(false)
  useEffect(() => {
    modalOpenRef.current = exportOpen || importPurpose !== null
  }, [exportOpen, importPurpose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpenRef.current) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      // Sliders (range) mantêm foco após o arrasto — atalhos continuam valendo;
      // só campos de TEXTO bloqueiam.
      const isTyping = tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el?.isContentEditable)
        || (tag === 'INPUT' && (el as HTMLInputElement).type !== 'range')
      if (isTyping) return
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveRef.current({})
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setExportOpen(true)
      } else if (mod) {
        // Demais combinações com Ctrl/Cmd são do navegador.
      } else if (e.key === '[' || e.key === ']') {
        setBrush((b) => ({ ...b, size: Math.max(8, Math.min(240, b.size + (e.key === ']' ? 8 : -8))) }))
      } else if (e.key === '\\') {
        e.preventDefault()
        setCompare(true)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        setPanelsOpen((v) => !v)
      } else if (e.key === '0') {
        viewportRef.current?.fit()
      } else if (e.key === '+' || e.key === '=') {
        viewportRef.current?.zoomBy(1.25)
      } else if (e.key === '-') {
        viewportRef.current?.zoomBy(1 / 1.25)
      } else if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
        const tools: EditorTool[] = ['adjust', 'color', 'masks', 'cleanup', 'geometry', 'elements', 'history']
        setTool(tools[Number(e.key) - 1])
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === '\\') setCompare(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [undo, redo])

  const goBack = useCallback(() => {
    if (dirtyRef.current && !window.confirm('Sair sem salvar? As alterações não salvas serão perdidas.')) return
    router.push('/app/finalizar')
  }, [router])

  // seleção automática coerente com a ferramenta — só na TRANSIÇÃO para
  // Máscaras (senão desmarcar uma máscara a re-selecionaria em loop)
  const prevToolRef = useRef<EditorTool | null>(null)
  useEffect(() => {
    const entered = prevToolRef.current !== tool
    prevToolRef.current = tool
    if (entered && tool === 'masks' && !activeLocalId && docRef.current?.locals.length) {
      setActiveLocalId(docRef.current.locals[docRef.current.locals.length - 1].id)
    }
    if (tool !== 'elements') setElementMaskMode(false)
    if (tool !== 'adjust') setWbPicking(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  // ═══════════════════════════════════════════════════════════════════════════
  // Estado VAZIO — galeria + escolher base
  // ═══════════════════════════════════════════════════════════════════════════

  if (!doc) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--color-bg)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>Finalizar</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 8, maxWidth: 620, lineHeight: 1.55 }}>
            Pós-produção profissional para renders: luz, cor, máscaras locais,
            perspectiva, elementos e exportação — tudo não destrutivo, direto no
            navegador e sem custo de Nodes.
          </p>

          <button type="button" className="spn-action spn-action--primary" onClick={() => setImportPurpose('base')} style={{ width: 'auto', marginTop: 22, padding: '12px 20px' }}>
            Escolher imagem
          </button>
          {error && <div style={{ marginTop: 14, fontSize: 13, color: 'var(--color-error)' }}>{error}</div>}

          {savedProjects.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 14 }}>Projetos salvos</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                {savedProjects.map((p) => (
                  <button key={p.id} type="button" onClick={() => router.push(`/app/finalizar/${p.id}`)}
                    style={{ textAlign: 'left', padding: 0, borderRadius: 14, overflow: 'hidden', border: '0.5px solid var(--color-border)', background: 'var(--color-bg-elevated)', cursor: 'pointer' }}>
                    <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface)' }}>
                      {p.thumbnail_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--color-text-quaternary)', fontSize: 12 }}>sem prévia</div>}
                    </div>
                    <div style={{ padding: '11px 13px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 3 }}>{new Date(p.updated_at).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <FinalizeImportModal
          open={importPurpose !== null}
          purpose="base"
          onClose={() => setImportPurpose(null)}
          onSelect={(url) => void chooseBase(url)}
        />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Editor
  // ═══════════════════════════════════════════════════════════════════════════

  const viewportTool = tool === 'history' ? 'adjust' : tool
  const hint =
    tool === 'geometry'
      ? 'Arraste as bordas para cortar · sliders de perspectiva no painel'
      : tool === 'masks' && activeLocalId
        ? maskInteraction === 'shape'
          ? 'Arraste no canvas para posicionar o gradiente'
          : 'Pinte para adicionar à máscara · Borracha remove'
        : tool === 'cleanup'
          ? 'Pinte sobre o que deseja remover — a área fica marcada em vermelho'
          : tool === 'elements'
            ? elementMaskMode
              ? 'Pinte para revelar/ocultar partes do elemento'
              : 'Clique para selecionar · arraste para mover · alças redimensionam e rotacionam'
            : wbPicking
              ? 'Clique em um ponto que deveria ser cinza ou branco'
              : null

  const crop = doc.geometry.crop
  const croppedW = Math.round((crop?.w ?? 1) * doc.width)
  const croppedH = Math.round((crop?.h ?? 1) * doc.height)

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      <TopBar
        name={name}
        onName={(n) => { setName(n); markDirty() }}
        onBack={goBack}
        status={saveStatus}
        canUndo={historyUi.canUndo}
        canRedo={historyUi.canRedo}
        onUndo={undo}
        onRedo={redo}
        compare={compare}
        onCompare={setCompare}
        compareMode={compareMode}
        onCompareMode={setCompareMode}
        zoomPct={zoomPct}
        onZoomIn={() => viewportRef.current?.zoomBy(1.25)}
        onZoomOut={() => viewportRef.current?.zoomBy(1 / 1.25)}
        onFit={() => viewportRef.current?.fit()}
        panelsOpen={panelsOpen}
        onTogglePanels={() => setPanelsOpen((v) => !v)}
        onSave={() => void save({})}
        saving={saving}
        onExport={() => setExportOpen(true)}
        error={error}
      />

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <ToolRail tool={tool} onTool={setTool} />

        <CanvasViewport
          ref={viewportRef}
          doc={doc}
          tool={viewportTool}
          activeLocalId={activeLocalId}
          activeElementId={activeElementId}
          brush={brush}
          maskInteraction={maskInteraction}
          elementMaskMode={elementMaskMode}
          compare={compare}
          compareMode={compareMode}
          showMaskOverlay={showMaskOverlay && tool === 'masks'}
          maskOverlayColor={maskOverlayColor}
          cleanupStrokes={cleanupStrokes}
          wbPicking={wbPicking}
          onZoomChange={setZoomPct}
          onStrokeCommit={onStrokeCommit}
          onShapeChange={onShapeChange}
          onElementChange={onElementChange}
          onCropChange={onCropChange}
          onPickWb={onPickWb}
          onSelectElement={setActiveElementId}
          onError={setError}
          onBaseReady={() => setBaseTick((n) => n + 1)}
        />

        {panelsOpen && (
          <div
            className="spn-panel-resizer"
            onPointerDown={(e) => {
              const startX = e.clientX
              const startW = panelWidth
              const el = e.currentTarget
              el.setPointerCapture(e.pointerId)
              el.dataset.dragging = '1'
              const move = (ev: PointerEvent) => {
                const w = Math.max(264, Math.min(480, startW + (startX - ev.clientX)))
                setPanelWidth(w)
              }
              const up = () => {
                delete el.dataset.dragging
                el.removeEventListener('pointermove', move)
                el.removeEventListener('pointerup', up)
                try {
                  window.localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidthRef.current))
                } catch { /* sem storage */ }
              }
              el.addEventListener('pointermove', move)
              el.addEventListener('pointerup', up)
            }}
            title="Arraste para redimensionar o painel"
          />
        )}
        {panelsOpen && (
          <aside style={{
            width: panelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderLeft: '0.5px solid var(--color-border)', background: 'var(--color-bg)',
            minHeight: 0,
          }}>
            <div style={{
              padding: '11px 14px', borderBottom: '0.5px solid var(--color-border)',
              fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text-primary)',
              flexShrink: 0,
            }}>
              {PANEL_TITLE[tool]}
            </div>
            <div className="spn-generate-controls" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {tool === 'adjust' && (
                <AdjustPanel
                  doc={doc}
                  patch={patch}
                  histogram={histogram}
                  wbPicking={wbPicking}
                  onToggleWbPick={() => setWbPicking((v) => !v)}
                  onQuickFix={onQuickFix}
                  quickFixDisabled={doc.locals.length >= MAX_LOCAL_ADJUSTMENTS}
                />
              )}
              {tool === 'color' && (
                <ColorPanel
                  doc={doc}
                  patch={patch}
                  histogram={histogram}
                  onMatchReference={onMatchReference}
                  matchBusy={matchBusy}
                  onCopyTreatment={onCopyTreatment}
                  onPasteTreatment={onPasteTreatment}
                  pasteAvailable={pasteAvailable}
                />
              )}
              {tool === 'masks' && (
                <MasksPanel
                  doc={doc}
                  patch={patch}
                  activeLocalId={activeLocalId}
                  onSelectLocal={setActiveLocalId}
                  brush={brush}
                  onBrush={setBrush}
                  maskInteraction={maskInteraction}
                  onMaskInteraction={setMaskInteraction}
                  showMaskOverlay={showMaskOverlay}
                  onToggleOverlay={() => setShowMaskOverlay((v) => !v)}
                  maskOverlayColor={maskOverlayColor}
                  onMaskOverlayColor={setMaskOverlayColor}
                  onAddLocal={(k) => void onAddLocal(k)}
                  skyBusy={skyBusy}
                />
              )}
              {tool === 'cleanup' && (
                <CleanupPanel
                  strokes={cleanupStrokes}
                  onClearStrokes={() => { setCleanupStrokes([]); setCleanupMsg(null) }}
                  brush={brush}
                  onBrush={setBrush}
                  mode={cleanupMode}
                  onMode={setCleanupMode}
                  prompt={cleanupPrompt}
                  onPrompt={setCleanupPrompt}
                  preview={cleanupPreview}
                  previewLoading={cleanupPreviewLoading}
                  balance={balance}
                  busy={cleanupBusy}
                  onExecute={() => void runCleanup()}
                  message={cleanupMsg?.text ?? null}
                  messageKind={cleanupMsg?.kind ?? null}
                />
              )}
              {tool === 'geometry' && <GeometryPanel doc={doc} patch={patch} />}
              {tool === 'elements' && (
                <ElementsPanel
                  doc={doc}
                  patch={patch}
                  activeElementId={activeElementId}
                  onSelectElement={setActiveElementId}
                  onAddElement={() => setImportPurpose('element')}
                  elementMaskMode={elementMaskMode}
                  onElementMaskMode={setElementMaskMode}
                  brush={brush}
                  onBrush={setBrush}
                  onAutoColorMatch={(id) => void onAutoColorMatch(id)}
                />
              )}
              {tool === 'history' && (
                <HistoryPanel
                  steps={historyUi.steps}
                  onJump={(i) => applyHistoryDoc(historyRef.current.jumpTo(i))}
                  versions={doc.versions}
                  snapshots={doc.snapshots}
                  onSaveSnapshot={onSaveSnapshot}
                  onRestoreSnapshot={onRestoreSnapshot}
                  onDeleteSnapshot={onDeleteSnapshot}
                  snapshotsFull={doc.snapshots.length >= MAX_SNAPSHOTS}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      <StatusStrip hint={hint} />

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        defaultName={name}
        imageWidth={croppedW}
        imageHeight={croppedH}
        canSaveToProject={projectId !== null}
        onExport={onExport}
      />
      <FinalizeImportModal
        open={importPurpose !== null}
        purpose={importPurpose === 'base' ? 'base' : 'camada'}
        onClose={() => setImportPurpose(null)}
        onSelect={(url) => { if (importPurpose === 'base') void chooseBase(url); else void addElement(url) }}
      />
    </div>
  )
}
