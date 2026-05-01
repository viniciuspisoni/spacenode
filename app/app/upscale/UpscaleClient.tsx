'use client'

import { useState, useRef } from 'react'
import BeforeAfter from '@/components/app/BeforeAfter'

interface UpscaleClientProps {
  initialCredits: number
}

const MODELS = [
  {
    id:         'fal-ai/clarity-upscaler',
    label:      'Clarity',
    tag:        'Melhor qualidade geral',
    desc:       'Realismo avançado com fidelidade precisa de materiais',
    badge:      'RECOMENDADO',
    badgeColor: '#16a34a',
    hasPrompt:  true,
  },
  {
    id:         'fal-ai/aura-sr',
    label:      'AuraSR',
    tag:        'Mais rápido',
    desc:       'Upscale rápido e limpo para prévias',
    badge:      'RÁPIDO',
    badgeColor: '#65a30d',
    hasPrompt:  false,
  },
  {
    id:         'fal-ai/supir',
    label:      'SUPIR',
    tag:        'Máximo detalhe',
    desc:       'Máximo refinamento com reconstrução avançada',
    badge:      'MÁXIMA',
    badgeColor: '#d97706',
    hasPrompt:  true,
  },
  {
    id:         'fal-ai/esrgan',
    label:      'Real-ESRGAN',
    tag:        'Preserva geometria',
    desc:       'Preserva a geometria e detalhes originais',
    badge:      null,
    badgeColor: null,
    hasPrompt:  false,
  },
] as const

const SCALES = [
  { value: 2, label: '2×', sub: '~4K', nodes: 4,  locked: false },
  { value: 4, label: '4×', sub: '~8K', nodes: 8,  locked: false },
  { value: 8, label: '8×', sub: 'Nebula', nodes: 20, locked: true  },
]

interface Recommendation { model: string; reason: string }

// Filename + filesize heuristics — no ML, no pixel analysis
function detectRecommendedModel(file: File): Recommendation {
  const name = file.name.toLowerCase()

  const lineHints = ['sketch', 'wireframe', 'line', 'cad', 'schematic',
    'floor', 'plant', 'planta', 'linework', 'drawing', 'contour', 'diagrama']
  if (lineHints.some(k => name.includes(k)))
    return { model: 'fal-ai/esrgan', reason: 'Detectamos linhas e geometria técnica' }

  const previewHints = ['preview', 'draft', 'rascunho', 'thumb', 'wip', 'test', 'teste', 'low']
  const isSmallFile  = file.size < 200 * 1024
  if (previewHints.some(k => name.includes(k)) || isSmallFile)
    return { model: 'fal-ai/aura-sr', reason: 'Detectamos uma imagem leve / prévia' }

  return { model: 'fal-ai/clarity-upscaler', reason: 'Detectamos um render realista com materiais aplicados' }
}

const LOADING_TEXTS = [
  'Enviando imagem...',
  'Processando com IA...',
  'Ampliando resolução...',
  'Realçando texturas...',
  'Finalizando...',
]

