'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import BeforeAfter from '@/components/app/BeforeAfter'
import { RetocarImportModal } from '@/components/spaces/RetocarImportModal'
import {
  computeUpscaleCost,
  megapixelsFromDimensions,
  OBJECTIVE_PRESETS,
  analyzeFile,
  type UpscaleTab,
  type ModeId,
  type Scale,
  type ObjectiveId,
} from '@/lib/upscale'

// ── Tipagem da UI (labels sem nomes técnicos de modelo) ───────────────────────

interface ModeDef {
  id:       ModeId
  label:    string
  desc:     string
}

const RESOLUTION_MODES: ModeDef[] = [
  {
    id:    'fidelity',
    label: 'Alta Fidelidade',
    desc:  'Preserva geometria, materiais, iluminação e detalhes originais. Ideal para renders realistas, portfólio e apresentação.',
  },
  {
    id:    'recover',
    label: 'Recuperar Imagem Baixa',
    desc:  'Melhora imagens compactadas, antigas ou com baixa nitidez. Pode reconstruir pequenos detalhes.',
  },
]

const ENHANCE_MODES: ModeDef[] = [
  {
    id:    'denoise',
    label: 'Limpar Ruído',
    desc:  'Remove granulação e limpa imperfeições visuais.',
  },
  {
    id:    'deblur',
    label: 'Corrigir Desfoque',
    desc:  'Recupera nitidez e melhora imagens levemente borradas.',
  },
  {
    id:    'restore',
    label: 'Restaurar Imagem',
    desc:  'Restaura imagens degradadas, corrigindo danos e melhorando a aparência geral.',
  },
  {
    id:    'smart',
    label: 'Melhoria Inteligente',
    desc:  'Refina a imagem preservando o máximo possível do original.',
  },
]

interface ScaleDef {
  value: Scale
  label: string
  sub:   string
  locked?: boolean
}

const RESOLUTION_SCALES: ScaleDef[] = [
  { value: '2x',    label: '2×',    sub: '~4K'      },
  { value: '4x',    label: '4×',    sub: '~8K'      },
  { value: '8x',    label: '8×',    sub: 'até 16K'  },
  { value: 'ultra', label: 'Ultra', sub: 'até 16K', locked: true },
]

// Smart usa 2x/4x; denoise/deblur/restore ficam em 'none'.
const SMART_SCALES: ScaleDef[] = [
  { value: '2x', label: '2×', sub: 'discreto' },
  { value: '4x', label: '4×', sub: 'forte'    },
]

interface ObjectiveDef {
  id:    ObjectiveId
  label: string
}

const OBJECTIVES: ObjectiveDef[] = [
  { id: 'client',    label: 'Apresentação para cliente' },
  { id: 'portfolio', label: 'Portfólio / Instagram'     },
  { id: 'print',     label: 'Impressão / prancha'       },
  { id: 'recover',   label: 'Recuperar imagem baixa'    },
  { id: 'final',     label: 'Entrega final premium'     },
]

const LOADING_TEXTS_RESOLUTION = [
  'Enviando imagem...',
  'Processando com IA...',
  'Ampliando resolução...',
  'Realçando texturas...',
  'Finalizando...',
]

