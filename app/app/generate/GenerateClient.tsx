"use client"

import { useState, useRef, useCallback, useEffect } from 'react'

const LOADING_TEXTS = [
  'Analisando volumetria...',
  'Aplicando materiais premium...',
  'Ajustando iluminação natural...',
]

interface Props {
  userName: string
  credits: number
}

export default function GenerateClient({ userName, credits: initialCredits }: Props) {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [ambient, setAmbient] = useState('')
  const [style, setStyle] = useState('')
  const [lighting, setLighting] = useState('')
  const [geometryLock, setGeometryLock] = useState(50)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingIdx, setLoadingIdx] = useState(0)
  const [result, setResult] = useState<{ url: string; originalUrl: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [credits, setCredits] = useState(initialCredits)
  const [isDragOver, setIsDragOver] = useState(false)

  // BeforeAfter slider
  const [sliderPos, setSliderPos] = useState(50)
  const compareRef = useRef<HTMLDivElement>(null)
  const isDraggingCompare = useRef(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isLoading) return
    const id = setInterval(() => setLoadingIdx(i => (i + 1) % LOADING_TEXTS.length), 2200)
    return () => clearInterval(id)
  }, [isLoading])

  const applyFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setResult(null)
    setError(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) applyFile(file)
    },
    [applyFile]
  )

  const handleGenerate = async () => {
    if (!imageFile || !prompt.trim() || !ambient || !style || !lighting || isLoading || credits <= 0) return
    setIsLoading(true)
    setError(null)
    setLoadingIdx(0)

    const body = new FormData()
    body.append('image', imageFile)
    body.append('prompt', prompt)
    body.append('ambient', ambient)
    body.append('style', style)
    body.append('lighting', lighting)
    body.append('geometryLock', String(geometryLock))

    try {
      const res = await fetch('/api/generate', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao gerar render')
        return
      }
      setResult(data)
      setCredits(c => Math.max(0, c - 1))
      setSliderPos(50)
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const moveCompareSlider = (clientX: number) => {
    if (!compareRef.current || !isDraggingCompare.current) return
    const rect = compareRef.current.getBoundingClientRect()
    setSliderPos(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)))
  }

  const canGenerate = !!imageFile && prompt.trim().length > 0 && !!ambient && !!style && !!lighting && !isLoading && credits > 0

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f5f5f7' }}>
      {/* ── Header ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: '#0a0a0a',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.18em', color: '#f5f5f7' }}>
          SPACENODE
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>
            {userName}
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(48,209,88,0.1)',
              border: '1px solid rgba(48,209,88,0.25)',
              borderRadius: 20,
              padding: '4px 12px',
            }}
          >
            <div
              style={{ width: 6, height: 6, borderRadius: '50%', background: '#30d158' }}
            />
            <span style={{ fontSize: 12, fontWeight: 500, color: '#30d158' }}>
              {credits} {credits === 1 ? 'crédito' : 'créditos'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1024, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            marginBottom: 8,
          }}
        >
          Gerar Render
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 40 }}>
          Faça upload do seu projeto e transforme em render fotorrealista em segundos.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* ── Left: Controls ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Upload Area */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>
                Imagem de Origem
              </label>
              <div
                onClick={() => !imageFile && fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                style={{
                  border: `1.5px dashed ${isDragOver ? '#30d158' : imageFile ? 'rgba(48,209,88,0.35)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: isDragOver ? 'rgba(48,209,88,0.04)' : 'rgba(255,255,255,0.02)',
                  cursor: imageFile ? 'default' : 'pointer',
                  minHeight: 200,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'border-color 0.2s, background 0.2s',
                  position: 'relative',
                }}
              >
                {imagePreview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview}
                      alt="preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <button
                      onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(null); setResult(null) }}
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#f5f5f7',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 32 }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 12px', opacity: 0.35 }}>
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="#f5f5f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="17 8 12 3 7 8" stroke="#f5f5f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="12" y1="3" x2="12" y2="15" stroke="#f5f5f7" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                      Arraste ou clique para enviar
                    </p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
                      PNG, JPG, WEBP
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) applyFile(f) }}
              />
            </div>

            {/* Prompt */}
            <div>
              <label
                htmlFor="prompt"
                style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}
              >
                Descrição do Estilo
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Ex: render fotorrealista, estilo contemporâneo, fachada em concreto aparente, iluminação natural ao entardecer, jardim com vegetação tropical..."
                rows={4}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  color: '#f5f5f7',
                  fontSize: 13,
                  lineHeight: 1.6,
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(48,209,88,0.4)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
            </div>

            {/* Ambient / Style / Lighting selects */}
            {(
              [
                { id: 'ambient', label: 'Ambiente', value: ambient, set: setAmbient,
                  options: ['Externo – fachada', 'Interno – sala', 'Interno – cozinha',
                            'Interno – quarto', 'Área de lazer', 'Comercial'] },
                { id: 'style', label: 'Estilo', value: style, set: setStyle,
                  options: ['Contemporâneo', 'Escandinavo', 'Industrial', 'Tropical',
                            'Minimalista', 'Rústico', 'Biofílico'] },
                { id: 'lighting', label: 'Iluminação', value: lighting, set: setLighting,
                  options: ['Natural – manhã', 'Natural – meio-dia', 'Natural – pôr do sol',
                            'Artificial – quente', 'Artificial – fria', 'Noturna'] },
              ] as { id: string; label: string; value: string; set: (v: string) => void; options: string[] }[]
            ).map(({ id, label, value, set, options }) => (
              <div key={id}>
                <label
                  htmlFor={id}
                  style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}
                >
                  {label}
                </label>
                <select
                  id={id}
                  value={value}
                  onChange={e => set(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    padding: '11px 14px',
                    color: value ? '#f5f5f7' : 'rgba(255,255,255,0.25)',
                    fontSize: 13,
                    outline: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="" disabled>Selecione…</option>
                  {options.map(o => (
                    <option key={o} value={o} style={{ background: '#1a1a1a', color: '#f5f5f7' }}>{o}</option>
                  ))}
                </select>
              </div>
            ))}

            {/* Geometry Lock Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <label
                  htmlFor="geometry-lock"
                  style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}
                >
                  Geometry Lock
                </label>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#30d158' }}>
                  {geometryLock}%
                </span>
              </div>
              <input
                id="geometry-lock"
                type="range"
                min={0}
                max={100}
                value={geometryLock}
                onChange={e => setGeometryLock(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#30d158', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>
                  LIVRE
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>
                  BLOQUEADO
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8, lineHeight: 1.5 }}>
                {geometryLock >= 75
                  ? 'Alta fidelidade ao projeto original. Menos liberdade criativa da IA.'
                  : geometryLock >= 40
                  ? 'Equilíbrio entre fidelidade estrutural e interpretação criativa.'
                  : 'Máxima criatividade da IA. Estrutura pode ser reimaginada.'}
              </p>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              style={{
                width: '100%',
                padding: '15px 24px',
                borderRadius: 10,
                background: canGenerate ? '#30d158' : 'rgba(255,255,255,0.06)',
                color: canGenerate ? '#000' : 'rgba(255,255,255,0.2)',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                border: 'none',
                cursor: canGenerate ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s, color 0.2s, transform 0.1s',
                transform: 'scale(1)',
              }}
              onMouseEnter={e => { if (canGenerate) (e.currentTarget.style.transform = 'scale(1.01)') }}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {isLoading ? '...' : credits <= 0 ? 'Sem créditos' : 'Gerar Render'}
            </button>

            {credits <= 0 && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                Você não tem créditos disponíveis.
              </p>
            )}
            {error && (
              <p style={{ fontSize: 12, color: '#ff453a', textAlign: 'center', padding: '10px 0' }}>
                {error}
              </p>
            )}
          </div>

          {/* ── Right: Result ── */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>
              Resultado
            </label>

            {/* Loading State */}
            {isLoading && (
              <div
                style={{
                  flex: 1,
                  minHeight: 380,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 20,
                }}
              >
                {/* Spinner */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: '2px solid rgba(48,209,88,0.15)',
                    borderTop: '2px solid #30d158',
                    animation: 'spin 0.9s linear infinite',
                  }}
                />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.55)',
                    letterSpacing: '0.03em',
                    transition: 'opacity 0.4s',
                  }}
                >
                  {LOADING_TEXTS[loadingIdx]}
                </p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
                  Processando via fal-ai/flux…
                </p>
              </div>
            )}

            {/* Before/After Result */}
            {!isLoading && result && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  ref={compareRef}
                  onMouseDown={() => (isDraggingCompare.current = true)}
                  onMouseMove={e => moveCompareSlider(e.clientX)}
                  onMouseUp={() => (isDraggingCompare.current = false)}
                  onMouseLeave={() => (isDraggingCompare.current = false)}
                  onTouchMove={e => {
                    isDraggingCompare.current = true
                    moveCompareSlider(e.touches[0].clientX)
                  }}
                  onTouchEnd={() => (isDraggingCompare.current = false)}
                  style={{
                    position: 'relative',
                    borderRadius: 12,
                    overflow: 'hidden',
                    aspectRatio: '4/3',
                    cursor: 'ew-resize',
                    userSelect: 'none',
                    background: '#111',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {/* After (render) — full */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.url}
                    alt="render gerado"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />

                  {/* Before (original) — clipped */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.originalUrl}
                    alt="imagem original"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      clipPath: `inset(0 ${100 - sliderPos}% 0 0)`,
                    }}
                  />

                  {/* Labels */}
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 12,
                      left: 12,
                      fontSize: 10,
                      letterSpacing: '0.2em',
                      background: 'rgba(0,0,0,0.7)',
                      color: '#f5f5f7',
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      pointerEvents: 'none',
                    }}
                  >
                    original
                  </span>
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 12,
                      right: 12,
                      fontSize: 10,
                      letterSpacing: '0.2em',
                      background: 'rgba(48,209,88,0.85)',
                      color: '#000',
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      pointerEvents: 'none',
                    }}
                  >
                    render
                  </span>

                  {/* Divider */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${sliderPos}%`,
                      width: 2,
                      background: '#fff',
                      transform: 'translateX(-50%)',
                      boxShadow: '0 0 8px rgba(0,0,0,0.5)',
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: '#fff',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 3,
                      }}
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M6 1L2 5L6 9" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M4 1L8 5L4 9" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', letterSpacing: '0.04em' }}>
                  arraste para comparar
                </p>

                <a
                  href={result.url}
                  download="spacenode-render.jpg"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '11px 20px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    transition: 'background 0.2s',
                  }}
                >
                  Baixar Render
                </a>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !result && (
              <div
                style={{
                  flex: 1,
                  minHeight: 380,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px dashed rgba(255,255,255,0.07)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.15)', letterSpacing: '0.04em' }}>
                  O render aparecerá aqui
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