export default function UpscaleClient({ initialCredits }: UpscaleClientProps) {
  const [imageFile,    setImageFile]    = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [description,  setDescription]  = useState('')
  const [selectedModel, setSelectedModel] = useState<string>('fal-ai/clarity-upscaler')
  const [selectedScale, setSelectedScale] = useState(4)
  const [isLoading,    setIsLoading]    = useState(false)
  const [loadingText,  setLoadingText]  = useState(LOADING_TEXTS[0])
  const [resultUrl,    setResultUrl]    = useState<string | null>(null)
  const [credits,      setCredits]      = useState(initialCredits)
  const [error,        setError]        = useState<string | null>(null)
  const [isDragging,         setIsDragging]         = useState(false)
  const [recommendedModelId, setRecommendedModelId] = useState<string>('fal-ai/clarity-upscaler')
  const [recommendedReason,  setRecommendedReason]  = useState<string>('Detectamos um render realista com materiais aplicados')

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeModel = MODELS.find(m => m.id === selectedModel)!
  const nodeCost = SCALES.find(s => s.value === selectedScale)!.nodes

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Arquivo deve ser uma imagem.'); return }
    if (file.size > 20 * 1024 * 1024) { setError('Imagem muito grande. Máximo 20 MB.'); return }
    setImageFile(file)
    setResultUrl(null)
    setError(null)
    const rec = detectRecommendedModel(file)
    setRecommendedModelId(rec.model)
    setRecommendedReason(rec.reason)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
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
    if (!imageFile || credits < nodeCost || isLoading) return
    setIsLoading(true)
    setError(null)
    setResultUrl(null)
    startLoadingTexts()

    const formData = new FormData()
    formData.append('image',       imageFile)
    formData.append('model',       selectedModel)
    formData.append('scale',       String(selectedScale))
    formData.append('description', description)

    try {
      const res  = await fetch('/api/upscale', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro desconhecido')
        return
      }

      setResultUrl(data.url)
      setCredits(c => c - nodeCost)
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      stopLoadingTexts()
      setIsLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0a0a', color: '#ffffff' }}>

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div style={{
        width: 420,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '0.5px solid rgba(255,255,255,0.07)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: '#ffffff' }}>Upscale</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
            Amplie resolução com IA para apresentação, portfólio e entrega final.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Upload zone */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 10 }}>
              Imagem
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                const file = e.dataTransfer.files[0]
                if (file) loadImageFile(file)
              }}
              style={{
                border: `1.5px dashed ${isDragging ? 'rgba(255,255,255,0.4)' : imageFile ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 10,
                padding: imageFile ? 0 : '28px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
                background: isDragging ? 'rgba(255,255,255,0.04)' : 'transparent',
                overflow: 'hidden',
                minHeight: imageFile ? 0 : 120,
              }}
            >
              {imageFile ? (
                <img
                  src={imagePreview!}
                  alt="preview"
                  style={{ width: '100%', display: 'block', borderRadius: 8, maxHeight: 220, objectFit: 'cover' }}
                />
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 10 }}>
                    Arraste ou clique para enviar
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
                    PNG, JPG, WEBP — até 20 MB
                  </span>
                </>
              )}
            </div>
            {imageFile && (
              <button
                onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); setResultUrl(null) }}
                style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Trocar imagem
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImageFile(f) }}
            />
          </div>

          {/* Model selector */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 4 }}>
              Modelo
            </label>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>
              Cada modelo altera como os detalhes são reconstruídos.
            </div>

            {/* Recommendation banner — updates dynamically on image load */}
            <div style={{
              padding: '8px 10px', borderRadius: 6, marginBottom: 10,
              background: 'rgba(22,163,74,0.07)',
              border: '1px solid rgba(22,163,74,0.16)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M6 1l1.09 3.26L10.5 4.5l-2.59 2.09.91 3.41L6 8.25l-2.82 1.75.91-3.41L1.5 4.5l3.41-.24L6 1z" fill="rgba(134,239,172,0.8)"/>
                </svg>
                <span style={{ fontSize: 10, color: 'rgba(134,239,172,0.9)', fontWeight: 500 }}>
                  Recomendado:{' '}
                  <strong style={{ fontWeight: 700 }}>
                    {MODELS.find(m => m.id === recommendedModelId)!.label}
                  </strong>
                </span>
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 4, paddingLeft: 16 }}>
                {recommendedReason}
              </div>
            </div>

            {/* Mismatch hint — only visible when user picked a different model */}
            {selectedModel !== recommendedModelId && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 8px', borderRadius: 5, marginBottom: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="8" cy="8" r="7" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
                  <path d="M8 5v4M8 11v.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
                  Recomendamos{' '}
                  <strong style={{ fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>
                    {MODELS.find(m => m.id === recommendedModelId)!.label}
                  </strong>
                  {' '}para melhor resultado
                </span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${selectedModel === m.id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
                    background: selectedModel === m.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.15s, background 0.15s',
                    width: '100%',
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: selectedModel === m.id ? '#ffffff' : 'rgba(255,255,255,0.2)',
                    flexShrink: 0,
                    transition: 'background 0.15s',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: selectedModel === m.id ? '#ffffff' : 'rgba(255,255,255,0.6)', letterSpacing: '-0.01em' }}>
                        {m.label}
                      </span>
                      <span style={{ fontSize: 9, color: selectedModel === m.id ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)', letterSpacing: '0.01em' }}>
                        {m.tag}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                      {m.desc}
                    </div>
                  </div>
                  {m.badge && (
                    <span style={{
                      fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: m.badgeColor ?? 'rgba(255,255,255,0.4)',
                      background: `${m.badgeColor ?? 'rgba(255,255,255,0.1)'}22`,
                      border: `1px solid ${m.badgeColor ?? 'rgba(255,255,255,0.1)'}44`,
                      padding: '2px 6px', borderRadius: 20,
                      flexShrink: 0,
                    }}>
                      {m.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Scale selector */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 10 }}>
              Escala
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {SCALES.map(s => (
                <button
                  key={s.value}
                  onClick={() => !s.locked && setSelectedScale(s.value)}
                  disabled={s.locked}
                  title={s.locked ? 'Disponível no plano Nebula' : undefined}
                  style={{
                    flex: 1,
                    padding: '10px 8px',
                    borderRadius: 8,
                    border: `1px solid ${!s.locked && selectedScale === s.value ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)'}`,
                    background: !s.locked && selectedScale === s.value ? 'rgba(255,255,255,0.08)' : 'transparent',
                    cursor: s.locked ? 'not-allowed' : 'pointer',
                    opacity: s.locked ? 0.4 : 1,
                    textAlign: 'center',
                    transition: 'border-color 0.15s, background 0.15s',
                    position: 'relative',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: !s.locked && selectedScale === s.value ? '#ffffff' : 'rgba(255,255,255,0.5)', letterSpacing: '-0.01em' }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2, letterSpacing: '0.04em' }}>
                    {s.nodes} Nodes
                  </div>
                  {s.locked && (
                    <div style={{ position: 'absolute', top: 4, right: 6 }}>
                      <svg width="9" height="9" viewBox="0 0 14 16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round">
                        <rect x="2" y="7" width="10" height="8" rx="1.5"/>
                        <path d="M5 7V5a2 2 0 0 1 4 0v2"/>
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Description (conditional on model support) */}
          {activeModel.hasPrompt && (
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 10 }}>
                Descrição <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.6 }}>(opcional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: fachada residencial contemporânea, concreto aparente, madeira ipê..."
                rows={3}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 12,
                  color: '#ffffff',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              fontSize: 11,
              color: '#fca5a5',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer: credits + submit */}
        <div style={{ padding: '16px 24px', borderTop: '0.5px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              Custo: <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{nodeCost} Nodes</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              Saldo: <span style={{ color: credits > 0 ? 'rgba(255,255,255,0.7)' : '#f87171', fontWeight: 500 }}>{credits} Nodes</span>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!imageFile || credits < nodeCost || isLoading}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: 8,
              border: 'none',
              background: !imageFile || credits < nodeCost || isLoading
                ? 'rgba(255,255,255,0.07)'
                : 'rgba(255,255,255,0.92)',
              color: !imageFile || credits < nodeCost || isLoading
                ? 'rgba(255,255,255,0.25)'
                : '#0a0a0a',
              fontSize: 13,
              fontWeight: 600,
              cursor: !imageFile || credits < nodeCost || isLoading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s, color 0.15s',
              letterSpacing: '-0.01em',
            }}
          >
            {isLoading ? loadingText : credits < nodeCost ? 'Sem Nodes' : 'Ampliar Imagem'}
          </button>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, overflow: 'hidden' }}>

        {/* Loading overlay */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.1)',
              borderTop: '2px solid rgba(255,255,255,0.7)',
              animation: 'spin 0.9s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.02em' }}>
              {loadingText}
            </div>
          </div>
        )}

        {/* Before/After result */}
        {!isLoading && resultUrl && imagePreview && (
          <div style={{ width: '100%', maxWidth: 760 }}>
            <BeforeAfter
              beforeUrl={imagePreview}
              afterUrl={resultUrl}
              beforeLabel="ORIGINAL"
              afterLabel="UPSCALE"
            />
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
                Arraste para comparar · {selectedScale}× via {activeModel.label}
              </div>
              <a
                href={resultUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11, fontWeight: 500,
                  color: 'rgba(255,255,255,0.6)',
                  textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.12)',
                  transition: 'border-color 0.15s',
                }}
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

        {/* Empty state */}
        {!isLoading && !resultUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: 0.25 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M9 21V9"/>
              <path d="M15 13l3 3-3 3"/>
            </svg>
            <div style={{ fontSize: 12, letterSpacing: '0.02em' }}>
              O resultado aparecerá aqui
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
