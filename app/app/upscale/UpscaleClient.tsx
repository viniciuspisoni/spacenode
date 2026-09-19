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
import { jsonOrNull, errMsg } from '@/lib/http/fetch-json'
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

// O objetivo era o eixo da superfície; agora é decidido sozinho e mora na
// folha, como override. A superfície tem UMA ação: enviar a imagem e clicar.
// O que o sistema decidiu aparece como consequência — a resolução final em
// pixels e o resumo da linha "Ajuste fino" — não como pergunta.
const OBJECTIVES: { value: ObjectiveId; title: string; note: string }[] = [
  { value: 'client',    title: 'Apresentação para cliente', note: 'Nítida na tela e no PDF'     },
  { value: 'portfolio', title: 'Portfólio / Instagram',     note: 'Aguenta o zoom do feed'      },
  { value: 'print',     title: 'Impressão / prancha',       note: 'Densidade para papel'        },
  { value: 'recover',   title: 'Recuperar imagem baixa',    note: 'Imagem antiga ou comprimida' },
  { value: 'final',     title: 'Entrega final premium',     note: 'Máximo acabamento'           },
]

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
// o objetivo (imagem comprimida → Recuperar) e a escala se ajusta ao tamanho.
const DEFAULT_OBJECTIVE: ObjectiveId = 'client'

