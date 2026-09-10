'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import BeforeAfter from '@/components/app/BeforeAfter'
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
  analyzeFile,
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
  { id: 'recover',  label: 'Recuperar Imagem Baixa', note: 'Reconstrói o que a compressão comeu' },
]

const ENHANCE_MODES: ModeDef[] = [
  { id: 'denoise', label: 'Limpar Ruído',         note: 'Tira granulação' },
  { id: 'deblur',  label: 'Corrigir Desfoque',    note: 'Devolve nitidez' },
  { id: 'restore', label: 'Restaurar Imagem',     note: 'Corrige degradação' },
  { id: 'smart',   label: 'Melhoria Inteligente', note: 'Refino discreto' },
]

interface ScaleDef {
  value: Scale
  label: string
  sub:   string
}

// 'ultra' saiu. Era um cartão permanentemente desabilitado, com cadeado e
// title="Em breve", na fileira mais importante da tela: um controle que nunca
// habilita não é um controle. Quando o pipeline de tiles existir, ele volta.
const RESOLUTION_SCALES: ScaleDef[] = [
  { value: '2x', label: '2×', sub: '~4K'     },
  { value: '4x', label: '4×', sub: '~8K'     },
  { value: '8x', label: '8×', sub: 'até 16K' },
]

// Smart usa 2x/4x; denoise/deblur/restore ficam em 'none'.
const SMART_SCALES: ScaleDef[] = [
  { value: '2x', label: '2×', sub: 'discreto' },
  { value: '4x', label: '4×', sub: 'forte'    },
]

