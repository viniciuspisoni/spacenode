'use client'

// FinalizeEditor — orquestra a ferramenta Finalizar (pós-produção local).
//
// Tudo aqui é LOCAL e GRATUITO: camadas, máscaras, opacidade, mesclagem e
// exportação acontecem no navegador. O servidor só PERSISTE (composição,
// máscaras PNG, thumb, exports) — nenhuma rota consome Nodes.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BlendMode, BrushMode, Composition, ExportFormat, FinalizeProject, FinalizeProjectSummary, Layer } from '@/lib/finalizar/types'
import { createComposition, deserializeComposition, newLayer, serializeComposition } from '@/lib/finalizar/composition'
import { downloadBlob, exportFilename } from '@/lib/finalizar/export'
import { CanvasStage, type CanvasStageHandle } from './CanvasStage'
import { LayerPanel } from './LayerPanel'
import { BrushToolbar } from './BrushToolbar'
import { BeforeAfterToggle } from './BeforeAfterToggle'
import { ExportDialog } from './ExportDialog'
import { FinalizeImportModal } from './FinalizeImportModal'
import { uploadDirect } from '@/lib/storage/direct-upload-client'

interface Props {
  initialProject?: FinalizeProject | null
  initialSourceUrl?: string | null
  savedProjects?: FinalizeProjectSummary[]
}

function buildInitialComposition(p?: FinalizeProject | null): Composition | null {
  if (!p) return null
  const doc = deserializeComposition(p.document)
  if (doc) return doc
  if (p.base_image_url && p.width && p.height) return createComposition(p.base_image_url, p.width, p.height)
  return null
}

