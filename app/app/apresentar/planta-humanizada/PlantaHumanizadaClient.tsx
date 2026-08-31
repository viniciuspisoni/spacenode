'use client'

import { useState, useRef } from 'react'
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
  const [additionalInstructions, setAdditionalInstructions] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)

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
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Left panel ──────────────────────────────────────────────────────── */}
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
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text-primary)' }}>{TOOL.name}</div>
            <Pill tone="green">novo</Pill>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.5 }}>
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
                border: `1.5px dashed ${isDragging ? 'var(--color-border-focus)' : imageFile ? 'var(--color-border-focus)' : 'var(--color-border-strong)'}`,
                borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
                background: isDragging ? 'var(--color-surface)' : 'transparent',
                minHeight: imageFile ? 0 : 130,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: imageFile ? 0 : '28px 20px',
              }}
            >
              {imageFile && imagePreview ? (
                <img src={imagePreview} alt="preview" style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'contain', background: 'var(--color-preview-bg)' }} />
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-quaternary)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 10 }}>
                    Arraste sua planta ou clique para enviar
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-quaternary)', marginTop: 4 }}>PNG, JPG, WEBP — até 20 MB</span>
                </>
              )}
            </div>

            {imageFile && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', display: 'flex', gap: 8 }}>
                  {imageDimensions && <span>{imageDimensions.w}×{imageDimensions.h}px</span>}
                  <span>{formatFileSize(imageFile.size)}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); resetImage() }}
                  style={{ fontSize: 10, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Trocar imagem
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImageFile(f) }} />
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
                      border: `1px solid ${selected ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                      background: selected ? 'var(--color-surface-hover)' : 'transparent',
                      cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: selected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', letterSpacing: '-0.01em' }}>
                      {l.label}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 3, lineHeight: 1.3 }}>
                      {l.desc}
                    </div>
                  </button>
                )
              })}
            </div>
          </Section>

          {/* Advanced settings */}
          <div>
            <button
              onClick={() => setAdvancedOpen((v) => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)' }}>
                Ajustes avançados
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round"
                style={{ transform: advancedOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {advancedOpen && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeIn 0.15s ease' }}>
                <Section label="Tipo de projeto">
                  <PillRow
                    items={HUMANIZED_PLAN_PROJECT_TYPES}
                    selected={projectType}
                    onSelect={(id) => setProjectType(id as HumanizedPlanProjectType)}
                  />
                </Section>

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

                <Section label="Instruções adicionais">
                  <textarea
                    value={additionalInstructions}
                    onChange={(e) => setAdditionalInstructions(e.target.value.slice(0, 400))}
                    placeholder="Ex: usar mobiliário contemporâneo, manter nomes dos ambientes grandes, evitar vegetação, destacar áreas molhadas..."
                    rows={3}
                    style={{
                      width: '100%', resize: 'none', maxHeight: 90,
                      padding: '9px 11px', borderRadius: 8,
                      border: '1px solid var(--color-border)', background: 'transparent',
                      color: 'var(--color-text-primary)', fontSize: 11.5, lineHeight: 1.5,
                      fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <div style={{ textAlign: 'right', fontSize: 9, color: 'var(--color-text-quaternary)', marginTop: 4 }}>
                    {additionalInstructions.length}/400
                  </div>
                </Section>
              </div>
            )}
          </div>

          {/* Fidelity note */}
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 600, color: 'var(--color-accent-green)' }}>Fidelidade:</strong> paredes, aberturas e proporções
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
        <div style={{ padding: '16px 24px', borderTop: '0.5px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Custo: <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{nodeCost} Nodes</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Saldo: <span style={{ color: credits > 0 ? 'var(--color-text-secondary)' : 'var(--color-error)', fontWeight: 500 }}>{credits} Nodes</span>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={!canSubmit}
            style={{
              width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
              background: canSubmit ? 'var(--color-inverse)' : 'var(--color-surface-hover)',
              color: canSubmit ? 'var(--color-inverse-foreground)' : 'var(--color-text-quaternary)',
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
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--color-border-strong)', borderTop: '2px solid var(--color-text-secondary)', animation: 'spin 0.9s linear infinite' }} />
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', letterSpacing: '0.02em' }}>{loadingText}</div>
          </div>
        )}

        {!isLoading && resultUrl && (
          <div style={{ width: '100%', maxWidth: 760, animation: 'fadeIn 0.3s ease' }}>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              <img src={resultUrl} alt="Planta humanizada" style={{ width: '100%', display: 'block' }} />
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }}>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em' }}>
                Planta humanizada · {HUMANIZED_PLAN_STYLES.find(s => s.id === style)?.label}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Proxy /api/download força attachment — o atributo download é
                    ignorado cross-origin e abriria a imagem fora do site. */}
                <a href={`/api/download?url=${encodeURIComponent(resultUrl)}&filename=spacenode-planta-humanizada.jpg`}
                  style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)' }}
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
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontWeight: 500, letterSpacing: '-0.01em' }}>
                Sua planta humanizada aparecerá aqui
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 5, lineHeight: 1.5, maxWidth: 320 }}>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
      <span>Criar</span>
      <span>›</span>
      <span style={{ color: 'var(--color-text-secondary)' }}>Planta Humanizada</span>
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
              border: `1px solid ${isSel ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
              background: isSel ? 'var(--color-surface-hover)' : 'transparent',
              fontSize: 11, color: isSel ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
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
              border: `1px solid ${isSel ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
              background: isSel ? 'var(--color-surface)' : 'transparent',
              cursor: 'pointer', textAlign: 'left', width: '100%',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: isSel ? 'var(--color-text-primary)' : 'var(--color-border-strong)',
              transition: 'background 0.15s',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: isSel ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', letterSpacing: '-0.01em' }}>
                {it.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
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
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{label}</span>
      <div onClick={onChange}
        style={{
          width: 32, height: 18, borderRadius: 9,
          background: value ? 'var(--color-inverse)' : 'var(--color-surface-hover)',
          position: 'relative', cursor: 'pointer',
          transition: 'background 0.15s', flexShrink: 0,
        }}>
        <div style={{
          position: 'absolute', top: 2, left: value ? 16 : 2, width: 14, height: 14, borderRadius: 7,
          background: value ? 'var(--color-inverse-foreground)' : 'var(--color-text-tertiary)',
          transition: 'left 0.15s, background 0.15s',
        }} />
      </div>
    </div>
  )
}
