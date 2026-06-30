'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import {
  APRESENTAR_TOOLS,
  MOODBOARD_AMBIENTS,
  MOODBOARD_STYLES,
  MOODBOARD_PALETTES,
  MOODBOARD_LEVELS,
  MOODBOARD_FORMATS,
  type MoodboardAmbient,
  type MoodboardStyle,
  type MoodboardPalette,
  type MoodboardLevel,
  type MoodboardFormat,
  type MoodboardResult,
} from '@/lib/apresentar/config'
import MoodboardCanvas from './MoodboardCanvas'
import { svgElementToPngBlob, downloadBlob } from '@/lib/apresentar/svg-to-png'

interface Props {
  initialCredits: number
  studioName?:    string | null
}

const TOOL = APRESENTAR_TOOLS.moodboard

const LOADING_TEXTS = [
  'Analisando referências…',
  'Compondo paleta de cores…',
  'Selecionando materiais…',
  'Escrevendo conceito visual…',
  'Refinando moodboard…',
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MoodboardClient({ initialCredits, studioName: initialStudio = null }: Props) {
  // ── Entrada ─────────────────────────────────────────────────────────────────
  const [imageFile,    setImageFile]    = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isDragging,   setIsDragging]   = useState(false)
  const [projectName,  setProjectName]  = useState('')

  // ── Presets ─────────────────────────────────────────────────────────────────
  const [ambient, setAmbient] = useState<MoodboardAmbient>('sala')
  const [style,   setStyle]   = useState<MoodboardStyle>('contemporaneo')
  const [palette, setPalette] = useState<MoodboardPalette>('neutra')
  const [level,   setLevel]   = useState<MoodboardLevel>('comercial')
  const [format,  setFormat]  = useState<MoodboardFormat>('portrait')

  // ── Geração ─────────────────────────────────────────────────────────────────
  const [isLoading,   setIsLoading]   = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0])
  const [result,      setResult]      = useState<MoodboardResult | null>(null)
  const [studioName,  setStudioName]  = useState<string | null>(initialStudio)
  const [credits,     setCredits]     = useState(initialCredits)
  const [error,       setError]       = useState<string | null>(null)

  // ── Export ──────────────────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false)

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const canvasHostRef   = useRef<HTMLDivElement | null>(null)

  const nodeCost  = TOOL.nodes ?? 0
  // Imagem é opcional — sempre dá pra gerar usando só os presets
  const canSubmit = credits >= nodeCost && !isLoading

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('O arquivo deve ser uma imagem.'); return }
    if (file.size > 20 * 1024 * 1024)    { setError('Imagem muito grande. Máximo 20 MB.'); return }

    setImageFile(file)
    setResult(null)
    setError(null)

    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  function resetImage() {
    setImageFile(null)
    setImagePreview(null)
  }

  function startLoadingTexts() {
    let i = 0
    setLoadingText(LOADING_TEXTS[0])
    loadingTimerRef.current = setInterval(() => {
      i = (i + 1) % LOADING_TEXTS.length
      setLoadingText(LOADING_TEXTS[i])
    }, 1500)
  }

  function stopLoadingTexts() {
    if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setIsLoading(true)
    setError(null)
    setResult(null)
    startLoadingTexts()

    try {
      const fd = new FormData()
      if (imageFile)             fd.append('image',       imageFile)
      if (projectName.trim())    fd.append('projectName', projectName.trim())
      fd.append('ambient', ambient)
      fd.append('style',   style)
      fd.append('palette', palette)
      fd.append('level',   level)
      fd.append('format',  format)

      const res  = await fetch('/api/apresentar/moodboard', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Erro ao gerar moodboard')
        return
      }
      setResult(data.result as MoodboardResult)
      if (data.studioName && !studioName) setStudioName(data.studioName)
      if (typeof data.creditsRemaining === 'number') setCredits(data.creditsRemaining)
      else setCredits((c) => Math.max(0, c - nodeCost))
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      stopLoadingTexts()
      setIsLoading(false)
    }
  }

  async function handleDownload() {
    if (!result || !canvasHostRef.current) return
    const svg = canvasHostRef.current.querySelector('svg') as SVGSVGElement | null
    if (!svg) return

    const dim = MOODBOARD_FORMATS.find(f => f.id === format)!
    setIsExporting(true)
    setError(null)
    try {
      const blob = await svgElementToPngBlob(svg, dim.width, dim.height)
      const safeName = (projectName.trim() || result.title || 'moodboard')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'moodboard'
      downloadBlob(blob, `${safeName}-${format}.png`)
    } catch (e) {
      setError(`Erro ao exportar: ${(e as Error).message}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0a0a', color: '#ffffff' }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Left panel · entrada ─────────────────────────────────────────────── */}
      <div style={{
        width: 420, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '0.5px solid rgba(255,255,255,0.07)',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '24px 24px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <Breadcrumb />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: '#ffffff' }}>{TOOL.name}</div>
            <Pill tone="green">novo</Pill>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 1.5 }}>
            Crie paletas, materiais e conceitos visuais para apresentar seus projetos.
          </div>
        </div>

        {/* Scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Upload */}
          <Section label="Referência visual (opcional)">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) loadImageFile(f) }}
              style={{
                border: `1.5px dashed ${isDragging ? 'rgba(255,255,255,0.4)' : imageFile ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
                background: isDragging ? 'rgba(255,255,255,0.04)' : 'transparent',
                minHeight: imageFile ? 0 : 110,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: imageFile ? 0 : '22px 18px',
              }}
            >
              {imageFile && imagePreview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={imagePreview} alt="referência" style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover', background: '#0a0a0a' }} />
              ) : (
                <>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 9 }}>
                    Arraste imagem ou render de referência
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>PNG, JPG, WEBP — até 20 MB</span>
                </>
              )}
            </div>

            {imageFile && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                  {formatFileSize(imageFile.size)}
                </div>
                <button onClick={(e) => { e.stopPropagation(); resetImage() }}
                  style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Trocar imagem
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImageFile(f) }} />
          </Section>

          {/* Nome do projeto */}
          <Section label="Nome do projeto (opcional)">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Ex.: Cobertura Itaim"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#ffffff', fontSize: 12,
                letterSpacing: '-0.01em', outline: 'none',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 6 }}>
              Aparece no rodapé do moodboard.
            </div>
          </Section>

          {/* Ambiente */}
          <Section label="Ambiente">
            <PillRow
              items={MOODBOARD_AMBIENTS}
              selected={ambient}
              onSelect={(id) => setAmbient(id as MoodboardAmbient)}
            />
          </Section>

          {/* Estilo */}
          <Section label="Estilo">
            <PillRow
              items={MOODBOARD_STYLES}
              selected={style}
              onSelect={(id) => setStyle(id as MoodboardStyle)}
            />
          </Section>

          {/* Paleta */}
          <Section label="Paleta">
            <PillRow
              items={MOODBOARD_PALETTES}
              selected={palette}
              onSelect={(id) => setPalette(id as MoodboardPalette)}
            />
          </Section>

          {/* Nível */}
          <Section label="Nível">
            <div style={{ display: 'flex', gap: 8 }}>
              {MOODBOARD_LEVELS.map((l) => {
                const selected = level === l.id
                return (
                  <button key={l.id} onClick={() => setLevel(l.id)}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 8,
                      border: `1px solid ${selected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)'}`,
                      background: selected ? 'rgba(255,255,255,0.08)' : 'transparent',
                      cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: selected ? '#ffffff' : 'rgba(255,255,255,0.55)', letterSpacing: '-0.01em' }}>
                      {l.label}
                    </div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 3, lineHeight: 1.3 }}>
                      {l.desc}
                    </div>
                  </button>
                )
              })}
            </div>
          </Section>

          {/* Formato de saída */}
          <Section label="Formato de saída">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MOODBOARD_FORMATS.map((f) => {
                const sel = format === f.id
                return (
                  <button key={f.id} onClick={() => setFormat(f.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      border: `1px solid ${sel ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
                      background: sel ? 'rgba(255,255,255,0.06)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: sel ? '#ffffff' : 'rgba(255,255,255,0.2)',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: sel ? '#fff' : 'rgba(255,255,255,0.65)' }}>
                        {f.label}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', marginTop: 2 }}>
                        {f.desc}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </Section>

          {/* Identity hint */}
          {studioName ? (
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(48,180,108,0.06)',
              border: '1px solid rgba(48,180,108,0.18)',
              fontSize: 10, color: 'rgba(134,239,172,0.85)', lineHeight: 1.5,
            }}>
              <strong style={{ fontWeight: 600 }}>{studioName}</strong> aparecerá no cabeçalho do moodboard.
            </div>
          ) : (
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5,
            }}>
              Configure sua{' '}
              <Link href="/app/settings/identity" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'underline' }}>
                identidade
              </Link>{' '}
              para aparecer no cabeçalho.
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)', fontSize: 11, color: 'var(--color-error)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '0.5px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              Custo: <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{nodeCost} Nodes</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              Saldo: <span style={{ color: credits > 0 ? 'rgba(255,255,255,0.75)' : 'var(--color-error)', fontWeight: 500 }}>{credits} Nodes</span>
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
            {isLoading
              ? loadingText
              : credits < nodeCost
              ? 'Sem Nodes suficientes'
              : result
              ? `Gerar novo (${nodeCost} nodes)`
              : TOOL.ctaLabel}
          </button>
        </div>
      </div>

      {/* ── Right panel · resultado ──────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {isLoading && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTop: '2px solid rgba(255,255,255,0.7)', animation: 'spin 0.9s linear infinite' }} />
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.02em' }}>{loadingText}</div>
          </div>
        )}

        {!isLoading && !result && <EmptyState />}

        {!isLoading && result && (
          <ResultView
            result={result}
            format={format}
            studioName={studioName}
            projectName={projectName.trim() || undefined}
            canvasHostRef={canvasHostRef}
            onDownload={handleDownload}
            isExporting={isExporting}
          />
        )}
      </div>
    </div>
  )
}

// ── Result view ─────────────────────────────────────────────────────────────

function ResultView({
  result, format, studioName, projectName,
  canvasHostRef, onDownload, isExporting,
}: {
  result:        MoodboardResult
  format:        MoodboardFormat
  studioName:    string | null
  projectName?:  string
  canvasHostRef: React.RefObject<HTMLDivElement | null>
  onDownload:    () => void
  isExporting:   boolean
}) {
  const formatSpec = MOODBOARD_FORMATS.find(f => f.id === format)!

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      padding: '32px 40px 56px',
      animation: 'fadeIn 0.3s ease',
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Moodboard · {formatSpec.label}
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 500, color: '#ffffff', letterSpacing: '-0.03em', margin: 0 }}>
              {result.title}
            </h2>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' as const }}>
              {result.tags.map((t) => (
                <span key={t} style={{
                  fontSize: 10, fontWeight: 500,
                  color: 'rgba(255,255,255,0.65)',
                  padding: '3px 9px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.05)',
                  border: '0.5px solid rgba(255,255,255,0.12)',
                  letterSpacing: '0.01em',
                }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onDownload} disabled={isExporting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 8,
              background: '#fff', color: '#0a0a0a',
              fontSize: 12, fontWeight: 600, border: 'none',
              cursor: isExporting ? 'wait' : 'pointer', letterSpacing: '-0.01em',
              opacity: isExporting ? 0.7 : 1, flexShrink: 0,
            }}>
            {isExporting ? (
              <>
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid rgba(10,10,10,0.2)', borderTop: '1.5px solid #0a0a0a', animation: 'spin 0.8s linear infinite' }} />
                Exportando…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Baixar PNG ({formatSpec.width}×{formatSpec.height})
              </>
            )}
          </button>
        </div>

        {/* Preview do canvas — host com SVG escalado para o container */}
        <div ref={canvasHostRef} style={{
          width: '100%',
          aspectRatio: `${formatSpec.width} / ${formatSpec.height}`,
          maxHeight: '70vh',
          margin: '0 auto',
          borderRadius: 12, overflow: 'hidden',
          border: '0.5px solid rgba(255,255,255,0.12)',
          background: '#1a1612',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MoodboardCanvas
            format={format}
            result={result}
            studioName={studioName ?? undefined}
            projectName={projectName}
          />
        </div>

        {/* Panels informativos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {/* Paleta */}
          <Panel title="Paleta">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.palette.map((s) => (
                <div key={s.hex} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                    background: s.hex,
                    border: '0.5px solid rgba(255,255,255,0.12)',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#ffffff', fontWeight: 500, letterSpacing: '-0.01em' }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', marginTop: 2 }}>
                      {s.hex.toUpperCase()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Conceito */}
          <Panel title="Conceito">
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, margin: 0, letterSpacing: '-0.005em' }}>
              {result.concept}
            </p>
          </Panel>
        </div>

        {/* Materiais */}
        <Panel title="Materiais sugeridos">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {result.materials.map((m, i) => (
              <div key={`${m.category}-${i}`} style={{
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.025)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
              }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                  {m.category}
                </div>
                <div style={{ fontSize: 12.5, color: '#ffffff', fontWeight: 500, letterSpacing: '-0.01em', marginBottom: m.note ? 4 : 0 }}>
                  {m.name}
                </div>
                {m.note && (
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.42)', lineHeight: 1.45 }}>
                    {m.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ opacity: 0.16 }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <circle cx="12" cy="6.5" r="1.4" fill="currentColor" stroke="none"/>
          <circle cx="17" cy="10" r="1.4" fill="currentColor" stroke="none"/>
          <circle cx="16" cy="15.5" r="1.4" fill="currentColor" stroke="none"/>
          <circle cx="8" cy="15.5" r="1.4" fill="currentColor" stroke="none"/>
          <circle cx="7" cy="10" r="1.4" fill="currentColor" stroke="none"/>
        </svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500, letterSpacing: '-0.01em' }}>
          Seu moodboard aparecerá aqui
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 5, lineHeight: 1.5, maxWidth: 340 }}>
          Envie uma referência ou descreva o conceito e escolha ambiente, estilo, paleta e nível.
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Breadcrumb() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
      <Link href="/app/apresentar" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>
        Apresentar
      </Link>
      <span>›</span>
      <span style={{ color: 'rgba(255,255,255,0.6)' }}>Moodboard</span>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 10 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Pill({ tone = 'green', children }: { tone?: 'green' | 'muted'; children: React.ReactNode }) {
  const color = tone === 'green' ? '#30b46c' : 'rgba(255,255,255,0.4)'
  const bg    = tone === 'green' ? 'rgba(48,180,108,0.16)' : 'rgba(255,255,255,0.06)'
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
      color, background: bg, padding: '2px 6px', borderRadius: 999,
    }}>
      {children}
    </span>
  )
}

function PillRow<T extends string>({ items, selected, onSelect }: {
  items: { id: T; label: string }[]
  selected: T
  onSelect: (id: T) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
      {items.map(it => {
        const isSel = selected === it.id
        return (
          <button key={it.id} onClick={() => onSelect(it.id)}
            style={{
              padding: '6px 11px', borderRadius: 6,
              border: `1px solid ${isSel ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
              background: isSel ? 'rgba(255,255,255,0.08)' : 'transparent',
              fontSize: 11, color: isSel ? '#ffffff' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '18px 20px',
      background: 'rgba(255,255,255,0.02)',
      border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

