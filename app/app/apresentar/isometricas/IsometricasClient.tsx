'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import {
  APRESENTAR_TOOLS,
  ISOMETRIC_ORIGINS,
  ISOMETRIC_TYPES,
  ISOMETRIC_STYLES,
  type IsometricOrigin,
  type IsometricType,
  type IsometricStyle,
} from '@/lib/apresentar/config'

interface Props {
  initialCredits: number
}

const TOOL = APRESENTAR_TOOLS.isometric

const LOADING_TEXTS = [
  'Analisando vista enviada…',
  'Calculando geometria isométrica…',
  'Aplicando estilo de apresentação…',
  'Refinando materiais…',
  'Finalizando…',
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function IsometricasClient({ initialCredits }: Props) {
  // Upload
  const [imageFile,       setImageFile]       = useState<File | null>(null)
  const [imagePreview,    setImagePreview]    = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null)
  const [isDragging,      setIsDragging]      = useState(false)

  // Parameters
  const [origin, setOrigin] = useState<IsometricOrigin>('sketchup')
  const [type,   setType]   = useState<IsometricType>('mobiliada')
  const [style,  setStyle]  = useState<IsometricStyle>('premium_clean')

  // Generation
  const [isLoading,   setIsLoading]   = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0])
  const [resultUrl,   setResultUrl]   = useState<string | null>(null)
  const [credits,     setCredits]     = useState(initialCredits)
  const [error,       setError]       = useState<string | null>(null)

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const nodeCost  = TOOL.nodes ?? 0
  const canSubmit = !!imageFile && credits >= nodeCost && !isLoading

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('O arquivo deve ser uma imagem.'); return }
    if (file.size > 20 * 1024 * 1024)    { setError('Imagem muito grande. Máximo 20 MB.'); return }

    setImageFile(file)
    setResultUrl(null)
    setError(null)
    setImageDimensions(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImagePreview(dataUrl)
      const img = new Image()
      img.onload = () => setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight })
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  function resetImage() {
    setImageFile(null)
    setImagePreview(null)
    setResultUrl(null)
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
    startLoadingTexts()

    const formData = new FormData()
    formData.append('image',  imageFile)
    formData.append('origin', origin)
    formData.append('type',   type)
    formData.append('style',  style)

    try {
      const res  = await fetch('/api/apresentar/isometric', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Erro desconhecido')
        return
      }
      setResultUrl(data.url)
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

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0a0a', color: '#ffffff' }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Left panel ──────────────────────────────────────────────────────── */}
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
            {TOOL.longDesc}
          </div>
        </div>

        {/* Scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Upload */}
          <Section label="Imagem base">
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
                minHeight: imageFile ? 0 : 130,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: imageFile ? 0 : '28px 20px',
              }}
            >
              {imageFile && imagePreview ? (
                <img src={imagePreview} alt="preview" style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'contain', background: '#0a0a0a' }} />
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 10 }}>
                    Envie um screenshot ou vista do modelo
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>PNG, JPG, WEBP — até 20 MB</span>
                </>
              )}
            </div>

            {imageFile && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', display: 'flex', gap: 8 }}>
                  {imageDimensions && <span>{imageDimensions.w}×{imageDimensions.h}px</span>}
                  <span>{formatFileSize(imageFile.size)}</span>
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

          {/* Hint */}
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>Dica de fidelidade:</strong>{' '}
              para resultado mais fiel, envie uma vista em câmera paralela ou isométrica
              exportada do SketchUp/Revit.
            </div>
          </div>

          {/* Origin */}
          <Section label="Origem da imagem">
            <PillRow
              items={ISOMETRIC_ORIGINS}
              selected={origin}
              onSelect={(id) => setOrigin(id as IsometricOrigin)}
            />
          </Section>

          {/* Type */}
          <Section label="Tipo de isométrica">
            <CardList
              items={ISOMETRIC_TYPES}
              selected={type}
              onSelect={(id) => setType(id as IsometricType)}
            />
          </Section>

          {/* Style */}
          <Section label="Estilo">
            <CardList
              items={ISOMETRIC_STYLES}
              selected={style}
              onSelect={(id) => setStyle(id as IsometricStyle)}
            />
          </Section>

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
            {isLoading ? loadingText : credits < nodeCost ? 'Sem Nodes suficientes' : TOOL.ctaLabel}
          </button>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, overflow: 'hidden' }}>

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTop: '2px solid rgba(255,255,255,0.7)', animation: 'spin 0.9s linear infinite' }} />
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.02em' }}>{loadingText}</div>
          </div>
        )}

        {!isLoading && resultUrl && (
          <div style={{ width: '100%', maxWidth: 760, animation: 'fadeIn 0.3s ease' }}>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              <img src={resultUrl} alt="Isométrica" style={{ width: '100%', display: 'block' }} />
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>
                Isométrica · {ISOMETRIC_TYPES.find(t => t.id === type)?.label} · {ISOMETRIC_STYLES.find(s => s.id === style)?.label}
              </div>
              <a href={resultUrl} download target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Baixar
              </a>
            </div>
          </div>
        )}

        {!isLoading && !resultUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, animation: 'fadeIn 0.2s ease' }}>
            <div style={{ opacity: 0.16 }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z"/>
                <path d="M3 7l9 5 9-5M12 12v10"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500, letterSpacing: '-0.01em' }}>
                Sua isométrica aparecerá aqui
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 5, lineHeight: 1.5, maxWidth: 320 }}>
                Envie uma vista do seu modelo, escolha o tipo e o estilo de apresentação.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Breadcrumb() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
      <Link href="/app/apresentar" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>
        Apresentar
      </Link>
      <span>›</span>
      <span style={{ color: 'rgba(255,255,255,0.6)' }}>Isométricas</span>
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

function CardList<T extends string>({ items, selected, onSelect }: {
  items: { id: T; label: string; desc: string }[]
  selected: T
  onSelect: (id: T) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(it => {
        const isSel = selected === it.id
        return (
          <button key={it.id} onClick={() => onSelect(it.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${isSel ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
              background: isSel ? 'rgba(255,255,255,0.06)' : 'transparent',
              cursor: 'pointer', textAlign: 'left', width: '100%',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: isSel ? '#ffffff' : 'rgba(255,255,255,0.2)',
              transition: 'background 0.15s',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: isSel ? '#ffffff' : 'rgba(255,255,255,0.65)', letterSpacing: '-0.01em' }}>
                {it.label}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', marginTop: 2 }}>
                {it.desc}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
