'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import UpscaleCompare from '@/components/app/UpscaleCompare'
import { RetocarImportModal } from '@/components/spaces/RetocarImportModal'
import {
  ChoiceGroup,
  RowIcon,
  Segmented,
  SettingGroup,
  SettingRow,
  Sheet,
  summarize,
  useAmbient,
} from '@/components/app/glass'
import {
  computeUpscaleCost,
  megapixelsFromDimensions,
  OBJECTIVE_PRESETS,
  OFFERED_SCALES,
  analyzeImage,
  maxScaleForDimensions,
  projectedDimensions,
  resolveScale,
  scaleExceedsCap,
  type UpscaleTab,
  type ModeId,
  type Scale,
  type ObjectiveId,
} from '@/lib/upscale'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import { MAX_SOURCE_BYTES } from '@/lib/upscale/limits'
import { waitForUpscaleJob, PENDING_UPSCALE, type JobResponse } from '@/lib/upscale/browser-job'
import { jsonOrNull } from '@/lib/http/fetch-json'
import { urlToFile } from '@/lib/http/url-to-file'

// ── Tipagem da UI (labels sem nomes técnicos de modelo) ───────────────────────

interface ModeDef {
  id:    ModeId
  label: string
  /** Uma linha só — é a nota do cartão dentro da folha, não um parágrafo. */
  note:  string
}

const RESOLUTION_MODES: ModeDef[] = [
  { id: 'fidelity', label: 'Alta Fidelidade',        note: 'Preserva geometria e materiais' },
  { id: 'recover',  label: 'Recuperar Imagem Baixa', note: 'Trata artefato de compressão' },
]

const ENHANCE_MODES: ModeDef[] = [
  { id: 'denoise', label: 'Limpar Ruído',         note: 'Tira granulação' },
  { id: 'deblur',  label: 'Corrigir Desfoque',    note: 'Devolve nitidez' },
  { id: 'restore', label: 'Restaurar Imagem',     note: 'Corrige degradação' },
  { id: 'smart',   label: 'Melhoria Inteligente', note: 'Refino discreto' },
]

// 'ultra' saiu porque nunca habilitava. '8x' saiu pelo mesmo motivo com um
// agravante: ele ESTAVA habilitado e cobrava 5× a base, mas os dois motores
// têm `upscale_factor` com máximo 4 no schema do FAL — o Topaz devolvia 4×
// calado e o Clarity nem rodava. Quem pedia 8× pagava 50 nodes por 20 nodes de
// trabalho. Ver MAX_UPSCALE_FACTOR em lib/upscale/types.ts.
const SCALE_LABEL: Record<string, string> = { '2x': '2×', '4x': '4×' }

// Os objetivos moram na folha, como personalização opcional. A superfície
// tem a imagem, UMA escolha simples (2× / 4×, com a recomendada já marcada),
// o que vai sair em pixels e o CTA. O que o sistema decidiu aparece como
// consequência, não como pergunta.
// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatPx(n: number): string {
  return n.toLocaleString('pt-BR')
}

function defaultModeForTab(tab: UpscaleTab): ModeId {
  return tab === 'resolution' ? 'fidelity' : 'restore'
}

function defaultScaleForMode(tab: UpscaleTab, modeId: ModeId): Scale {
  if (tab === 'resolution') return '4x'
  return modeId === 'smart' ? '2x' : 'none'
}

// Tempo esperado da geração, em segundos. Medido contra o FAL em 2026-09-18
// (lib/upscale/MEDICOES.md): ~12 s de overhead + ~11 s por megapixel de
// ENTRADA — e, o que surpreende, praticamente independente do fator: 2× e 4×
// da mesma imagem levaram 32,4 s e 33,2 s.
function estimateSeconds(megapixels: number | undefined): number {
  return Math.round(12 + 11 * (megapixels ?? 1.5))
}

// ── Componente ───────────────────────────────────────────────────────────────

interface UpscaleClientProps {
  initialCredits: number
  /** URL https de uma render existente a pré-carregar como input (ex.: "Ampliar" no dashboard). */
  sourceUrl?: string
}