export function FinalizeEditor({ initialProject, initialSourceUrl, savedProjects = [] }: Props) {
  const router = useRouter()
  const canvasRef = useRef<CanvasStageHandle | null>(null)
  const thumbUrlRef = useRef<string | null>(initialProject?.thumbnail_url ?? null)
  const layerSeed = useRef(initialProject ? (buildInitialComposition(initialProject)?.layers.length ?? 1) + 1 : 2)

  const [composition, setComposition] = useState<Composition | null>(() => buildInitialComposition(initialProject))
  const [projectId, setProjectId] = useState<string | null>(initialProject?.id ?? null)
  const [name, setName] = useState(initialProject?.name ?? 'Composição sem título')
  const [activeLayerId, setActiveLayerId] = useState<string | null>(() => {
    const c = buildInitialComposition(initialProject)
    return c ? c.layers[c.layers.length - 1]?.id ?? null : null
  })

  const [brushMode, setBrushMode] = useState<BrushMode>('hide')
  const [brushSize, setBrushSize] = useState(48)
  const [showBaseOnly, setShowBaseOnly] = useState(false)

  const [importPurpose, setImportPurpose] = useState<'base' | 'camada' | null>(initialProject || initialSourceUrl ? null : 'base')
  const [exportOpen, setExportOpen] = useState(false)

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOnce, setSavedOnce] = useState<boolean>(Boolean(initialProject))
  const [error, setError] = useState<string | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [zoomPct, setZoomPct] = useState(100)

  const activeLayer = composition?.layers.find((l) => l.id === activeLayerId) ?? null

  // ── Helpers de mutação ───────────────────────────────────────────────────────
  const mutate = useCallback((fn: (c: Composition) => Composition) => {
    setComposition((c) => (c ? fn(c) : c))
    setDirty(true)
  }, [])
  const patchLayer = useCallback((id: string, patch: Partial<Layer>) => {
    mutate((c) => ({ ...c, layers: c.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
  }, [mutate])
  const refreshHistory = useCallback(() => {
    setCanUndo(Boolean(canvasRef.current?.canUndo()))
    setCanRedo(Boolean(canvasRef.current?.canRedo()))
  }, [])

  // ── Escolher base / adicionar camada (carrega dims via Image) ────────────────
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
      const comp = createComposition(url, w, h)
      setComposition(comp)
      setActiveLayerId(comp.layers[0].id)
      setName('Composição sem título')
      setProjectId(null)
      thumbUrlRef.current = null
      layerSeed.current = 2
      setDirty(true)
      setImportPurpose(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar imagem.')
    }
  }, [])

  const addLayer = useCallback((url: string) => {
    const seed = layerSeed.current++
    const layer = newLayer({ url, name: `Camada ${seed - 1}`, seed })
    mutate((c) => ({ ...c, layers: [...c.layers, layer] }))
    setActiveLayerId(layer.id)
    setBrushMode('hide')
    setImportPurpose(null)
  }, [mutate])

  const onImportSelect = useCallback((url: string) => {
    if (importPurpose === 'base') chooseBase(url)
    else addLayer(url)
  }, [importPurpose, chooseBase, addLayer])

  // ?source= pré-carrega a base (init de montagem; chooseBase é assíncrono).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!composition && initialSourceUrl) chooseBase(initialSourceUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Camadas ──────────────────────────────────────────────────────────────────
  const moveLayer = useCallback((id: string, dir: 'up' | 'down') => {
    mutate((c) => {
      const arr = [...c.layers]
      const idx = arr.findIndex((l) => l.id === id)
      if (idx < 0 || arr[idx].isBase) return c
      const target = dir === 'up' ? idx + 1 : idx - 1
      if (target < 1 || target > arr.length - 1) return c // base fica no índice 0
      ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
      return { ...c, layers: arr }
    })
  }, [mutate])

  const deleteLayer = useCallback((id: string) => {
    setComposition((c) => {
      if (!c) return c
      const layers = c.layers.filter((l) => l.id !== id)
      return { ...c, layers }
    })
    setActiveLayerId((cur) => (cur === id ? composition?.layers.find((l) => l.id !== id)?.id ?? null : cur))
    setDirty(true)
  }, [composition])

  // ── Máscara da camada ativa (delega ao canvas) ───────────────────────────────
  const invertMask = useCallback((id: string) => { canvasRef.current?.invertMask(id); setDirty(true); refreshHistory() }, [refreshHistory])
  const clearMask = useCallback((id: string, fill: 'full' | 'empty') => { canvasRef.current?.clearMask(id, fill); setDirty(true); refreshHistory() }, [refreshHistory])

  // ── Atalhos de teclado (undo/redo) ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) canvasRef.current?.redo()
        else canvasRef.current?.undo()
        setDirty(true)
        refreshHistory()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        canvasRef.current?.redo()
        setDirty(true)
        refreshHistory()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [refreshHistory])

  // ── Upload helper (direto browser → Storage; ver direct-upload-client) ──────
  async function uploadBlob(blob: Blob, kind: 'mask' | 'thumb', filename: string): Promise<string> {
    const file = new File([blob], filename, { type: blob.type || 'image/png' })
    const { url } = await uploadDirect(file, 'finalizar-asset', { kind })
    if (!url) throw new Error('Falha no upload')
    return url
  }

  // ── Salvar ───────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!composition || saving) return
    setSaving(true)
    setError(null)
    try {
      // 1. máscaras pintadas → PNG no Storage
      const layers = await Promise.all(composition.layers.map(async (l) => {
        if (l.isBase || !canvasRef.current?.hasMask(l.id)) return l
        const blob = await canvasRef.current.getLayerMaskBlob(l.id)
        if (!blob) return l
        const url = await uploadBlob(blob, 'mask', `mask-${l.id}.png`)
        return { ...l, maskUrl: url }
      }))

      // 2. thumbnail
      let thumbnail_url = thumbUrlRef.current
      const thumbBlob = await canvasRef.current?.exportThumbnail(420)
      if (thumbBlob) thumbnail_url = await uploadBlob(thumbBlob, 'thumb', 'thumb.jpg')

      // 3. persistir composição
      const doc = serializeComposition({ ...composition, layers })
      const payload = {
        name: name.trim() || 'Composição sem título',
        base_image_url: composition.layers[0]?.url ?? null,
        width: composition.width,
        height: composition.height,
        document: doc,
        thumbnail_url,
      }
      const res = await fetch(projectId ? `/api/finalizar/projects/${projectId}` : '/api/finalizar/projects', {
        method: projectId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.project) throw new Error(json?.error ?? 'Falha ao salvar')

      setComposition((c) => (c ? { ...c, layers } : c))
      thumbUrlRef.current = thumbnail_url
      if (!projectId) setProjectId(String(json.project.id))
      setDirty(false)
      setSavedOnce(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }, [composition, name, projectId, saving])

  // ── Exportar (download client-side + registro best-effort) ───────────────────
  const doExport = useCallback(async (format: ExportFormat, quality: number) => {
    if (!canvasRef.current || !composition) return
    const blob = await canvasRef.current.exportComposite(format, quality)
    if (!blob) {
      setError('Não foi possível exportar — alguma imagem é de outra origem sem CORS.')
      return
    }
    downloadBlob(blob, exportFilename(name, format))
    if (projectId) {
      try {
        // Sobe o composto direto pro Storage; a rota só valida a key e registra.
        const file = new File([blob], `export.${format}`, { type: blob.type })
        const { key } = await uploadDirect(file, 'finalizar-export', {}, { confirm: false })
        await fetch('/api/finalizar/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            project_id: projectId,
            format,
            width: composition.width,
            height: composition.height,
          }),
        })
      } catch { /* registro é best-effort */ }
    }
  }, [composition, name, projectId])

  const goBack = useCallback(() => {
    if (dirty && !window.confirm('Sair sem salvar? As alterações não salvas serão perdidas.')) return
    router.push('/app/finalizar')
  }, [dirty, router])

  // ════════════════════════════════════════════════════════════════════════════
  // Estado VAZIO — escolher base ou reabrir composição salva
  // ════════════════════════════════════════════════════════════════════════════
  if (!composition) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--color-bg)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>Finalizar</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 8, maxWidth: 560, lineHeight: 1.55 }}>
            Combine as melhores partes de várias gerações em uma só imagem — camadas, opacidade e máscaras manuais, tudo aqui dentro. Sem custo de Nodes.
          </p>

          <button type="button" className="spn-action spn-action--primary" onClick={() => setImportPurpose('base')} style={{ width: 'auto', marginTop: 22, padding: '12px 20px' }}>
            Escolher imagem base
          </button>
          {error && <div style={{ marginTop: 14, fontSize: 13, color: '#ff6b6b' }}>{error}</div>}

          {savedProjects.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 14 }}>Composições salvas</div>
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

        <FinalizeImportModal open={importPurpose !== null} purpose={importPurpose === 'camada' ? 'camada' : 'base'} onClose={() => setImportPurpose(null)} onSelect={onImportSelect} />
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Editor
  // ════════════════════════════════════════════════════════════════════════════
  const statusText = saving ? 'Salvando…' : dirty ? 'Alterações não salvas' : savedOnce ? 'Salvo' : ''

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      {/* Barra superior */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '0.5px solid var(--color-border)', flexShrink: 0 }}>
        <button type="button" onClick={goBack} title="Voltar" style={iconBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true) }}
          style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--color-text-primary)', background: 'transparent', border: '0.5px solid transparent', borderRadius: 8, padding: '6px 8px', minWidth: 200, maxWidth: 360 }}
          onFocus={(e) => (e.target.style.border = '0.5px solid var(--color-border-strong)')}
          onBlur={(e) => (e.target.style.border = '0.5px solid transparent')}
        />
        <span style={{ fontSize: 12, color: dirty ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}>{statusText}</span>
        <div style={{ flex: 1 }} />
        {error && <span style={{ fontSize: 12.5, color: '#ff6b6b', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error}</span>}
        <BeforeAfterToggle showingBase={showBaseOnly} onChange={setShowBaseOnly} />
        <button type="button" className="spn-action spn-action--ghost" onClick={save} disabled={saving} style={{ width: 'auto', padding: '9px 16px' }}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="spn-action spn-action--primary" onClick={() => setExportOpen(true)} style={{ width: 'auto', padding: '9px 16px' }}>
          Exportar PNG
        </button>
      </header>

      {/* Conteúdo */}
      <div className="spn-finalizar-grid" style={{ flex: 1, minHeight: 0, padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <BrushToolbar
            brushMode={brushMode}
            onBrushMode={setBrushMode}
            brushSize={brushSize}
            onBrushSize={setBrushSize}
            feather={activeLayer?.feather ?? 0}
            onFeather={(n) => activeLayer && patchLayer(activeLayer.id, { feather: n })}
            onUndo={() => { canvasRef.current?.undo(); setDirty(true); refreshHistory() }}
            onRedo={() => { canvasRef.current?.redo(); setDirty(true); refreshHistory() }}
            canUndo={canUndo}
            canRedo={canRedo}
            onResetView={() => canvasRef.current?.resetView()}
            zoomPct={zoomPct}
            disabled={!activeLayer || activeLayer.isBase}
          />
          <CanvasStage
            ref={canvasRef}
            layers={composition.layers}
            width={composition.width}
            height={composition.height}
            activeLayerId={activeLayerId}
            brushMode={brushMode}
            brushSize={brushSize}
            showBaseOnly={showBaseOnly}
            onPaint={() => { setDirty(true); refreshHistory() }}
            onHistoryChange={refreshHistory}
            onZoomChange={setZoomPct}
            onLayerLoadError={() => setError('Uma das imagens não pôde ser carregada.')}
          />
          <div style={{ fontSize: 11.5, color: 'var(--color-text-quaternary)' }}>
            Scroll aproxima · segure Espaço para mover · pinte na camada selecionada
          </div>
        </div>

        <div style={{ overflowY: 'auto', minHeight: 0, paddingRight: 2 }}>
          <LayerPanel
            layers={composition.layers}
            activeLayerId={activeLayerId}
            onSelect={setActiveLayerId}
            onAdd={() => setImportPurpose('camada')}
            onToggleVisible={(id) => { const l = composition.layers.find((x) => x.id === id); if (l) patchLayer(id, { visible: !l.visible }) }}
            onOpacity={(id, v) => patchLayer(id, { opacity: v })}
            onBlend={(id, m: BlendMode) => patchLayer(id, { blendMode: m })}
            onRename={(id, n) => patchLayer(id, { name: n })}
            onDelete={deleteLayer}
            onMove={moveLayer}
            onInvertMask={invertMask}
            onClearMask={clearMask}
          />
        </div>
      </div>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} onExport={doExport} />
      <FinalizeImportModal open={importPurpose !== null} purpose={importPurpose === 'base' ? 'base' : 'camada'} onClose={() => setImportPurpose(null)} onSelect={onImportSelect} />
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, borderRadius: 9, background: 'transparent',
  color: 'var(--color-text-secondary)', cursor: 'pointer', border: '0.5px solid var(--color-border)', flexShrink: 0,
}