// O objetivo é o único campo desta tela escrito na língua do arquiteto — e é
// ele que preenche aba, modo e escala de uma vez (OBJECTIVE_PRESETS). Por isso
// virou a superfície, em cartão: título é o trabalho, nota é o que ele resolve.
// Aba/modo/escala são o EFEITO dele e foram para a folha.
const OBJECTIVES: { value: ObjectiveId; title: string; note: string }[] = [
  { value: 'client',    title: 'Apresentação para cliente', note: 'Nítida na tela e no PDF'     },
  { value: 'portfolio', title: 'Portfólio / Instagram',     note: 'Aguenta o zoom do feed'      },
  { value: 'print',     title: 'Impressão / prancha',       note: 'Densidade para papel'        },
  { value: 'recover',   title: 'Recuperar imagem baixa',    note: 'Imagem antiga ou comprimida' },
  { value: 'final',     title: 'Entrega final premium',     note: 'Máximo acabamento'           },
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

// Toda família tem de funcionar sem ninguém tocar nela: a tela abre com um
// objetivo já escolhido, e ele é quem define aba/modo/escala iniciais.
const DEFAULT_OBJECTIVE: ObjectiveId = 'client'

export default function UpscaleClient({ initialCredits, sourceUrl }: UpscaleClientProps) {
  // Image state
  const [imageFile,       setImageFile]       = useState<File | null>(null)
  const [imagePreview,    setImagePreview]    = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null)
  const [isDragging,      setIsDragging]      = useState(false)

  // Objetivo (superfície) + os três efeitos dele (folha de ajuste fino).
  const [selectedObjective, setSelectedObjective] = useState<ObjectiveId>(DEFAULT_OBJECTIVE)
  const [tab,            setTab]            = useState<UpscaleTab>(OBJECTIVE_PRESETS[DEFAULT_OBJECTIVE].tab)
  const [selectedModeId, setSelectedModeId] = useState<ModeId>(OBJECTIVE_PRESETS[DEFAULT_OBJECTIVE].modeId)
  const [selectedScale,  setSelectedScale]  = useState<Scale>(OBJECTIVE_PRESETS[DEFAULT_OBJECTIVE].scale)
  const [tuneOpen,       setTuneOpen]       = useState(false)

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
  // true quando o provider primário do modo falhou e o resultado veio do
  // fallback generativo (ex.: Alta Fidelidade Topaz → Clarity). O aviso na
  // UI é o que impede o fallback de ser silencioso.
  const [usedFallback, setUsedFallback] = useState(false)
  // Dimensões REAIS medidas pelo servidor no output (o provider pode clampar
  // o fator — ex.: Topaz vai só até 4×); null = verificação indisponível.
  const [resultDims,   setResultDims]   = useState<{ w: number; h: number } | null>(null)
  const [credits,     setCredits]     = useState(initialCredits)
  const [error,       setError]       = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyzeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // O papel de parede passa a ser a imagem em jogo — o resultado assim que ele
  // sai, o original enquanto não há resultado. É o que faz o painel assumir a
  // paleta do projeto, como no plugin.
  useAmbient(resultUrl ?? imagePreview)

  // ── Derivações ─────────────────────────────────────────────────────────────

  const modes = tab === 'resolution' ? RESOLUTION_MODES : ENHANCE_MODES
  const activeMode = useMemo(
    () => modes.find(m => m.id === selectedModeId) ?? modes[0],
    [modes, selectedModeId],
  )

  // Aba Aprimorar: escolha de escala depende do modo.
  //   - denoise / deblur / restore → fixo em 'none' (sem aumento; sem controle)
  //   - smart                     → escolha entre 2× e 4×
  // Aba Resolução: sempre o conjunto completo (2/4/8).
  const availableScales: ScaleDef[] = useMemo(() => {
    if (tab === 'resolution') return RESOLUTION_SCALES
    if (selectedModeId === 'smart') return SMART_SCALES
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

  const nodeCost  = costBreakdown.total
  const canSubmit = !!imageFile && credits >= nodeCost && !isLoading

  const scaleLabel = selectedScale === 'none'
    ? ''
    : availableScales.find(s => s.value === selectedScale)?.label ?? selectedScale
  // Regra do resumo: entra o que o usuário ESCOLHEU. "Sem aumento" é o default
  // silencioso dos modos de Aprimorar — some, e a linha fica só com o modo.
  const tuneSummary = summarize([activeMode.label, scaleLabel])

  // O objetivo é a ETIQUETA de um preset de aba+modo+escala. Quem mexe no
  // ajuste fino desfaz esse vínculo — e antes disso o HEAD zerava o objetivo
  // (`setSelectedObjective(null)` em applyTab/applyObjective), de modo que
  // `objectiveId` nunca viajava contradizendo o que foi de fato pedido. Aqui o
  // objetivo continua na tela (é o eixo da superfície), então o que sai do
  // payload é a etiqueta: `upscale_meta.objective_id` (app/api/upscale/route.ts)
  // é o único sinal de POR QUE o usuário ampliou; gravar "Impressão" numa
  // ampliação 2×/Recuperar envenena esse dado.
  const objectivePreset = OBJECTIVE_PRESETS[selectedObjective]
  const objectiveInSync =
    objectivePreset.tab === tab &&
    objectivePreset.modeId === selectedModeId &&
    objectivePreset.scale === selectedScale

  // ── Handlers ───────────────────────────────────────────────────────────────

  function applyTab(next: UpscaleTab) {
    if (next === tab) return
    setTab(next)
    const nextMode  = defaultModeForTab(next)
    const nextScale = defaultScaleForMode(next, nextMode)
    setSelectedModeId(nextMode)
    setSelectedScale(nextScale)
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
    setSelectedObjective(id)
    setTab(preset.tab)
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
      // A análise agora fala a mesma língua da tela: move o OBJETIVO, não três
      // controles soltos. E só age quando discorda de verdade — imagem
      // comprimida pede Recuperar; nos demais casos o objetivo já resolveu.
      if (rec.modeId === 'recover') applyObjective('recover')
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
    setRecommended(null)
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
      a.download = `spacenode-ampliado.${blob.type.split('/')[1] || 'jpg'}`
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
    startLoadingTexts()

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
      if (!res.ok) { setError(errMsg(data, 'Erro desconhecido')); return }
      setResultUrl(data?.url as string)
      setUsedFallback(Boolean(data?.fallbackUsed))
      setResultDims(
        typeof data?.outputWidth === 'number' && typeof data?.outputHeight === 'number'
          ? { w: data.outputWidth, h: data.outputHeight }
          : null,
      )
      setCredits(c => c - nodeCost)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha de conexão. Tente novamente.')
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
        <div className="spn-tool-panel-body">
          <h1 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
            Ampliar
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4, marginBottom: 18, lineHeight: 1.5 }}>
            Diga para que serve a imagem — o resto vem decidido.
          </p>

          {/* Imagem: campo obrigatório, fica na superfície. */}
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
                  {imageDimensions ? `${imageDimensions.w}×${imageDimensions.h}px · ` : ''}
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

            {/* A análise do arquivo virou uma dica: ela sugere, o objetivo
                decide. A faixa verde saiu — verde é estado, não recomendação. */}
            {isAnalyzing ? (
              <p className="spn-hint">Analisando a imagem…</p>
            ) : recommended ? (
              <p className="spn-hint">{recommended.reason}</p>
            ) : null}
          </div>

          {/* Objetivo: o eixo da tela. */}
          <div className="spn-field">
            <span className="spn-field-label">Para que serve esta imagem</span>
            <ChoiceGroup
              label="Objetivo"
              cols={2}
              value={selectedObjective}
              onChange={applyObjective}
              options={OBJECTIVES}
            />
            {/* O cartão continua marcado depois de um ajuste manual — sem esta
                linha a superfície diria "Impressão / prancha" enquanto o que
                vale é o que está na folha. */}
            {!objectiveInSync && (
              <p className="spn-hint">Ajustado à mão — vale o que está em “Ajuste fino”.</p>
            )}
          </div>

          {/* Ajuste fino: os três efeitos do objetivo, numa linha só. */}
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
          </div>

          {error && <div className="spn-error">{error}</div>}
        </div>

        {/* Dock: o CTA nunca some no scroll. */}
        <div className="spn-dock spn-glass spn-glass--chrome">
          <div className="spn-cost">
            <div className="spn-cost-figures">
              <div className="spn-cost-main">{nodeCost} nodes</div>
              <div className="spn-cost-sub" style={credits < nodeCost ? { color: 'var(--color-error)' } : undefined}>
                Saldo: {credits} nodes
              </div>
            </div>
            <button type="button" className="spn-cta" onClick={handleSubmit} disabled={!canSubmit}>
              {isLoading
                ? loadingText
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--glass-line-strong)', borderTop: '2px solid var(--color-text-secondary)', animation: 'spin 0.9s linear infinite' }} />
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>{loadingText}</div>
          </div>
        )}

        {!isLoading && resultUrl && imagePreview && (
          <div style={{ width: '100%', maxWidth: 760, maxHeight: '100%', overflowY: 'auto', padding: 20, animation: 'fadeIn 0.3s ease' }}>
            {usedFallback && (
              <div className="spn-error" style={{ marginBottom: 12 }}>
                O motor de alta fidelidade não respondeu e usamos o motor alternativo
                nesta ampliação. Confira detalhes finos (esquadrias, textos, linhas) —
                se notar diferenças, tente novamente em alguns minutos.
              </div>
            )}
            <BeforeAfter beforeUrl={imagePreview} afterUrl={resultUrl} beforeLabel="ORIGINAL" afterLabel={tab === 'resolution' ? 'AMPLIADO' : 'APRIMORADO'} />
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span className="spn-hint" style={{ marginTop: 0 }}>
                Arraste para comparar · {selectedScale === 'none' ? 'sem aumento' : `${factorOut}×`} · {activeMode.label}
                {/* Dimensões REAIS do output quando o servidor mediu; a estimativa
                    (origem × fator) só como fallback — o provider pode clampar. */}
                {resultDims
                  ? <span> · {resultDims.w}×{resultDims.h}px</span>
                  : imageDimensions && factorOut > 1 && <span> · {imageDimensions.w * factorOut}×{imageDimensions.h * factorOut}px</span>}
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
                Envie uma imagem para comparar antes/depois em alta resolução.
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Folha de ajuste fino: aba, modo e escala. Quem confia no objetivo
          nunca abre isto. */}
      <Sheet id="upscale-tune" open={tuneOpen} title="Ajuste fino" onClose={() => setTuneOpen(false)}>
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
              cols={availableScales.length === 2 ? 2 : 3}
              value={selectedScale}
              onChange={setSelectedScale}
              options={availableScales.map(s => ({ value: s.value, title: s.label, note: s.sub }))}
            />
          ) : (
            <p className="spn-hint" style={{ marginTop: 0 }}>
              Este modo entrega na resolução original — ele limpa, não amplia.
            </p>
          )}
        </div>

        <p className="spn-hint">
          Os três já vêm resolvidos pelo objetivo. Mexer aqui vale só para esta imagem.
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
