'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
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
  // ── Setup state ───────────────────────────────────────────────────────────
  const [showPicker, setShowPicker]   = useState(false)
  const [images,     setImages]       = useState<PickedItem[]>([])
  const [projectName, setProjectName] = useState('')
  const [projectType, setProjectType] = useState('')
  const [location,    setLocation]    = useState('')
  const [style,       setStyle]       = useState<CarouselStyle>('editorial')

  // ── Generation state ──────────────────────────────────────────────────────
  const [isLoading,   setIsLoading]   = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0])
  const [error,       setError]       = useState<string | null>(null)
  const [copy,        setCopy]        = useState<CarouselGeneratedCopy | null>(null)
  const [studioName,  setStudioName]  = useState<string | null>(initialStudio)
  const [credits,     setCredits]     = useState(initialCredits)

  // ── Export state ──────────────────────────────────────────────────────────
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

  function handleEdit() {
    setCopy(null)
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div style={{
        width: 420, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '0.5px solid var(--color-border)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 16px', borderBottom: '0.5px solid var(--color-border)', flexShrink: 0 }}>
          <Breadcrumb />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>{TOOL.name}</div>
            <Pill tone="green">beta</Pill>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.5 }}>
            {TOOL.longDesc}
          </div>
        </div>

        {/* Scrollable form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Step 1: Image selection */}
          <Section label={`1. Imagens (${images.length} / ${MAX_IMAGES})`}>
            {images.length === 0 ? (
              <button onClick={() => setShowPicker(true)}
                style={{
                  width: '100%', padding: '20px 16px',
                  background: 'transparent',
                  border: '1.5px dashed var(--color-border-strong)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-focus)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-strong)' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                  Selecionar do histórico
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
                    Escolha de {MIN_IMAGES} a {MAX_IMAGES} imagens
                  </div>
                </div>
              </button>
            ) : (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 6,
                }}>
                  {images.map((img, i) => (
                    <div key={img.id} style={{
                      position: 'relative',
                      aspectRatio: '1 / 1',
                      borderRadius: 6, overflow: 'hidden',
                      background: 'var(--color-preview-bg)',
                      border: '0.5px solid var(--color-border-strong)',
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.imageUrl} alt={img.label}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <div style={{
                        position: 'absolute', top: 4, left: 4,
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'var(--color-scrim-strong)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700,
                      }}>{i + 1}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowPicker(true)}
                  style={{
                    marginTop: 10, width: '100%', padding: '8px 0', borderRadius: 7,
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    fontSize: 11, color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}>
                  Editar seleção
                </button>
              </>
            )}
          </Section>

          {/* Step 2: Context */}
          <Section label="2. Sobre o projeto">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Input
                placeholder="Nome do projeto*"
                value={projectName}
                onChange={(v) => setProjectName(v)}
              />
              <Input
                placeholder="Tipo (apartamento, casa, comercial…)"
                value={projectType}
                onChange={(v) => setProjectType(v)}
              />
              <Input
                placeholder="Localização (opcional)"
                value={location}
                onChange={(v) => setLocation(v)}
              />
            </div>
          </Section>

          {/* Step 3: Style */}
          <Section label="3. Estilo do carrossel">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {CAROUSEL_STYLES.map((s) => {
                const sel = style === s.id
                return (
                  <button key={s.id} onClick={() => setStyle(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      border: `1px solid ${sel ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                      background: sel ? 'var(--color-surface)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: sel ? 'var(--color-text-primary)' : 'var(--color-border-strong)',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: sel ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                        {s.desc}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </Section>

          {/* Identity note */}
          {studioName ? (
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--color-accent-green-bg)',
              border: '1px solid var(--color-accent-green-border)',
              fontSize: 10, color: 'var(--color-accent-green)', lineHeight: 1.5,
            }}>
              <strong style={{ fontWeight: 600 }}>{studioName}</strong> aparecerá na capa e no rodapé dos slides.
            </div>
          ) : (
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: 1.5,
            }}>
              Configure sua{' '}
              <Link href="/app/settings/identity" style={{ color: 'var(--color-text-secondary)', textDecoration: 'underline' }}>
                identidade
              </Link>{' '}
              para o nome do estúdio aparecer no carrossel.
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)', fontSize: 11, color: 'var(--color-error)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div style={{ padding: '16px 24px', borderTop: '0.5px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Custo: <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{nodeCost} Nodes</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Saldo: <span style={{ color: credits > 0 ? 'var(--color-text-secondary)' : 'var(--color-error)', fontWeight: 500 }}>{credits} Nodes</span>
            </div>
          </div>
          {copy ? (
            <button onClick={handleEdit}
              style={{
                width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
                background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', letterSpacing: '-0.01em',
              }}>
              Regenerar copy ({nodeCost} nodes)
            </button>
          ) : (
            <button onClick={handleGenerate} disabled={!canSubmit}
              style={{
                width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
                background: canSubmit ? 'var(--color-inverse)' : 'var(--color-surface-hover)',
                color:      canSubmit ? 'var(--color-inverse-foreground)' : 'var(--color-text-quaternary)',
                fontSize: 13, fontWeight: 600,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}>
              {isLoading ? loadingText : credits < nodeCost ? 'Sem Nodes suficientes' : TOOL.ctaLabel}
            </button>
          )}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--color-border-strong)', borderTop: '2px solid var(--color-text-secondary)', animation: 'spin 0.9s linear infinite' }} />
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{loadingText}</div>
          </div>
        ) : slides.length > 0 ? (
          <>
            {/* Header */}
            <div style={{
              padding: '20px 28px',
              borderBottom: '0.5px solid var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{copy?.coverTitle}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {slides.length} slides · Instagram 4:5 · {CAROUSEL_STYLES.find(s => s.id === style)?.label}
                </div>
              </div>
              <button onClick={handleDownloadAll} disabled={isExporting}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 18px', borderRadius: 8,
                  background: 'var(--color-inverse)', color: 'var(--color-inverse-foreground)',
                  fontSize: 12, fontWeight: 600, border: 'none',
                  cursor: isExporting ? 'wait' : 'pointer', letterSpacing: '-0.01em',
                  opacity: isExporting ? 0.7 : 1,
                }}>
                {isExporting ? (
                  <>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid color-mix(in srgb, var(--color-inverse-foreground) 20%, transparent)', borderTop: '1.5px solid var(--color-inverse-foreground)', animation: 'spin 0.8s linear infinite' }} />
                    Exportando {exportProgress}%
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Baixar todos como PNG
                  </>
                )}
              </button>
            </div>

            {/* Carousel strip */}
            <div ref={slidesContainerRef} style={{
              flex: 1, overflowY: 'auto', padding: '28px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 20,
              alignContent: 'start',
            }}>
              {slides.map((slide, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{
                    aspectRatio: `${SLIDE_WIDTH} / ${SLIDE_HEIGHT}`,
                    background: 'var(--color-preview-bg)',
                    borderRadius: 8, overflow: 'hidden',
                    border: '0.5px solid var(--color-border-strong)',
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
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center', letterSpacing: '0.04em' }}>
                    {String(i + 1).padStart(2, '0')} · {slide.role === 'cover' ? 'capa' : slide.role === 'closing' ? 'fechamento' : 'imagem'}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <div style={{ opacity: 0.16 }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="1.5"/>
                <rect x="6" y="6" width="6" height="5" rx="0.8"/>
                <rect x="14" y="6" width="4" height="5" rx="0.8"/>
                <path d="M6 14h12M6 17h8"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                Seu carrossel aparecerá aqui
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 5, lineHeight: 1.5, maxWidth: 360 }}>
                Selecione imagens do seu histórico, dê o nome do projeto e
                a IA escreve título, captions e fechamento.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Picker modal ─────────────────────────────────────────────────── */}
      {showPicker && (
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
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Breadcrumb() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
      <Link href="/app/apresentar" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none' }}>
        Apresentar
      </Link>
      <span>›</span>
      <span style={{ color: 'var(--color-text-secondary)' }}>Prancha IA</span>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 10 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Pill({ tone = 'green', children }: { tone?: 'green' | 'muted'; children: React.ReactNode }) {
  const color = tone === 'green' ? 'var(--color-accent-green)' : 'var(--color-text-tertiary)'
  const bg    = tone === 'green' ? 'var(--color-accent-green-bg)' : 'var(--color-chip)'
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
      color, background: bg, padding: '2px 6px', borderRadius: 999,
    }}>
      {children}
    </span>
  )
}

function Input({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 12px', borderRadius: 8,
        background: 'var(--color-input)',
        border: '1px solid var(--color-input-border)',
        color: 'var(--color-text-primary)', fontSize: 12,
        letterSpacing: '-0.01em',
        outline: 'none',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-focus)'; e.currentTarget.style.background = 'var(--color-surface)' }}
      onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--color-input-border)'; e.currentTarget.style.background = 'var(--color-input)' }}
    />
  )
}
