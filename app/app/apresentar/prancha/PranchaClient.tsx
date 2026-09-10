'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import {
  ChoiceGroup,
  RowIcon,
  SettingGroup,
  SettingRow,
  Sheet,
  summarize,
  useAmbient,
} from '@/components/app/glass'
import { CostDock, DownloadIcon, StageLoading, ToolHeader } from '../_shell/ToolShell'
import Slide, { SLIDE_WIDTH, SLIDE_HEIGHT } from './Slide'
import RenderPicker, { type PickedItem } from './RenderPicker'
import {
  APRESENTAR_TOOLS,
  CAROUSEL_STYLES,
  type CarouselStyle,
  type CarouselGeneratedCopy,
  type CarouselSlide,
} from '@/lib/apresentar/config'
import { svgElementToPngBlob, downloadBlob } from '@/lib/apresentar/svg-to-png'

interface Props {
  initialCredits: number
  studioName:     string | null
}

const TOOL = APRESENTAR_TOOLS.presentation_board

const MIN_IMAGES = 3
const MAX_IMAGES = 8

const LOADING_TEXTS = [
  'Lendo seu projeto…',
  'Escrevendo título…',
  'Compondo legendas…',
  'Ajustando tom de voz…',
  'Finalizando carrossel…',
]

type SheetId = 'projeto' | 'estilo'

// ── Helper: monta os slides a partir das imagens + copy ──────────────────────

function buildSlides(images: PickedItem[], copy: CarouselGeneratedCopy): CarouselSlide[] {
  const out: CarouselSlide[] = []
  out.push({
    role:     'cover',
    imageUrl: images[0]?.imageUrl,
    title:    copy.coverTitle,
    caption:  copy.coverSubtitle,
  })
  images.forEach((img, i) => {
    out.push({
      role:     'image',
      imageUrl: img.imageUrl,
      title:    img.label,
      caption:  copy.captions[i] ?? '',
    })
  })
  out.push({
    role:    'closing',
    title:   copy.closingTitle,
    caption: copy.closingBody,
  })
  return out
}

// ── PranchaClient ────────────────────────────────────────────────────────────

