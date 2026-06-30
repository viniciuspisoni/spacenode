'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import {
  APRESENTAR_TOOLS,
  HUMANIZED_PLAN_PROJECT_TYPES,
  HUMANIZED_PLAN_STYLES,
  HUMANIZED_PLAN_LEVELS,
  HUMANIZED_PLAN_DEFAULT_OPTIONS,
  type HumanizedPlanProjectType,
  type HumanizedPlanStyle,
  type HumanizedPlanLevel,
  type HumanizedPlanOptions,
} from '@/lib/apresentar/config'

interface Props {
  initialCredits: number
}

const TOOL = APRESENTAR_TOOLS.humanized_plan

const LOADING_TEXTS = [
  'Analisando a planta…',
  'Preservando paredes e aberturas…',
  'Adicionando mobiliário…',
  'Aplicando texturas…',
  'Refinando apresentação…',
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PlantaHumanizadaClient({ initialCredits }: Props) {
  // Upload state
  const [imageFile,       setImageFile]       = useState<File | null>(null)
  const [imagePreview,    setImagePreview]    = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null)
  const [isDragging,      setIsDragging]      = useState(false)

  // Parameters
  const [projectType, setProjectType] = useState<HumanizedPlanProjectType>('apartamento')
  const [style,       setStyle]       = useState<HumanizedPlanStyle>('imobiliario_premium')
  const [level,       setLevel]       = useState<HumanizedPlanLevel>('equilibrado')
  const [options,     setOptions]     = useState<HumanizedPlanOptions>(HUMANIZED_PLAN_DEFAULT_OPTIONS)

  // Generation state
  const [isLoading,   setIsLoading]   = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0])
  const [resultUrl,   setResultUrl]   = useState<string | null>(null)
  const [credits,     setCredits]     = useState(initialCredits)
  const [error,       setError]       = useState<string | null>(null)

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const nodeCost = TOOL.nodes ?? 0
  const canSubmit = !!imageFile && credits >= nodeCost && !isLoading

  function toggleOption<K extends keyof HumanizedPlanOptions>(key: K) {
    setOptions((o) => ({ ...o, [key]: !o[key] }))
  }

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
    formData.append('image',       imageFile)
    formData.append('projectType', projectType)
    formData.append('style',       style)
    formData.append('level',       level)
    formData.append('options',     JSON.stringify(options))

    try {
      const res  = await fetch('/api/apresentar/humanized-plan', { method: 'POST', body: formData })
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

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Upload */}
          <Section label="Planta baixa">
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
                    Arraste sua planta ou clique para enviar
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

          {/* Project type */}
          <Section label="Tipo de projeto">
            <PillRow
              items={HUMANIZED_PLAN_PROJECT_TYPES}
              selected={projectType}
              onSelect={(id) => setProjectType(id as HumanizedPlanProjectType)}
            />
          </Section>

          {/* Style */}
          <Section label="Estilo visual">
            <CardList
              items={HUMANIZED_PLAN_STYLES}
              selected={style}
              onSelect={(id) => setStyle(id as HumanizedPlanStyle)}
            />
          </Section>

          {/* Level */}
          <Section label="Nível de humanização">
            <div style={{ display: 'flex', gap: 8 }}>
              {HUMANIZED_PLAN_LEVELS.map((l) => {
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

          {/* Options */}
          <Section label="Opções adicionais">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Toggle label="Adicionar mobiliário"        value={options.addFurniture}       onChange={() => toggleOption('addFurniture')} />
              <Toggle label="Adicionar vegetação"         value={options.addVegetation}      onChange={() => toggleOption('addVegetation')} />
              <Toggle label="Aplicar texturas de piso"    value={options.applyFloorTextures} onChange={() => toggleOption('applyFloorTextures')} />
              <Toggle label="Adicionar sombras suaves"    value={options.addSoftShadows}     onChange={() => toggleOption('addSoftShadows')} />
              <Toggle label="Preservar linhas técnicas"   value={options.preserveLines}      onChange={() => toggleOption('preserveLines')} />
              <Toggle label="Adicionar nomes dos ambientes" value={options.addRoomLabels}    onChange={() => toggleOption('addRoomLabels')} />
            </div>
          </Section>

          {/* Fidelity note */}
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(48,180,108,0.06)',
            border: '1px solid rgba(48,180,108,0.18)',
          }}>
            <div style={{ fontSize: 10, color: 'rgba(134,239,172,0.85)', lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 600 }}>Fidelidade:</strong> paredes, aberturas e proporções
              são preservadas sempre que possível.
            </div>
          </div>

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
              <img src={resultUrl} alt="Planta humanizada" style={{ width: '100%', display: 'block' }} />
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>
                Planta humanizada · {HUMANIZED_PLAN_STYLES.find(s => s.id === style)?.label}
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
                  Baixar
                </a>
              </div>
            </div>
          </div>
        )}

        {!isLoading && !resultUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, animation: 'fadeIn 0.2s ease' }}>
            <div style={{ opacity: 0.16 }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 11h7M14 11h7M10 3v8M10 15v6"/>
                <circle cx="16.5" cy="16.5" r="1.5"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500, letterSpacing: '-0.01em' }}>
                Sua planta humanizada aparecerá aqui
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 5, lineHeight: 1.5, maxWidth: 320 }}>
                Envie uma planta baixa técnica e escolha estilo e nível de humanização.
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
      <span style={{ color: 'rgba(255,255,255,0.6)' }}>Planta Humanizada</span>
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

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      <div onClick={onChange}
        style={{
          width: 32, height: 18, borderRadius: 9,
          background: value ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.1)',
          position: 'relative', cursor: 'pointer',
          transition: 'background 0.15s', flexShrink: 0,
        }}>
        <div style={{
          position: 'absolute', top: 2, left: value ? 16 : 2, width: 14, height: 14, borderRadius: 7,
          background: value ? '#0a0a0a' : 'rgba(255,255,255,0.5)',
          transition: 'left 0.15s, background 0.15s',
        }} />
      </div>
    </div>
  )
}