interface ResultMeta {
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
  const [imagePreview,    setImagePreview]    = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null)
  const [isDragging,      setIsDragging]      = useState(false)

  // Objetivo (decidido sozinho) + os três efeitos dele (folha de ajuste fino).
  const [selectedObjective, setSelectedObjective] = useState<ObjectiveId>(DEFAULT_OBJECTIVE)
  const [tab,            setTab]            = useState<UpscaleTab>(OBJECTIVE_PRESETS[DEFAULT_OBJECTIVE].tab)
  const [selectedModeId, setSelectedModeId] = useState<ModeId>(OBJECTIVE_PRESETS[DEFAULT_OBJECTIVE].modeId)
  const [selectedScale,  setSelectedScale]  = useState<Scale>(OBJECTIVE_PRESETS[DEFAULT_OBJECTIVE].scale)
  const [tuneOpen,       setTuneOpen]       = useState(false)
  // O usuário mexeu na escala à mão? Enquanto não mexeu, ela é derivada da
  // imagem (resolveScale) e se reajusta sozinha quando a imagem troca.
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
  useAmbient(resultUrl ?? imagePreview)

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

  const overCap   = selectedScale !== 'none' && scaleExceedsCap(selectedScale, dims)
  // Nenhuma escala cabe: o problema é o tamanho da ENTRADA, e mandar "escolha
  // 2×" não resolveria nada.
  const noScaleFits = tab === 'resolution' && dims !== null && maxScaleForDimensions(dims) === null
  const canSubmit = !!imageFile && credits >= nodeCost && !isLoading && !overCap

  const scaleLabel = selectedScale === 'none' ? '' : SCALE_LABEL[selectedScale] ?? selectedScale
  // Regra do resumo: entra o que o usuário ESCOLHEU. "Sem aumento" é o default
  // silencioso dos modos de Aprimorar — some, e a linha fica só com o modo.
  const tuneSummary = summarize([activeMode.label, scaleLabel])

  // O objetivo é a ETIQUETA de um preset de aba+modo+escala. Quem mexe no
  // ajuste fino desfaz esse vínculo — e `objectiveId` nunca deve viajar
  // contradizendo o que foi de fato pedido: `upscale_meta.objective_id` é o
  // único sinal de POR QUE o usuário ampliou, e gravar "Impressão" numa
  // ampliação 2×/Recuperar envenena esse dado.
  const objectivePreset = OBJECTIVE_PRESETS[selectedObjective]
  const objectiveInSync =
    objectivePreset.tab === tab &&
    objectivePreset.modeId === selectedModeId &&
    selectedScale === resolveScale(selectedObjective, dims)

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
    setScalePinned(true)
  }

  function applyObjective(id: ObjectiveId, forDims = dims) {
    const preset = OBJECTIVE_PRESETS[id]
    setSelectedObjective(id)
    setTab(preset.tab)
    setSelectedModeId(preset.modeId)
    setSelectedScale(resolveScale(id, forDims))
    setScalePinned(false)
  }

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Arquivo deve ser uma imagem.'); return }
    if (file.size > 20 * 1024 * 1024)   { setError('Imagem muito grande. Máximo 20 MB.'); return }

    setImageFile(file)
    setResultUrl(null)
    setResultMeta(null)
    setError(null)
    setRecommendation('')
    setImageDimensions(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImagePreview(dataUrl)
      const img = new Image()
      img.onload = () => {
        const d = { width: img.naturalWidth, height: img.naturalHeight }
        setImageDimensions({ w: d.width, h: d.height })

        // A análise só fala quando tem o que dizer, e fala movendo o OBJETIVO
        // — não três controles soltos. O sinal vem das dimensões e da
        // densidade de bytes reais, não de palavra no nome do arquivo (que
        // errava em "casa-antiga.jpg" e acertava por acaso).
        const rec = analyzeImage({
          fileName: file.name, fileSize: file.size, width: d.width, height: d.height,
        })
        setRecommendation(rec.reason)
        if (rec.objectiveId) applyObjective(rec.objectiveId, d)
        else if (!scalePinned) setSelectedScale(resolveScale(selectedObjective, d))
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
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
      window.open(resultUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleSubmit() {
    if (!imageFile || !canSubmit) return
    setIsLoading(true)
    setError(null)
    setResultUrl(null)
    setResultMeta(null)
    setElapsedMs(0)

    // Cronômetro real. O carrossel antigo trocava de frase a cada 1,8 s e
    // chegava em "Finalizando…" aos 9 s — numa geração que leva 30 s ou mais,
    // ele passava o resto do tempo mentindo.
    const startedAt = Date.now()
    elapsedTimerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 250)

    try {
      // Imagem sobe direto pro Storage (sem passar pela Vercel); a rota recebe a key.
      const { key: sourceKey } = await uploadDirect(imageFile, 'upscale-source', {}, { confirm: false })

      const res = await fetch('/api/upscale', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceKey,
          tab,
          modeId: selectedModeId,
          scale:  selectedScale,
          // Opcional, como sempre foi: só vai quando ainda descreve o pedido.
          ...(objectiveInSync ? { objectiveId: selectedObjective } : {}),
          ...(imageDimensions ? { imageWidth: imageDimensions.w, imageHeight: imageDimensions.h } : {}),
        }),
      })
      const data = await jsonOrNull(res)
      if (!res.ok) { setError(errMsg(data, 'Não foi possível processar esta imagem.')); return }
      setResultUrl(data?.url as string)
      setResultMeta({
        fallbackUsed: Boolean(data?.fallbackUsed),
        width:  typeof data?.outputWidth  === 'number' ? data.outputWidth  : null,
        height: typeof data?.outputHeight === 'number' ? data.outputHeight : null,
        bytes:  typeof data?.outputBytes  === 'number' ? data.outputBytes  : null,
        factor: typeof data?.effectiveFactor === 'number' ? data.effectiveFactor : null,
        sourceKind: typeof data?.sourceKind === 'string' ? data.sourceKind : null,
      })
      setCredits(c => c - (typeof data?.nodesCharged === 'number' ? data.nodesCharged : nodeCost))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha de conexão. Nenhum node foi cobrado.')
    } finally {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
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

  // .spn-ghost não fixa display — num <a> a altura só pega com flex.
  const ghostLink: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
  }

  return (
    <div className="spn-tool">
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Painel ──────────────────────────────────────────────────────────── */}
      <section className="spn-tool-panel spn-glass spn-glass--chrome">
        <div className="spn-tool-panel-body spn-tool-panel-body--scroll">
          <h1 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
            Ampliar
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4, marginBottom: 18, lineHeight: 1.5 }}>
            Envie a imagem. O resto vem decidido.
          </p>

          {/* Imagem: o único campo da superfície. */}
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
                  <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 4 }}>PNG, JPG, WEBP — até 20 MB</span>
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

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImageFile(f) }} />

            <button type="button" className="spn-ghost"
              style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => setShowImportModal(true)} disabled={isImporting}>
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

          {/* O que vai sair. É a tradução da decisão automática para a língua
              de quem entrega prancha: pixels, não multiplicador. */}
          {projected && (
            <div className="spn-field">
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 10, padding: '10px 12px',
                borderRadius: 'var(--r-inner)', background: 'var(--color-chip)',
                border: '0.5px solid var(--glass-line-strong)',
              }}>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>Resultado</span>
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
                    ? 'Esta imagem já é grande demais para ser ampliada. Em “Ajuste fino”, use Aprimorar qualidade — ele melhora sem aumentar.'
                    : 'Grande demais para o motor. Escolha 2× em “Ajuste fino”.'}
                </p>
              )}
            </div>
          )}

          {/* Ajuste fino: o que foi decidido, numa linha — e a porta para
              mudar. Quem confia no automático nunca abre. */}
          <div className="spn-field">
            <SettingGroup>
              <SettingRow
                icon={<RowIcon name="scale" />}
                title="Ajuste fino"
                value={tuneSummary}
                controls="upscale-tune"
                onOpen={() => setTuneOpen(true)}
              />
            </SettingGroup>
            {/* Sem esta linha a folha diria "Impressão / prancha" marcado
                enquanto o que vale é o ajuste manual. */}
            {!objectiveInSync && (
              <p className="spn-hint">Ajustado à mão — vale o que está em “Ajuste fino”.</p>
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
      <section className="spn-tool-stage spn-glass">
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 320, padding: 24 }}>
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
              beforeUrl={imagePreview}
              afterUrl={resultUrl}
              aspect={imageDimensions ? imageDimensions.w / imageDimensions.h : 1.5}
              outputWidth={resultMeta?.width}
              outputHeight={resultMeta?.height}
              beforeLabel="Original"
              afterLabel={tab === 'resolution' ? 'Ampliado' : 'Aprimorado'}
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
                {` · ${activeMode.label}`}
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
                <a className="spn-ghost" style={ghostLink} href={`/app/spaces/new/upload?source=${encodeURIComponent(resultUrl)}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 9h18M9 21V9"/>
                  </svg>
                  Usar em novo projeto
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

      {/* Folha de ajuste fino: objetivo, aba, modo e escala. Tudo já vem
          decidido; quem abre isto está querendo algo específico. */}
      <Sheet id="upscale-tune" open={tuneOpen} title="Ajuste fino" onClose={() => setTuneOpen(false)}>
        <div className="spn-field">
          <span className="spn-field-label">Para que serve esta imagem</span>
          <ChoiceGroup
            label="Objetivo"
            cols={2}
            value={selectedObjective}
            onChange={(id) => applyObjective(id)}
            options={OBJECTIVES}
          />
          <p className="spn-hint">
            Cada objetivo define tratamento, modo e escala de uma vez, ajustados ao
            tamanho da sua imagem.
          </p>
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
        </div>

        <div className="spn-field">
          <span className="spn-field-label">{tab === 'resolution' ? 'Escala' : 'Tamanho final'}</span>
          {availableScales.length > 0 ? (
            <ChoiceGroup
              label="Escala"
              cols={2}
              value={selectedScale}
              onChange={applyScale}
              // A nota de cada cartão é a resolução REAL que ele entrega nesta
              // imagem; sem imagem ainda, é só o multiplicador. Uma escala que
              // estoura o teto do motor aparece desabilitada com o motivo, em
              // vez de falhar depois do upload.
              options={availableScales.map(s => {
                const over = scaleExceedsCap(s, dims)
                const p    = dims ? projectedDimensions(dims, s) : null
                return {
                  value: s,
                  title: SCALE_LABEL[s] ?? s,
                  note: over ? 'Grande demais' : p ? `${formatPx(p.width)}×${formatPx(p.height)}px` : '',
                  disabled: over,
                }
              })}
            />
          ) : (
            <p className="spn-hint" style={{ marginTop: 0 }}>
              Este modo entrega na resolução original — ele limpa, não amplia.
            </p>
          )}
        </div>

        <p className="spn-hint">
          Mexer aqui vale só para esta imagem.
        </p>
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