// A tela funciona sem ninguém tocar em nada: abre com um objetivo já
// escolhido, e ele define aba/modo/escala. Com a imagem, a análise pode trocar
// o objetivo (imagem comprimida → Recuperar) e a escala recomendada se ajusta
// ao tamanho.
const DEFAULT_OBJECTIVE: ObjectiveId = 'client'

interface ResultMeta {
  inputUrl: string | null
  previewUrl: string | null
  beforePreviewUrl: string | null
  label: string
  fallbackUsed: boolean
  width:  number | null
  height: number | null
  bytes:  number | null
  factor: number | null
  /** 'line-art' quando o servidor reconheceu desenho técnico e usou o modelo de traço. */
  sourceKind: string | null
}

export default function UpscaleClient({ initialCredits, sourceUrl }: UpscaleClientProps) {
  // Image state
  const [imageFile,       setImageFile]       = useState<File | null>(null)
  const [isReadingImage, setIsReadingImage] = useState(false)
  const [sourceKind, setSourceKind] = useState<'auto' | 'image' | 'line-art'>('auto')
  const imageVersion = useRef(0)
  const busyRef = useRef(false)
  const [imagePreview,    setImagePreview]    = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null)
  const [isDragging,      setIsDragging]      = useState(false)

  // Objetivo (decidido sozinho) + os efeitos dele. Aba e modo moram na folha;
  // a escala é a única escolha da superfície.
  const [selectedObjective, setSelectedObjective] = useState<ObjectiveId>(DEFAULT_OBJECTIVE)
  const [tab,            setTab]            = useState<UpscaleTab>(OBJECTIVE_PRESETS[DEFAULT_OBJECTIVE].tab)
  const [selectedModeId, setSelectedModeId] = useState<ModeId>(OBJECTIVE_PRESETS[DEFAULT_OBJECTIVE].modeId)
  const [selectedScale,  setSelectedScale]  = useState<Scale>(OBJECTIVE_PRESETS[DEFAULT_OBJECTIVE].scale)
  const [tuneOpen,       setTuneOpen]       = useState(false)
  // O usuário escolheu a escala à mão? Enquanto não escolheu, ela segue a
  // recomendação (resolveScale) e se reajusta sozinha quando a imagem troca.
  const [scalePinned,    setScalePinned]    = useState(false)

  // Recommendation
  const [recommendation, setRecommendation] = useState<string>('')

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false)
  const [isImporting,     setIsImporting]     = useState(false)

  // Submit
  const [isLoading,   setIsLoading]   = useState(false)
  const [elapsedMs,   setElapsedMs]   = useState(0)
  const [resultUrl,   setResultUrl]   = useState<string | null>(null)
  const [resultMeta,  setResultMeta]  = useState<ResultMeta | null>(null)
  const [credits,     setCredits]     = useState(initialCredits)
  const [error,       setError]       = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // O papel de parede passa a ser a imagem em jogo — o resultado assim que ele
  // sai, o original enquanto não há resultado. É o que faz o painel assumir a
  // paleta do projeto, como no plugin.
  useAmbient(resultMeta?.previewUrl ?? resultUrl ?? imagePreview)

  useEffect(() => () => { if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current) }, [])

  // ── Derivações ─────────────────────────────────────────────────────────────

  const modes = tab === 'resolution' ? RESOLUTION_MODES : ENHANCE_MODES
  const activeMode = useMemo(
    () => modes.find(m => m.id === selectedModeId) ?? modes[0],
    [modes, selectedModeId],
  )

  const dims = useMemo(
    () => (imageDimensions ? { width: imageDimensions.w, height: imageDimensions.h } : null),
    [imageDimensions],
  )

  // Aba Aprimorar: escolha de escala depende do modo.
  //   - denoise / deblur / restore → fixo em 'none' (sem aumento; sem controle)
  //   - smart                     → escolha entre 2× e 4×
  // Aba Resolução: sempre o conjunto oferecido.
  const availableScales: Scale[] = useMemo(() => {
    if (tab === 'resolution') return [...OFFERED_SCALES]
    if (selectedModeId === 'smart') return [...OFFERED_SCALES]
    return []
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

  const nodeCost = costBreakdown.total

  // Resolução que este pedido entrega PARA ESTA IMAGEM. É o número que o
  // arquiteto entende — "4×" só faz sentido para quem já sabe o tamanho de
  // origem de cabeça.
  const projected = useMemo(
    () => (dims && selectedScale !== 'none' ? projectedDimensions(dims, selectedScale) : null),
    [dims, selectedScale],
  )

  // A escala recomendada é a que o objetivo (decidido sozinho) pede para esta
  // imagem. É a que vem marcada; o controle da superfície deixa trocar.
  const recommendedScale = useMemo(
    () => resolveScale(selectedObjective, dims),
    [selectedObjective, dims],
  )

  const overCap   = selectedScale !== 'none' && scaleExceedsCap(selectedScale, dims)
  // Nenhuma escala cabe: o problema é o tamanho da ENTRADA, e mandar "escolha
  // 2×" não resolveria nada.
  const noScaleFits = tab === 'resolution' && dims !== null && maxScaleForDimensions(dims) === null
  const canSubmit = !!imageFile && !!imageDimensions && credits >= nodeCost && !isLoading && !isReadingImage && !isImporting && !overCap

  // A linha "Ajuste fino" resume o que mora na folha (tratamento e modo). A
  // escala já está na superfície, então não repete aqui.
  const tuneSummary = summarize([tab === 'enhance' ? 'Aprimorar' : '', activeMode.label])

  // O objetivo é a ETIQUETA de um preset de aba+modo+escala. `objectiveId` só
  // viaja quando ainda descreve o pedido inteiro: `upscale_meta.objective_id`
  // é o único sinal de POR QUE o usuário ampliou, e gravar "Apresentação" numa
  // ampliação 4× envenena esse dado.
  const objectivePreset = OBJECTIVE_PRESETS[selectedObjective]
  const modeInSync =
    objectivePreset.tab === tab &&
    objectivePreset.modeId === selectedModeId
  

  const estimate = estimateSeconds(megapixels)

  // ── Handlers ───────────────────────────────────────────────────────────────

  function applyTab(next: UpscaleTab) {
    if (next === tab) return
    setTab(next)
    const nextMode  = defaultModeForTab(next)
    const nextScale = defaultScaleForMode(next, nextMode)
    setSelectedModeId(nextMode)
    setSelectedScale(nextScale)
    setScalePinned(true)
  }

  function applyMode(next: ModeId) {
    setSelectedModeId(next)
    // Reajusta escala se ficou incompatível ao trocar de modo dentro de Aprimorar.
    if (tab === 'enhance') {
      setSelectedScale(defaultScaleForMode('enhance', next))
    }
  }

  function applyScale(next: Scale) {
    setSelectedScale(next)
    // Escolher a recomendada é voltar ao automático; escolher a outra é fixar.
    setScalePinned(next !== recommendedScale)
  }

  function applyObjective(id: ObjectiveId, forDims = dims) {
    const preset = OBJECTIVE_PRESETS[id]
    setSelectedObjective(id)
    setTab(preset.tab)
    setSelectedModeId(preset.modeId)
    setSelectedScale(resolveScale(id, forDims))
    setScalePinned(false)
  }

  function restoreAutomatic() {
    const rec = imageFile && dims ? analyzeImage({ fileName: imageFile.name,
      fileSize: imageFile.size, mime: imageFile.type, ...dims }) : null
    applyObjective(rec?.objectiveId ?? DEFAULT_OBJECTIVE)
    setSourceKind('auto')
  }

  function loadImageFile(file: File) {
    if (busyRef.current) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Use JPEG, PNG ou WebP.'); return }
    if (file.size > MAX_SOURCE_BYTES) { setError('Imagem muito grande. Máximo 50 MB.'); return }
    const version = ++imageVersion.current
    setIsReadingImage(true)
    setImageFile(file)
    setResultUrl(null)
    setResultMeta(null)
    setError(null)
    setRecommendation('')
    setImageDimensions(null)
    setSourceKind('auto')
    setScalePinned(false)
    const url = URL.createObjectURL(file)
    setImagePreview(url)
    const image = new Image()
    image.onload = () => {
      if (version !== imageVersion.current) return
      const d = { width: image.naturalWidth, height: image.naturalHeight }
      setImageDimensions({ w: d.width, h: d.height })
      const rec = analyzeImage({ fileName: file.name, fileSize: file.size, mime: file.type, ...d })
      setRecommendation(rec.reason)
      applyObjective(rec.objectiveId ?? DEFAULT_OBJECTIVE, d)
      setIsReadingImage(false)
    }
    image.onerror = () => {
      if (version !== imageVersion.current) return
      setIsReadingImage(false)
      setImageFile(null)
      setImagePreview(null)
      setError('Não foi possível ler esta imagem. Tente outro arquivo.')
    }
    image.src = url
  }

  useEffect(() => {
    return () => { if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview) }
  }, [imagePreview])

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
    if (!/^https:\/\//i.test(sourceUrl) && !sourceUrl.startsWith('/api/media?')) return
    sourcePreloadedRef.current = true
    // O setState vive dentro do fluxo assíncrono da importação, não no corpo
    // do efeito: chamado direto ali, ele dispara uma cascata de render (e o
    // lint do react-hooks reprova).
    void (async () => {
      setIsImporting(true)
      try {
        loadImageFile(await urlToFile(sourceUrl))
      } catch {
        setError('Não foi possível carregar a imagem selecionada.')
      } finally {
        setIsImporting(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl])

  function resetImage() {
    if (busyRef.current) return
    imageVersion.current++
    setIsReadingImage(false)
    setSourceKind('auto')
    applyObjective(DEFAULT_OBJECTIVE, null)
    setImageFile(null)
    setImagePreview(null)
    setResultUrl(null)
    setResultMeta(null)
    setRecommendation('')
    setImageDimensions(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Baixa a imagem de fato (o atributo `download` é ignorado em URLs cross-origin,
  // então buscamos o blob e disparamos o download via object URL).
  async function handleDownload() {
    if (!resultUrl || isDownloading) return
    setIsDownloading(true)
    try {
      const res  = await fetch(resultUrl)
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      const dim = resultMeta?.width && resultMeta?.height ? `-${resultMeta.width}x${resultMeta.height}` : ''
      a.download = `spacenode-ampliado${dim}.${blob.type.split('/')[1] || 'jpg'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Fallback: abre em nova aba se o download direto falhar.
      setError('Não foi possível baixar a imagem. Verifique a conexão e tente novamente.')
    } finally {
      setIsDownloading(false)
    }
  }

  function showResult(data: JobResponse, charge: boolean) {
    if (data.status === 'failed') throw new Error(data.error ?? 'Não foi possível concluir a geração.')
    if (!data.url) throw new Error('Resultado indisponível.')
    setResultUrl(data.url)
    if (data.inputUrl) setImagePreview(data.beforePreviewUrl ?? data.inputUrl)
    if (data.inputDimensions) setImageDimensions({ w: data.inputDimensions.width, h: data.inputDimensions.height })
    const label = [...RESOLUTION_MODES, ...ENHANCE_MODES].find(m => m.id === data.modeId)?.label ?? 'Alta Fidelidade'
    setResultMeta({ inputUrl: data.inputUrl ?? null, previewUrl: data.previewUrl ?? null, beforePreviewUrl: data.beforePreviewUrl ?? null,
      label, fallbackUsed: false, width: data.outputWidth ?? null, height: data.outputHeight ?? null,
      bytes: data.outputBytes ?? null, factor: data.effectiveFactor ?? null, sourceKind: data.sourceKind ?? null })
    if (charge) setCredits(c => c - (data.nodesCharged ?? nodeCost))
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const pending = sessionStorage.getItem(PENDING_UPSCALE)
      if (!pending) return
      busyRef.current = true
      setIsLoading(true)
      try {
        const data = await waitForUpscaleJob(pending, () => cancelled)
        if (!data || cancelled) return
        sessionStorage.removeItem(PENDING_UPSCALE)
        showResult(data, false)
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : 'Não foi possível recuperar a geração.')
      } finally { if (!cancelled) { busyRef.current = false; setIsLoading(false) } }
    })()
    return () => { cancelled = true }
    // Apenas na montagem: a consulta nunca reenvia a geração.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit() {
    if (!imageFile || !canSubmit || busyRef.current) return
    busyRef.current = true
    setTuneOpen(false)
    setIsLoading(true)
    setError(null)
    setResultUrl(null)
    setResultMeta(null)
    setElapsedMs(0)
    const startedAt = Date.now()
    elapsedTimerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 250)
    const requestId = crypto.randomUUID()
    let submitted = false
    try {
      const { key: sourceKey } = await uploadDirect(imageFile, 'upscale-source', {}, { confirm: false })
      sessionStorage.setItem(PENDING_UPSCALE, requestId)
      submitted = true
      const res = await fetch('/api/upscale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, sourceKey, tab, modeId: selectedModeId, scale: selectedScale, sourceKind }),
      })
      const data = await jsonOrNull(res) as JobResponse | null
      if (!res.ok) {
        if (data?.status === 'failed' || res.status === 400 || res.status === 402) {
          sessionStorage.removeItem(PENDING_UPSCALE)
          submitted = false
        }
        throw new Error(data?.error ?? 'Não foi possível confirmar a geração.')
      }
      const result = res.status === 202 ? await waitForUpscaleJob(requestId) : data
      if (!result) throw new Error('Não foi possível confirmar o resultado.')
      sessionStorage.removeItem(PENDING_UPSCALE)
      submitted = false
      showResult(result, true)
    } catch (error) {
      if (submitted) {
        try {
          const data = await waitForUpscaleJob(requestId)
          if (data) {
            sessionStorage.removeItem(PENDING_UPSCALE)
            showResult(data, true)
          }
        } catch (recoveryError) {
          setError(recoveryError instanceof Error ? recoveryError.message : 'Consulte o histórico para confirmar a geração.')
        }
      } else setError(error instanceof Error ? error.message : 'Falha de conexão. Não conseguimos confirmar a geração.')
    } finally {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      busyRef.current = false
      setIsLoading(false)
    }
  }

  const ext = imageFile?.name.split('.').pop()?.toUpperCase() ?? ''

  // Fase do processamento, ancorada no tempo REAL contra a estimativa medida.
  const elapsedS  = Math.floor(elapsedMs / 1000)
  const progress  = Math.min(0.95, elapsedMs / (estimate * 1000))
  const phaseText =
    elapsedS < 4                   ? 'Enviando imagem…'
    : elapsedS < estimate * 0.85   ? 'Reconstruindo detalhe em alta resolução…'
    : elapsedS < estimate * 1.6    ? 'Finalizando a imagem…'
    :                                'Ainda processando — imagens grandes levam mais tempo.'

  // O que dizer sob o controle de escala. Com imagem: qual é a recomendada e
  // por quê em pixels; sem imagem: nada a inventar.
  const scaleHint = (() => {
    if (!dims || availableScales.length === 0) return ''
    const recLabel = SCALE_LABEL[recommendedScale] ?? recommendedScale
    if (noScaleFits) return ''
    if (selectedScale === recommendedScale) return `${recLabel} é o recomendado para esta imagem.`
    return `Recomendado: ${recLabel}. A escolha vale só para esta imagem.`
  })()

  // .spn-ghost não fixa display — num <a> a altura só pega com flex.
  const ghostLink: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
  }

  return (
    <div className="spn-tool spn-upscale">
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 899.98px) {
          .spn-upscale { overflow-y: auto; grid-template-rows: max-content max-content; align-content: start; }
          .spn-upscale .spn-tool-panel-body--scroll { flex: 0 0 auto; overflow-y: visible; }
        }
      `}</style>

      {/* ── Painel ──────────────────────────────────────────────────────────── */}
      <section className="spn-tool-panel spn-glass spn-glass--chrome">
        <div className="spn-tool-panel-body spn-tool-panel-body--scroll">
          <h1 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
            Ampliar
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4, marginBottom: 18, lineHeight: 1.5 }}>
            Aumente a resolução e confira os detalhes do seu projeto.
          </p>

          {/* Imagem: o campo obrigatório. */}
          <div className="spn-field">
            <span className="spn-field-label">Imagem</span>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) loadImageFile(f) }}
              style={{
                border: `1px dashed ${isDragging ? 'var(--color-border-focus)' : 'var(--glass-line-strong)'}`,
                borderRadius: 'var(--r-inner)', overflow: 'hidden', cursor: 'pointer',
                transition: 'border-color 180ms var(--ease)',
                background: isDragging ? 'var(--color-chip-hover)' : 'var(--color-chip)',
                minHeight: imageFile ? 0 : 120,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: imageFile ? 0 : '28px 20px',
              }}
            >
              {imageFile ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview!} alt="preview" style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-quaternary)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 10 }}>Arraste ou clique para enviar</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 4 }}>PNG, JPG, WEBP — até 50 MB</span>
                </>
              )}
            </div>

            {imageFile && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span className="spn-hint" style={{ marginTop: 0 }}>
                  {imageDimensions ? `${formatPx(imageDimensions.w)}×${formatPx(imageDimensions.h)}px · ` : ''}
                  {ext ? `${ext} · ` : ''}
                  {formatFileSize(imageFile.size)}
                </span>
                <button type="button" className="spn-ghost" style={{ height: 28, padding: '0 11px', fontSize: 11.5, flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); resetImage() }}>
                  Trocar
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={isLoading} style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImageFile(f) }} />

            <button type="button" className="spn-ghost"
              style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => setShowImportModal(true)} disabled={isImporting || isLoading || isReadingImage}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 7v5l3 3"/>
              </svg>
              {isImporting ? 'Importando…' : 'Importar do histórico'}
            </button>

            {/* A análise do arquivo é a decisão automática falando: só aparece
                quando tem algo concreto a dizer. */}
            {recommendation && <p className="spn-hint">{recommendation}</p>}
          </div>

          {/* Escala: a única escolha da superfície. Vidro (o Segmented já é
              .spn-glass), com a recomendada marcada; a outra é um toque. Uma
              escala que estoura o teto do motor aparece apagada com o motivo,
              em vez de falhar depois do upload. */}
          {availableScales.length > 0 && (
            <div className="spn-field">
              <span className="spn-field-label">Escala</span>
              <Segmented
                label="Escala"
                value={selectedScale}
                onChange={applyScale}
                items={availableScales.map(s => {
                  const over = scaleExceedsCap(s, dims)
                  const p    = dims ? projectedDimensions(dims, s) : null
                  return {
                    value: s,
                    label: (SCALE_LABEL[s] ?? s) + (s === recommendedScale && !scalePinned ? ' · recomendado' : ''),
                    disabled: over || isLoading || isReadingImage,
                    title: over
                      ? 'Grande demais para o motor nesta imagem'
                      : p ? `${formatPx(p.width)} × ${formatPx(p.height)} px` : undefined,
                  }
                })}
              />
              {scaleHint && <p className="spn-hint">{scaleHint}</p>}
            </div>
          )}

          {/* O que vai sair, em vidro elevado: é a tradução da escolha para
              a língua de quem entrega prancha — pixels, não multiplicador. */}
          {projected && (
            <div className="spn-field">
              <div
                className="spn-glass spn-glass--raised"
                style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  gap: 10, padding: '10px 12px', borderRadius: 'var(--r-inner)',
                }}
              >
                <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>Resolução final</span>
                <span style={{
                  fontSize: 13, fontWeight: 560, color: 'var(--color-text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatPx(projected.width)} × {formatPx(projected.height)} px
                </span>
              </div>
              {overCap && (
                <p className="spn-hint" style={{ color: 'var(--color-error)' }}>
                  {noScaleFits
                    ? 'Esta imagem já é grande demais para ser ampliada. Em “Ajustes avançados”, use Aprimorar qualidade — ele melhora sem aumentar.'
                    : 'Grande demais para o motor. Escolha 2×.'}
                </p>
              )}
            </div>
          )}

          {/* Ajuste fino: o que mora na folha, numa linha — e a porta para
              mudar. Quem confia no automático nunca abre. */}
          <div className="spn-field">
            <SettingGroup>
              <SettingRow
                icon={<RowIcon name="scale" />}
                title="Ajustes avançados"
                value={tuneSummary}
                controls="upscale-tune"
                onOpen={() => { if (!isLoading && !isReadingImage) setTuneOpen(true) }}
              />
            </SettingGroup>
            {/* Só quando a FOLHA foi mexida (tratamento/modo) — trocar a
                escala na superfície é uso normal, não ajuste manual. */}
            {!modeInSync && (
              <p className="spn-hint">Usando suas escolhas nos ajustes avançados.</p>
            )}
          </div>

          {error && <div className="spn-error">{error}</div>}
        </div>

        {/* Dock: o CTA nunca some no scroll. */}
        <div className="spn-dock spn-glass spn-glass--chrome">
          <div className="spn-cost">
            <div className="spn-cost-figures">
              <div className="spn-cost-main">{nodeCost} nodes</div>
              <div className="spn-cost-sub" style={credits < nodeCost ? { color: 'var(--color-error)' } : undefined}>
                {imageFile && !isLoading ? `Saldo: ${credits} · ~${estimate}s` : `Saldo: ${credits} nodes`}
              </div>
            </div>
            <button type="button" className="spn-cta" onClick={handleSubmit} disabled={!canSubmit}>
              {isLoading
                ? `Processando · ${elapsedS}s`
                : credits < nodeCost
                  ? 'Sem nodes'
                  : tab === 'resolution' ? 'Ampliar imagem' : 'Aprimorar imagem'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Palco ───────────────────────────────────────────────────────────── */}
      <section className="spn-tool-stage spn-glass" style={{ overflowY: 'auto', alignItems: 'safe center' }}>
        {isLoading && (
          <div
            className="spn-glass spn-glass--raised"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 340, padding: '26px 24px', borderRadius: 'var(--r-card)' }}
          >
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--glass-line-strong)', borderTop: '2px solid var(--color-text-secondary)', animation: 'spin 0.9s linear infinite' }} />
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', textAlign: 'center' }}>{phaseText}</div>
            {/* Barra ancorada na estimativa medida — para em 95% e espera o
                resultado de verdade em vez de fingir 100%. */}
            <div style={{ width: '100%', height: 3, borderRadius: 3, background: 'var(--glass-line-strong)', overflow: 'hidden' }}>
              <div style={{
                width: `${progress * 100}%`, height: '100%',
                background: 'var(--color-text-secondary)',
                transition: 'width 250ms linear',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', fontVariantNumeric: 'tabular-nums' }}>
              {elapsedS}s de aproximadamente {estimate}s
            </div>
          </div>
        )}

        {!isLoading && resultUrl && imagePreview && (
          <div style={{ width: '100%', maxWidth: 820, maxHeight: '100%', overflowY: 'auto', padding: 20, animation: 'fadeIn 0.3s ease' }}>
            {resultMeta?.fallbackUsed && (
              <div className="spn-error" style={{ marginBottom: 12 }}>
                O motor de alta fidelidade não respondeu e usamos o motor alternativo
                nesta ampliação. Confira detalhes finos (esquadrias, textos, linhas) —
                se notar diferenças, tente novamente em alguns minutos.
              </div>
            )}
            <UpscaleCompare
              beforeUrl={resultMeta?.inputUrl ?? imagePreview}
              beforePreviewUrl={resultMeta?.beforePreviewUrl}
              afterPreviewUrl={resultMeta?.previewUrl}
              afterUrl={resultUrl}
              aspect={imageDimensions ? imageDimensions.w / imageDimensions.h : 1.5}
              outputWidth={resultMeta?.width}
              outputHeight={resultMeta?.height}
              beforeLabel="Original"
              afterLabel={resultMeta?.factor === 1 ? 'Aprimorado' : 'Ampliado'}
            />
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span className="spn-hint" style={{ marginTop: 0 }}>
                {/* Dimensões REAIS medidas no servidor; a projeção só entra
                    quando a verificação do output falhou. */}
                {resultMeta?.width && resultMeta?.height
                  ? `${formatPx(resultMeta.width)}×${formatPx(resultMeta.height)}px`
                  : projected ? `${formatPx(projected.width)}×${formatPx(projected.height)}px` : ''}
                {resultMeta?.factor ? ` · ${resultMeta.factor}×` : ''}
                {resultMeta?.bytes ? ` · ${formatFileSize(resultMeta.bytes)}` : ''}
                {` · ${resultMeta?.label ?? activeMode.label}`}
                {/* O servidor reconheceu desenho técnico e usou o modelo de
                    traço — a única decisão automática que vale a pena nomear,
                    porque explica por que a planta saiu tão limpa. */}
                {resultMeta?.sourceKind === 'line-art' ? ' · Desenho técnico' : ''}
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="spn-ghost" style={ghostLink} onClick={handleDownload} disabled={isDownloading}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {isDownloading ? 'Baixando…' : 'Baixar imagem'}
                </button>
                <button type="button" className="spn-ghost" style={ghostLink} onClick={resetImage}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21v-5h5"/>
                    <path d="M21 3v5h-5"/>
                    <path d="M21 8a9 9 0 0 0-15-3.5L3 8"/>
                    <path d="M3 16a9 9 0 0 0 15 3.5l3-3.5"/>
                  </svg>
                  Ampliar nova imagem
                </button>
                <a className="spn-ghost" style={ghostLink} href={`/app/editar?source=${encodeURIComponent(resultUrl)}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                  </svg>
                  Editar imagem
                </a>
              </div>
            </div>
          </div>
        )}

        {!isLoading && !resultUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 24, animation: 'fadeIn 0.2s ease' }}>
            <div style={{ opacity: 0.16, color: 'var(--color-text-primary)' }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
                <path d="M15 13l3 3-3 3"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>O resultado aparecerá aqui</div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-quaternary)', marginTop: 5, lineHeight: 1.5 }}>
                Envie uma imagem para comparar antes/depois, inclusive pixel a pixel.
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Folha de ajuste fino: objetivo, tratamento e modo — personalização
          opcional. A escala já está na superfície. */}
      <Sheet id="upscale-tune" open={tuneOpen} title="Ajustes avançados" onClose={() => setTuneOpen(false)}>
        <div className="spn-field">
          <span className="spn-field-label">Tipo de imagem</span>
          <Segmented label="Tipo de imagem" value={sourceKind}
            onChange={next => setSourceKind(next as typeof sourceKind)}
            items={[{ value: 'auto', label: 'Automático' }, { value: 'image', label: 'Foto / render' },
              { value: 'line-art', label: 'Desenho técnico' }]} />
          <p className="spn-hint">Desenho técnico é indicado para linhas e texto sem renderizações ou fotografias.</p>
        </div>
        <div className="spn-field">
          <span className="spn-field-label">Tratamento</span>
          <Segmented
            label="Tratamento"
            value={tab}
            onChange={applyTab}
            items={[
              { value: 'resolution', label: 'Aumentar resolução'  },
              { value: 'enhance',    label: 'Aprimorar qualidade' },
            ]}
          />
        </div>

        <div className="spn-field">
          <span className="spn-field-label">Modo</span>
          <ChoiceGroup
            label="Modo"
            cols={2}
            value={selectedModeId}
            onChange={applyMode}
            options={modes.map(m => ({ value: m.id, title: m.label, note: m.note }))}
          />
          {availableScales.length === 0 && (
            <p className="spn-hint">
              Este modo entrega na resolução original — ele limpa, não amplia.
            </p>
          )}
        </div>

        <p className="spn-hint">
          As escolhas valem para esta imagem. Ao trocar a imagem, voltamos ao automático.
        </p>
        <button type="button" className="spn-btn" onClick={restoreAutomatic}>Voltar ao automático</button>
      </Sheet>

      {showImportModal && (
        <RetocarImportModal
          onClose={() => setShowImportModal(false)}
          onPick={handleImportPick}
        />
      )}
    </div>
  )
}