const LOADING_TEXTS_ENHANCE = [
  'Enviando imagem...',
  'Analisando detalhes...',
  'Aprimorando qualidade...',
  'Limpando imperfeições...',
  'Finalizando...',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

async function urlToFile(url: string): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Não foi possível importar a imagem')
  const blob = await res.blob()
  const ext = blob.type.split('/')[1] || 'jpg'
  return new File([blob], `historico.${ext}`, { type: blob.type })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function defaultModeForTab(tab: UpscaleTab): ModeId {
  return tab === 'resolution' ? 'fidelity' : 'restore'
}

function defaultScaleForMode(tab: UpscaleTab, modeId: ModeId): Scale {
  if (tab === 'resolution') return '4x'
  return modeId === 'smart' ? '2x' : 'none'
}

// ── Componente ───────────────────────────────────────────────────────────────

interface UpscaleClientProps {
  initialCredits: number
  /** URL https de uma render existente a pré-carregar como input (ex.: "Ampliar" no dashboard). */
  sourceUrl?: string
}

export default function UpscaleClient({ initialCredits, sourceUrl }: UpscaleClientProps) {
  // Image state
  const [imageFile,       setImageFile]       = useState<File | null>(null)
  const [imagePreview,    setImagePreview]    = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null)
  const [isDragging,      setIsDragging]      = useState(false)

  // Tab + mode + scale + objective
  const [tab,              setTab]              = useState<UpscaleTab>('resolution')
  const [selectedModeId,   setSelectedModeId]   = useState<ModeId>('fidelity')
  const [selectedScale,    setSelectedScale]    = useState<Scale>('4x')
  const [selectedObjective, setSelectedObjective] = useState<ObjectiveId | null>(null)

  // Recommendation
  const [recommended, setRecommended] = useState<{ modeId: ModeId; reason: string } | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false)
  const [isImporting,     setIsImporting]     = useState(false)

  // Submit
  const [isLoading,   setIsLoading]   = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS_RESOLUTION[0])
  const [resultUrl,   setResultUrl]   = useState<string | null>(null)
  const [credits,     setCredits]     = useState(initialCredits)
  const [error,       setError]       = useState<string | null>(null)

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyzeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Derivações ─────────────────────────────────────────────────────────────

  const modes = tab === 'resolution' ? RESOLUTION_MODES : ENHANCE_MODES
  const activeMode = useMemo(
    () => modes.find(m => m.id === selectedModeId) ?? modes[0],
    [modes, selectedModeId],
  )

  // Aba Aprimorar: escolha de escala depende do modo.
  //   - denoise / deblur / restore → fixo em 'none' (sem aumento)
  //   - smart                     → escolha entre 2× e 4×
  // Aba Resolução: sempre o conjunto completo (2/4/8/ultra).
  const availableScales: ScaleDef[] = useMemo(() => {
    if (tab === 'resolution') return RESOLUTION_SCALES
    if (selectedModeId === 'smart') return SMART_SCALES
    return [{ value: 'none', label: 'Sem aumento', sub: 'resolução original' }]
  }, [tab, selectedModeId])

  const megapixels = useMemo(
    () => megapixelsFromDimensions(imageDimensions?.w, imageDimensions?.h),
    [imageDimensions],
  )

  const costBreakdown = useMemo(
    () => computeUpscaleCost({
      tab,
      modeId:     selectedModeId,
      scale:      selectedScale,
      megapixels,
    }),
    [tab, selectedModeId, selectedScale, megapixels],
  )

  const nodeCost  = costBreakdown.total
  const canSubmit = !!imageFile && credits >= nodeCost && !isLoading

  // ── Handlers ───────────────────────────────────────────────────────────────

  function applyTab(next: UpscaleTab) {
    if (next === tab) return
    setTab(next)
    const nextMode  = defaultModeForTab(next)
    const nextScale = defaultScaleForMode(next, nextMode)
    setSelectedModeId(nextMode)
    setSelectedScale(nextScale)
    setSelectedObjective(null)
  }

  function applyMode(next: ModeId) {
    setSelectedModeId(next)
    // Reajusta escala se ficou incompatível ao trocar de modo dentro de Aprimorar.
    if (tab === 'enhance') {
      setSelectedScale(defaultScaleForMode('enhance', next))
    }
  }

  function applyObjective(id: ObjectiveId) {
    const preset = OBJECTIVE_PRESETS[id]
    setSelectedObjective(selectedObjective === id ? null : id)
    if (selectedObjective === id) return
    if (preset.tab !== tab) setTab(preset.tab)
    setSelectedModeId(preset.modeId)
    setSelectedScale(preset.scale)
  }

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Arquivo deve ser uma imagem.'); return }
    if (file.size > 20 * 1024 * 1024)   { setError('Imagem muito grande. Máximo 20 MB.'); return }

    setImageFile(file)
    setResultUrl(null)
    setError(null)
    setRecommended(null)
    setImageDimensions(null)
    setIsAnalyzing(true)

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImagePreview(dataUrl)
      const img = new Image()
      img.onload = () => setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight })
      img.src = dataUrl
    }
    reader.readAsDataURL(file)

    if (analyzeTimerRef.current) clearTimeout(analyzeTimerRef.current)
    analyzeTimerRef.current = setTimeout(() => {
      const rec = analyzeFile({ fileName: file.name, fileSize: file.size })
      setRecommended({ modeId: rec.modeId, reason: rec.reason })
      // Aplica a recomendação como ponto de partida.
      if (rec.tab !== tab) setTab(rec.tab)
      setSelectedModeId(rec.modeId)
      setSelectedScale(rec.scale)
      setIsAnalyzing(false)
    }, 400)
  }

  function startLoadingTexts() {
    const list = tab === 'resolution' ? LOADING_TEXTS_RESOLUTION : LOADING_TEXTS_ENHANCE
    let i = 0
    setLoadingText(list[0])
    loadingTimerRef.current = setInterval(() => {
      i = (i + 1) % list.length
      setLoadingText(list[i])
    }, 1800)
  }

  function stopLoadingTexts() {
    if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
  }

  async function handleImportPick(picked: { url: string }) {
    setShowImportModal(false)
    setIsImporting(true)
    setError(null)
    try {
      const file = await urlToFile(picked.url)
      loadImageFile(file)
    } catch {
      setError('Não foi possível importar a imagem do histórico.')
    } finally {
      setIsImporting(false)
    }
  }

  // Pré-carga via ?source= (ex.: "Ampliar" no dashboard). Mesmo caminho do
  // "importar do histórico": URL hospedada → File → loadImageFile. Roda 1x.
  const sourcePreloadedRef = useRef(false)
  useEffect(() => {
    if (sourcePreloadedRef.current || !sourceUrl || imageFile) return
    if (!/^https:\/\//i.test(sourceUrl)) return
    sourcePreloadedRef.current = true
    setIsImporting(true)
    urlToFile(sourceUrl)
      .then(file => loadImageFile(file))
      .catch(() => setError('Não foi possível carregar a imagem selecionada.'))
      .finally(() => setIsImporting(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl])

  function resetImage() {
    setImageFile(null)
    setImagePreview(null)
    setResultUrl(null)
    setRecommended(null)
    setImageDimensions(null)
  }

  async function handleSubmit() {
    if (!imageFile || !canSubmit) return
    setIsLoading(true)
    setError(null)
    setResultUrl(null)
    startLoadingTexts()

    const formData = new FormData()
    formData.append('image',  imageFile)
    formData.append('tab',    tab)
    formData.append('modeId', selectedModeId)
    formData.append('scale',  selectedScale)
    if (selectedObjective) formData.append('objectiveId', selectedObjective)
    if (imageDimensions) {
      formData.append('imageWidth',  String(imageDimensions.w))
      formData.append('imageHeight', String(imageDimensions.h))
    }

    try {
      const res  = await fetch('/api/upscale', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro desconhecido'); return }
      setResultUrl(data.url)
      setCredits(c => c - nodeCost)
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      stopLoadingTexts()
      setIsLoading(false)
    }
  }

  const ext = imageFile?.name.split('.').pop()?.toUpperCase() ?? ''

  // ── Texto do resultado (resolução final) ───────────────────────────────────
  const factorOut = (() => {
    switch (selectedScale) {
      case '2x':    return 2
      case '4x':    return 4
      case '8x':    return 8
      case 'ultra': return 8
      default:      return 1
    }
  })()

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0a0a', color: '#ffffff' }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div style={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '0.5px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>

        <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: '#ffffff' }}>Ampliar imagem</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
            Aumente a resolução ou aprimore a qualidade da imagem.
          </div>

          {/* Tabs */}
          <div style={{ marginTop: 16, display: 'flex', gap: 2, borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
            {([
              { id: 'resolution', label: 'Resolução' },
              { id: 'enhance',    label: 'Aprimorar' },
            ] as { id: UpscaleTab; label: string }[]).map(t => {
              const active = tab === t.id
              return (
                <button key={t.id} onClick={() => applyTab(t.id)}
                  style={{
                    flex: 1, background: 'none', border: 'none',
                    padding: '10px 0 12px', cursor: 'pointer',
                    color: active ? '#ffffff' : 'rgba(255,255,255,0.4)',
                    fontSize: 12, fontWeight: 500, letterSpacing: '-0.01em',
                    position: 'relative',
                    transition: 'color 0.15s',
                  }}
                >
                  {t.label}
                  {active && (
                    <span style={{
                      position: 'absolute', bottom: -0.5, left: 0, right: 0,
                      height: 1.5, background: '#ffffff', borderRadius: 2,
                    }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Upload */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 10 }}>
              Imagem
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) loadImageFile(f) }}
              style={{
                border: `1.5px dashed ${isDragging ? 'rgba(255,255,255,0.4)' : imageFile ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                transition: 'border-color 0.15s',
                background: isDragging ? 'rgba(255,255,255,0.04)' : 'transparent',
                minHeight: imageFile ? 0 : 120,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: imageFile ? 0 : '28px 20px',
              }}
            >
              {imageFile ? (
                <img src={imagePreview!} alt="preview" style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 10 }}>Arraste ou clique para enviar</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>PNG, JPG, WEBP — até 20 MB</span>
                </>
              )}
            </div>

            {imageFile && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', display: 'flex', gap: 8 }}>
                  {imageDimensions && <span>{imageDimensions.w}×{imageDimensions.h}px</span>}
                  {ext && <span>{ext}</span>}
                  <span>{formatFileSize(imageFile.size)}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); resetImage() }}
                  style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Trocar imagem
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImageFile(f) }} />

            <button
              onClick={() => setShowImportModal(true)}
              disabled={isImporting}
              style={{
                marginTop: 10, width: '100%', padding: '8px 0', borderRadius: 7,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'transparent',
                fontSize: 11, color: 'rgba(255,255,255,0.4)',
                cursor: isImporting ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 7v5l3 3"/>
              </svg>
              {isImporting ? 'Importando…' : 'Importar do histórico'}
            </button>
          </div>

          {/* Recommendation banner */}
          {isAnalyzing ? (
            <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.15)', borderTop: '1.5px solid rgba(255,255,255,0.5)', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Analisando imagem...</span>
            </div>
          ) : !imageFile ? (
            <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                Envie uma imagem para a SpaceNode analisar e sugerir o melhor caminho.
              </div>
            </div>
          ) : recommended ? (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.16)', animation: 'fadeIn 0.2s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M6 1l1.09 3.26L10.5 4.5l-2.59 2.09.91 3.41L6 8.25l-2.82 1.75.91-3.41L1.5 4.5l3.41-.24L6 1z" fill="rgba(134,239,172,0.85)"/>
                </svg>
                <span style={{ fontSize: 10, color: 'rgba(134,239,172,0.9)', fontWeight: 500 }}>
                  Recomendado: <strong style={{ fontWeight: 700 }}>{modes.find(m => m.id === recommended.modeId)?.label ?? 'Alta Fidelidade'}</strong>
                </span>
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 4, paddingLeft: 16 }}>{recommended.reason}</div>
            </div>
          ) : null}

          {/* Mode selector */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 10 }}>
              Modo
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {modes.map(mode => {
                const isSelected    = selectedModeId === mode.id
                const isRecommended = recommended?.modeId === mode.id && !!imageFile
                return (
                  <button key={mode.id} onClick={() => applyMode(mode.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      border: `1px solid ${isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
                      background: isSelected ? 'rgba(255,255,255,0.06)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isSelected ? '#ffffff' : 'rgba(255,255,255,0.2)', transition: 'background 0.15s' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)', letterSpacing: '-0.01em' }}>{mode.label}</span>
                        {isRecommended && (
                          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(134,239,172,0.8)', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', padding: '1px 5px', borderRadius: 20 }}>
                            Recomendado
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{mode.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Objective (only on Resolução) */}
          {tab === 'resolution' && (
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 10 }}>
                Objetivo
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                {OBJECTIVES.map(obj => (
                  <button key={obj.id} onClick={() => applyObjective(obj.id)}
                    style={{
                      padding: '6px 10px', borderRadius: 6,
                      border: `1px solid ${selectedObjective === obj.id ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
                      background: selectedObjective === obj.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                      fontSize: 11, color: selectedObjective === obj.id ? '#ffffff' : 'rgba(255,255,255,0.45)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {obj.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scale */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 10 }}>
              {tab === 'resolution' ? 'Escala' : 'Tamanho final'}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {availableScales.map(s => {
                const isSelected = selectedScale === s.value
                const locked     = !!s.locked
                return (
                  <button key={s.value} onClick={() => !locked && setSelectedScale(s.value)} disabled={locked}
                    title={locked ? 'Em breve' : undefined}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 8,
                      border: `1px solid ${!locked && isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)'}`,
                      background: !locked && isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                      cursor: locked ? 'not-allowed' : 'pointer',
                      opacity: locked ? 0.4 : 1, textAlign: 'center', transition: 'all 0.15s', position: 'relative',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: !locked && isSelected ? '#ffffff' : 'rgba(255,255,255,0.5)', letterSpacing: '-0.01em' }}>{s.label}</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2, letterSpacing: '0.04em' }}>{s.sub}</div>
                    {locked && (
                      <div style={{ position: 'absolute', top: 4, right: 6 }}>
                        <svg width="9" height="9" viewBox="0 0 14 16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round">
                          <rect x="2" y="7" width="10" height="8" rx="1.5"/><path d="M5 7V5a2 2 0 0 1 4 0v2"/>
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 11, color: '#fca5a5' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '0.5px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              Custo: <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{nodeCost} Nodes</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              Saldo: <span style={{ color: credits > 0 ? 'rgba(255,255,255,0.7)' : '#f87171', fontWeight: 500 }}>{credits} Nodes</span>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={!canSubmit}
            style={{
              width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
              background: canSubmit ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.07)',
              color: canSubmit ? '#0a0a0a' : 'rgba(255,255,255,0.25)',
              fontSize: 13, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s, color 0.15s', letterSpacing: '-0.01em',
            }}
          >
            {isLoading ? loadingText : credits < nodeCost ? 'Sem Nodes' : tab === 'resolution' ? 'Ampliar Imagem' : 'Aprimorar Imagem'}
          </button>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, overflow: 'hidden' }}>

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTop: '2px solid rgba(255,255,255,0.7)', animation: 'spin 0.9s linear infinite' }} />
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.02em' }}>{loadingText}</div>
          </div>
        )}

        {!isLoading && resultUrl && imagePreview && (
          <div style={{ width: '100%', maxWidth: 760, animation: 'fadeIn 0.3s ease' }}>
            <BeforeAfter beforeUrl={imagePreview} afterUrl={resultUrl} beforeLabel="ORIGINAL" afterLabel={tab === 'resolution' ? 'AMPLIADO' : 'APRIMORADO'} />
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>
                Arraste para comparar · {selectedScale === 'none' ? 'sem aumento' : `${factorOut}×`} · {activeMode.label}
                {imageDimensions && factorOut > 1 && <span> · {imageDimensions.w * factorOut}×{imageDimensions.h * factorOut}px</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={resultUrl} download target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Baixar imagem
                </a>
                <button disabled title="Em breve"
                  style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'none', border: '1px solid rgba(255,255,255,0.07)', padding: '7px 14px', borderRadius: 6, cursor: 'not-allowed' }}
                >
                  Usar no Spaces
                </button>
              </div>
            </div>
          </div>
        )}

        {!isLoading && !resultUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, animation: 'fadeIn 0.2s ease' }}>
            <div style={{ opacity: 0.16 }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
                <path d="M15 13l3 3-3 3"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: 500, letterSpacing: '-0.01em' }}>O resultado aparecerá aqui</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 5, lineHeight: 1.5 }}>
                Envie uma imagem para comparar antes/depois em alta resolução.
              </div>
            </div>
          </div>
        )}
      </div>

      {showImportModal && (
        <RetocarImportModal
          onClose={() => setShowImportModal(false)}
          onPick={handleImportPick}
        />
      )}
    </div>
  )
}
