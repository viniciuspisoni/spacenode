'use client'

import { useMemo, useRef, useState } from 'react'
import {
  ChoiceGroup,
  MultiPillGroup,
  RowIcon,
  Segmented,
  SettingGroup,
  SettingRow,
  Sheet,
  summarize,
  useAmbient,
} from '@/components/app/glass'
import { CostDock, DownloadIcon, formatFileSize, SourceDrop, StageLoading, ToolHeader } from '../_shell/ToolShell'
import {
  APRESENTAR_TOOLS,
  HUMANIZED_PLAN_LOOKS,
  HUMANIZED_PLAN_DEFAULT_LOOK,
  HUMANIZED_PLAN_STYLES,
  getHumanizedPlanLook,
  type HumanizedPlanLook,
  type HumanizedPlanStyle,
  type PlanRoom,
} from '@/lib/apresentar/config'
import { LABEL_FONT_FACES, labelTextStyle, layoutLabels } from '@/lib/apresentar/plan-labels'
import { downloadBlob, svgElementToPngBlob } from '@/lib/apresentar/svg-to-png'
import { useObjectUrls } from '@/lib/browser/object-url'

interface Props {
  initialCredits: number
}

const TOOL = APRESENTAR_TOOLS.humanized_plan

const LOADING_TEXTS = [
  'Lendo a planta…',
  'Identificando os ambientes…',
  'Preservando paredes e aberturas…',
  'Mobiliando cada ambiente…',
  'Aplicando texturas e sombras…',
  'Escrevendo os nomes…',
]

type SheetId = 'ajuste'