export default function PranchaClient({ initialCredits, studioName: initialStudio }: Props) {
  // Entrada
  const [showPicker,  setShowPicker]  = useState(false)
  const [images,      setImages]      = useState<PickedItem[]>([])
  const [projectName, setProjectName] = useState('')
  const [projectType, setProjectType] = useState('')
  const [location,    setLocation]    = useState('')
  const [style,       setStyle]       = useState<CarouselStyle>('editorial')

  const [sheet, setSheet] = useState<SheetId | null>(null)

  // Geração
  const [isLoading,   setIsLoading]   = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0])
  const [error,       setError]       = useState<string | null>(null)
  const [copy,        setCopy]        = useState<CarouselGeneratedCopy | null>(null)
  const [studioName,  setStudioName]  = useState<string | null>(initialStudio)
  const [credits,     setCredits]     = useState(initialCredits)

  // Export
  const [isExporting,    setIsExporting]    = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const slidesContainerRef = useRef<HTMLDivElement | null>(null)
  const loadingTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  const nodeCost = TOOL.nodes ?? 0
  const canSubmit = images.length >= MIN_IMAGES
    && images.length <= MAX_IMAGES
    && projectName.trim().length >= 2
    && credits >= nodeCost
    && !isLoading

  // O papel de parede é o trabalho em foco: a primeira imagem do carrossel.
  useAmbient(images[0]?.imageUrl ?? null)

  const styleLabel = CAROUSEL_STYLES.find(s => s.id === style)?.label ?? ''

  // Slides montados (recalcula só quando dependências mudam)
  const slides = useMemo<CarouselSlide[]>(() => {
    if (!copy || images.length === 0) return []
    return buildSlides(images, copy)
  }, [copy, images])

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

  async function handleGenerate() {
    if (!canSubmit) return
    setIsLoading(true)
    setError(null)
    setCopy(null)
    startLoadingTexts()

    try {
      const res = await fetch('/api/apresentar/board', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: projectName.trim(),
          projectType: projectType.trim() || undefined,
          location:    location.trim()    || undefined,
          style,
          format:      'instagram_carousel',
          slides: images.map(i => ({
            imageUrl: i.imageUrl,
            label:    i.label,
            context:  i.context,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Erro ao gerar carrossel')
        return
      }
      setCopy(data.copy)
      if (data.studioName && !studioName) setStudioName(data.studioName)
      if (typeof data.creditsRemaining === 'number') setCredits(data.creditsRemaining)
      else setCredits((c) => c - nodeCost)
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      stopLoadingTexts()
      setIsLoading(false)
    }
  }

  async function handleDownloadAll() {
    if (!slidesContainerRef.current) return
    const svgs = Array.from(slidesContainerRef.current.querySelectorAll('svg'))
    if (svgs.length === 0) return

    setIsExporting(true)
    setExportProgress(0)
    setError(null)

    try {
      const safeName = projectName.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'carrossel'

      for (let i = 0; i < svgs.length; i++) {
        const blob = await svgElementToPngBlob(svgs[i] as SVGSVGElement, SLIDE_WIDTH, SLIDE_HEIGHT)
        downloadBlob(blob, `${safeName}-${String(i + 1).padStart(2, '0')}.png`)
        setExportProgress(Math.round(((i + 1) / svgs.length) * 100))
      }
    } catch (e) {
      setError(`Erro ao exportar: ${(e as Error).message}`)
    } finally {
      setIsExporting(false)
      setTimeout(() => setExportProgress(0), 1500)
    }
  }

  return (
    <div className="spn-tool">
      {/* ── Painel ─────────────────────────────────────────────────────────── */}
      <div className="spn-tool-panel spn-glass spn-glass--chrome">
        <ToolHeader
          title={TOOL.name}
          badge="beta"
          desc="Escolha as imagens do seu histórico — a IA escreve título, legendas e fechamento."
        />

        <div className="spn-tool-panel-body">
          {/* Imagens e nome são obrigatórios pro CTA ligar: ficam na
              superfície, nunca dentro de uma folha. */}
          <div className="spn-field">
            <span className="spn-field-label">Imagens · {images.length} de {MAX_IMAGES}</span>
            {images.length === 0 ? (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                style={{
                  width: '100%', padding: '22px 16px',
                  borderRadius: 'var(--r-inner)',
                  border: '1px dashed var(--glass-line-strong)',
                  background: 'var(--color-chip)',
                  cursor: 'pointer', font: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
                  color: 'var(--color-text-secondary)',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <span style={{ fontSize: 12 }}>Selecionar do histórico</span>
                <span className="spn-hint" style={{ marginTop: 0 }}>De {MIN_IMAGES} a {MAX_IMAGES} imagens</span>
              </button>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {images.map((img, i) => (
                    <div key={img.id} style={{
                      position: 'relative', aspectRatio: '1 / 1',
                      borderRadius: 8, overflow: 'hidden',
                      background: 'var(--color-preview-bg)',
                      border: '0.5px solid var(--glass-line)',
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.imageUrl} alt={img.label}
                           style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <span style={{
                        position: 'absolute', top: 4, left: 4,
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'var(--color-scrim-strong)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700,
                      }}>{i + 1}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className="spn-ghost"
                        style={{ width: '100%', marginTop: 9 }}
                        onClick={() => setShowPicker(true)}>
                  Editar seleção
                </button>
              </>
            )}
          </div>

          <div className="spn-field">
            <span className="spn-field-label">Nome do projeto</span>
            <input
              className="spn-input"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Ex.: Cobertura Itaim"
            />
          </div>

          <SettingGroup>
            <SettingRow icon={<RowIcon name="scene" />} title="Projeto"
                        value={summarize([projectType.trim(), location.trim()])}
                        onOpen={() => setSheet('projeto')} />
            <SettingRow icon={<RowIcon name="materials" />} title="Estilo"
                        value={summarize([styleLabel])}
                        onOpen={() => setSheet('estilo')} />
          </SettingGroup>

          {error ? <div className="spn-error" style={{ marginTop: 14 }}>{error}</div> : null}
        </div>

        <CostDock cost={nodeCost} balance={credits}>
          {copy ? (
            /* A copy já saiu: o botão devolve a tela ao estado de montagem —
               a cobrança só volta a acontecer no "Montar carrossel". */
            <button type="button" className="spn-cta" onClick={() => setCopy(null)}>
              Refazer a copy
            </button>
          ) : (
            <button type="button" className="spn-cta" onClick={handleGenerate} disabled={!canSubmit}>
              {isLoading ? 'Escrevendo…' : credits < nodeCost ? 'Saldo insuficiente' : TOOL.ctaLabel}
            </button>
          )}
        </CostDock>
      </div>

      {/* ── Palco ──────────────────────────────────────────────────────────── */}
      <div className="spn-tool-stage spn-glass">
        {isLoading ? <StageLoading label={loadingText} /> : null}

        {!isLoading && slides.length === 0 ? (
          <div className="spn-empty" style={{ maxWidth: 380 }}>
            Seu carrossel aparece aqui.
            <br />
            Escolha as imagens e dê o nome do projeto.
          </div>
        ) : null}

        {!isLoading && slides.length > 0 ? (
          <div style={{ alignSelf: 'stretch', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{
              flex: '0 0 auto', padding: '14px 18px',
              borderBottom: '0.5px solid var(--glass-line)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--color-text-primary)' }}>
                  {copy?.coverTitle}
                </div>
                <span className="spn-hint" style={{ marginTop: 2, display: 'block' }}>
                  {slides.length} slides · Instagram 4:5 · {styleLabel}
                </span>
              </div>
              <button type="button" className="spn-ghost" onClick={handleDownloadAll} disabled={isExporting}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flex: '0 0 auto' }}>
                <DownloadIcon />
                {isExporting ? `Exportando ${exportProgress}%` : 'Baixar todos em PNG'}
              </button>
            </div>

            <div ref={slidesContainerRef} style={{
              flex: 1, minHeight: 0, overflowY: 'auto', padding: 18,
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16, alignContent: 'start',
            }}>
              {slides.map((slide, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {/* Sem vidro em volta do slide: ele é serializado para PNG e
                      backdrop-filter não sobreviveria à serialização do SVG. */}
                  <div style={{
                    aspectRatio: `${SLIDE_WIDTH} / ${SLIDE_HEIGHT}`,
                    background: 'var(--color-preview-bg)',
                    borderRadius: 'var(--r-inner)', overflow: 'hidden',
                    border: '0.5px solid var(--glass-line)',
                  }}>
                    <Slide
                      role={slide.role}
                      style={style}
                      imageUrl={slide.imageUrl}
                      title={slide.title}
                      subtitle={slide.role === 'cover' ? slide.caption : undefined}
                      caption={slide.role === 'image' ? slide.caption : undefined}
                      body={slide.role === 'closing' ? slide.caption : undefined}
                      studioName={studioName ?? undefined}
                      slideNumber={i + 1}
                      totalSlides={slides.length}
                    />
                  </div>
                  <span className="spn-hint" style={{ marginTop: 0, textAlign: 'center' }}>
                    {String(i + 1).padStart(2, '0')} · {slide.role === 'cover' ? 'capa' : slide.role === 'closing' ? 'fechamento' : 'imagem'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Folhas ─────────────────────────────────────────────────────────── */}
      <Sheet open={sheet === 'projeto'} title="Projeto" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Tipo</span>
          <input
            className="spn-input"
            type="text"
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
            placeholder="Apartamento, casa, comercial…"
          />
        </div>
        <div className="spn-field">
          <span className="spn-field-label">Localização</span>
          <input
            className="spn-input"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="São Paulo, SP"
          />
          <p className="spn-hint">Os dois entram no texto que a IA escreve. Em branco, ela não inventa.</p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'estilo'} title="Estilo" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Estilo do carrossel</span>
          <ChoiceGroup
            label="Estilo do carrossel"
            cols={2}
            value={style}
            onChange={setStyle}
            options={CAROUSEL_STYLES.map(s => ({ value: s.id, title: s.label, note: s.desc }))}
          />
          <p className="spn-hint">
            {studioName
              ? `${studioName} assina a capa e o rodapé dos slides.`
              : (
                <>
                  Os slides saem sem assinatura até você configurar a{' '}
                  <Link href="/app/settings/identity" style={{ color: 'var(--color-text-secondary)' }}>
                    identidade do estúdio
                  </Link>.
                </>
              )}
          </p>
        </div>
      </Sheet>

      {/* ── Seletor de imagens ─────────────────────────────────────────────── */}
      {showPicker ? (
        <RenderPicker
          minSelection={MIN_IMAGES}
          maxSelection={MAX_IMAGES}
          initialSelection={images}
          onClose={() => setShowPicker(false)}
          onConfirm={(items) => {
            setImages(items)
            setShowPicker(false)
            setCopy(null) // invalida copy quando imagens mudam
          }}
        />
      ) : null}
    </div>
  )
}