export default function PlantaHumanizadaClient({ initialCredits }: Props) {
  // Entrada
  const [imageFile,       setImageFile]       = useState<File | null>(null)
  const [imagePreview,    setImagePreview]    = useState<string | null>(null)
  // Governa as URLs de blob das prévias: revoga a que sai e varre o resto
  // ao desmontar (uma object URL segura o arquivo em memória até alguém soltar).
  const objectUrls = useObjectUrls()
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null)

  // A ÚNICA decisão da superfície. Tipo de projeto saiu de vez: quem lê isso na
  // planta é o leitor de visão do servidor, e ele acerta mais que o usuário
  // clicando num pill que ele não sabe pra que serve.
  const [look, setLook] = useState<HumanizedPlanLook>(HUMANIZED_PLAN_DEFAULT_LOOK)

  // Ajuste fino — quem quiser, acha; quem não quiser, nem vê.
  const [styleOverride, setStyleOverride] = useState<HumanizedPlanStyle | null>(null)
  const [showLabels,    setShowLabels]    = useState(true)
  const [additionalInstructions, setAdditionalInstructions] = useState('')

  const [sheet, setSheet] = useState<SheetId | null>(null)

  // Geração
  const [isLoading,   setIsLoading]   = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0])
  const [resultUrl,   setResultUrl]   = useState<string | null>(null)
  const [resultSize,  setResultSize]  = useState<{ w: number; h: number } | null>(null)
  const [rooms,       setRooms]       = useState<PlanRoom[]>([])
  const [credits,     setCredits]     = useState(initialCredits)
  const [error,       setError]       = useState<string | null>(null)
  const [isBaking,    setIsBaking]    = useState(false)

  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const nodeCost  = TOOL.nodes ?? 0
  const canSubmit = !!imageFile && credits >= nodeCost && !isLoading

  // O papel de parede é o trabalho em foco: a planta que saiu, ou a que entrou.
  useAmbient(resultUrl ?? imagePreview)

  const lookSpec    = getHumanizedPlanLook(look)!
  const effectiveStyle = styleOverride ?? lookSpec.style
  const styleLabel  = HUMANIZED_PLAN_STYLES.find(s => s.id === effectiveStyle)?.label ?? ''

  // Rótulos compostos por nós, em vetor, nas posições que o servidor devolveu.
  // Ligar e desligar não gera de novo: é só deixar de desenhar.
  const labels = useMemo(
    () => (showLabels && resultSize ? layoutLabels(rooms, resultSize.w, resultSize.h) : []),
    [rooms, showLabels, resultSize],
  )

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('O arquivo deve ser uma imagem.'); return }
    if (file.size > 20 * 1024 * 1024)    { setError('Imagem muito grande. Máximo 20 MB.'); return }

    setImageFile(file)
    setResultUrl(null)
    setResultSize(null)
    setRooms([])
    setError(null)
    setImageDimensions(null)

    // Object URL, não data URL: a mesma foto vira um ponteiro de 60
    // caracteres em vez de ~27 MB de base64 no DOM — e o papel de parede
    // (useAmbient) deixa de decodificar o arquivo uma segunda vez só para
    // borrá-lo. Ver lib/browser/object-url.ts.
    objectUrls.revoke(imagePreview)
    const url = objectUrls.create(file)
    setImagePreview(url)
    const img = new Image()
    img.onload = () => setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
  }

  function resetImage() {
    objectUrls.revoke(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    setResultUrl(null)
    setResultSize(null)
    setRooms([])
    setImageDimensions(null)
  }

  function startLoadingTexts() {
    let i = 0
    setLoadingText(LOADING_TEXTS[0])
    loadingTimerRef.current = setInterval(() => {
      i = (i + 1) % LOADING_TEXTS.length
      setLoadingText(LOADING_TEXTS[i])
    }, 1800)
  }

  function stopLoadingTexts() {
    if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
  }

  async function handleSubmit() {
    if (!canSubmit || !imageFile) return
    setIsLoading(true)
    setError(null)
    setResultUrl(null)
    setResultSize(null)
    setRooms([])
    startLoadingTexts()

    const formData = new FormData()
    formData.append('image', imageFile)

    // Sem ajuste fino, o acabamento viaja sozinho e o servidor abre o pacote.
    // Com ajuste, mandamos os campos soltos — é o MESMO contrato que o plugin
    // do SketchUp usa, então não existe caminho novo pra dar manutenção.
    const hasOverride = styleOverride !== null || !showLabels
    if (!hasOverride) {
      formData.append('look', look)
    } else {
      formData.append('style',   effectiveStyle)
      formData.append('level',   lookSpec.level)
      formData.append('options', JSON.stringify({ ...lookSpec.options, addRoomLabels: showLabels }))
    }
    if (additionalInstructions.trim()) {
      formData.append('additionalInstructions', additionalInstructions.trim())
    }

    try {
      const res  = await fetch('/api/apresentar/humanized-plan', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Erro desconhecido')
        return
      }
      setResultUrl(data.url)
      setRooms(Array.isArray(data.rooms) ? data.rooms : [])
      if (typeof data.creditsRemaining === 'number') {
        setCredits(data.creditsRemaining)
      } else {
        setCredits((c) => c - nodeCost)
      }
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      stopLoadingTexts()
      setIsLoading(false)
    }
  }

  // Com rótulo, o arquivo é assado aqui (imagem + texto vetorial viram um PNG
  // só) — mesmo caminho do Moodboard. Sem rótulo, o proxy basta e evita passar
  // a imagem inteira pelo canvas.
  async function handleDownload() {
    if (!resultUrl) return
    if (labels.length === 0 || !svgRef.current || !resultSize) {
      window.location.href =
        `/api/download?url=${encodeURIComponent(resultUrl)}&filename=spacenode-planta-humanizada.jpg`
      return
    }
    setIsBaking(true)
    try {
      // A Geist vai EMBUTIDA: o SVG rasterizado é documento isolado e não
      // enxerga as fontes da página (ver svg-to-png).
      const blob = await svgElementToPngBlob(svgRef.current, resultSize.w, resultSize.h, 1, LABEL_FONT_FACES)
      downloadBlob(blob, 'spacenode-planta-humanizada.png')
    } catch {
      setError('Não foi possível montar o arquivo. Tente baixar novamente.')
    } finally {
      setIsBaking(false)
    }
  }

  return (
    <div className="spn-tool">
      {/* ── Painel ─────────────────────────────────────────────────────────── */}
      <div className="spn-tool-panel spn-glass spn-glass--chrome">
        <ToolHeader
          title={TOOL.name}
          desc="Mobiliário, vegetação e texturas sobre a sua planta técnica — paredes, aberturas e proporções ficam como estão."
        />

        <div className="spn-tool-panel-body">
          {/* A planta é o trabalho: fica na superfície, e sem ela o CTA não liga. */}
          <div className="spn-field">
            <span className="spn-field-label">Planta baixa</span>
            <SourceDrop
              preview={imagePreview}
              label="Arraste sua planta ou clique para enviar"
              note="PNG, JPG, WEBP — até 20 MB"
              meta={[
                imageDimensions ? `${imageDimensions.w}×${imageDimensions.h}px` : '',
                imageFile ? formatFileSize(imageFile.size) : '',
              ].filter(Boolean).join(' · ')}
              onFile={loadImageFile}
              onClear={resetImage}
            />
          </div>

          {/* A única decisão. Cada acabamento é um pacote fechado de nível,
              estilo e elementos — ver HUMANIZED_PLAN_LOOKS. */}
          <div className="spn-field">
            <span className="spn-field-label">Acabamento</span>
            <Segmented
              label="Acabamento"
              value={look}
              onChange={(v) => { setLook(v); setStyleOverride(null) }}
              items={HUMANIZED_PLAN_LOOKS.map(l => ({ value: l.id, label: l.label }))}
            />
            <p className="spn-hint">{lookSpec.desc}</p>
          </div>

          <SettingGroup>
            <SettingRow
              icon={<RowIcon name="direction" />}
              title="Ajuste fino"
              value={summarize([
                styleOverride ? styleLabel : '',
                showLabels ? '' : 'sem nomes',
                additionalInstructions.trim(),
              ])}
              onOpen={() => setSheet('ajuste')}
            />
          </SettingGroup>

          <p className="spn-hint" style={{ marginTop: 14 }}>
            A IA lê a planta antes de desenhar: os ambientes são reconhecidos um a um,
            e paredes, aberturas e proporções são preservadas.
          </p>

          {error ? <div className="spn-error" style={{ marginTop: 14 }}>{error}</div> : null}
        </div>

        <CostDock cost={nodeCost} balance={credits}>
          <button type="button" className="spn-cta" onClick={handleSubmit} disabled={!canSubmit}>
            {isLoading ? 'Gerando…' : credits < nodeCost ? 'Saldo insuficiente' : TOOL.ctaLabel}
          </button>
        </CostDock>
      </div>

      {/* ── Palco ──────────────────────────────────────────────────────────── */}
      <div className="spn-tool-stage spn-glass">
        {isLoading ? <StageLoading label={loadingText} /> : null}

        {!isLoading && resultUrl ? (
          <div style={{
            alignSelf: 'stretch', flex: 1, minHeight: 0, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 20,
          }}>
            {/* A imagem do modelo e os rótulos vivem no MESMO SVG: é o que o
                usuário vê e é exatamente o que o download assa. */}
            {resultSize ? (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${resultSize.w} ${resultSize.h}`}
                xmlns="http://www.w3.org/2000/svg"
                style={{ maxWidth: '100%', height: 'auto', borderRadius: 'var(--r-inner)', display: 'block' }}
              >
                <image href={resultUrl} x={0} y={0} width={resultSize.w} height={resultSize.h} />
                {labels.map((l, i) => (
                  <text
                    key={`${l.name}-${i}`}
                    x={l.x}
                    y={l.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={labelTextStyle(l.fontSize)}
                  >
                    {l.lines.map((line, j) => (
                      <tspan
                        key={line}
                        x={l.x}
                        dy={j === 0 ? -((l.lines.length - 1) * l.lineHeight) / 2 : l.lineHeight}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                ))}
              </svg>
            ) : null}

            {/* Fora do SVG e escondida: só serve pra descobrir as dimensões
                naturais da saída, que é o sistema de coordenadas dos rótulos. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resultUrl}
              alt="Planta humanizada"
              onLoad={(e) => {
                const el = e.currentTarget
                setResultSize({ w: el.naturalWidth, h: el.naturalHeight })
              }}
              style={resultSize ? { display: 'none' } : { maxWidth: '100%', borderRadius: 'var(--r-inner)', display: 'block' }}
            />

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap', width: '100%', maxWidth: 860,
            }}>
              <span className="spn-hint" style={{ marginTop: 0 }}>
                {[
                  'Planta humanizada',
                  lookSpec.label,
                  labels.length ? `${labels.length} ambientes nomeados` : '',
                ].filter(Boolean).join(' · ')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {rooms.length > 0 ? (
                  <button
                    type="button"
                    className="spn-ghost"
                    onClick={() => setShowLabels(v => !v)}
                  >
                    {showLabels ? 'Ocultar nomes' : 'Mostrar nomes'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="spn-ghost"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
                  onClick={handleDownload}
                  disabled={isBaking}
                >
                  <DownloadIcon />
                  {isBaking ? 'Montando…' : 'Baixar'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!isLoading && !resultUrl ? (
          <div className="spn-empty" style={{ maxWidth: 360 }}>
            Sua planta humanizada aparece aqui.
            <br />
            Envie a planta técnica e escolha o acabamento.
          </div>
        ) : null}
      </div>

      {/* ── Folha ──────────────────────────────────────────────────────────── */}
      <Sheet open={sheet === 'ajuste'} title="Ajuste fino" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Estilo visual</span>
          <ChoiceGroup
            label="Estilo visual"
            cols={2}
            value={effectiveStyle}
            onChange={(v) => setStyleOverride(v === lookSpec.style ? null : v)}
            options={HUMANIZED_PLAN_STYLES.map(s => ({ value: s.id, title: s.label, note: s.desc }))}
          />
          <p className="spn-hint">
            O acabamento {lookSpec.label} já escolhe {HUMANIZED_PLAN_STYLES.find(s => s.id === lookSpec.style)?.label}.
            Troque só se quiser outra linguagem.
          </p>
        </div>

        <div className="spn-field">
          <span className="spn-field-label">Nomes dos ambientes</span>
          <MultiPillGroup
            label="Nomes dos ambientes"
            options={['Mostrar nomes']}
            values={showLabels ? ['Mostrar nomes'] : []}
            onChange={(v) => setShowLabels(v.includes('Mostrar nomes'))}
          />
          <p className="spn-hint">
            Os nomes são escritos pela SpaceNode, não pela IA — por isso saem sempre
            legíveis e na grafia certa. Se a planta já tiver os nomes impressos, nada é sobreposto.
          </p>
        </div>

        <div className="spn-field">
          <span className="spn-field-label">Instruções adicionais</span>
          <textarea
            className="spn-textarea"
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value.slice(0, 400))}
            placeholder="Ex.: mobiliário contemporâneo, sem vegetação, destacar áreas molhadas…"
          />
          <p className="spn-hint">{additionalInstructions.length}/400 — em branco, o acabamento decide sozinho.</p>
        </div>
      </Sheet>
    </div>
  )
}
