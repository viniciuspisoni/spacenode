'use client'

import { useState, useRef, useEffect } from 'react'

interface VideoClientProps {
  initialCredits: number
}

const ENGINES = [
  {
    id:              'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    label:           'Rápido',
    tag:             'Mais ágil',
    desc:            'Geração mais rápida, movimento natural, ideal para revisão interna',
    badge:           null as string | null,
    badgeColor:      null as string | null,
    nodesByDuration: { '5': 30, '10': 55 } as Record<string, number>,
  },
  {
    id:              'fal-ai/kling-video/v3/pro/image-to-video',
    label:           'Cinemático',
    tag:             'Melhor qualidade',
    desc:            'Máxima fidelidade arquitetônica, movimentos premium para entrega final',
    badge:           'RECOMENDADO' as string | null,
    badgeColor:      '#16a34a' as string | null,
    nodesByDuration: { '5': 35, '10': 70 } as Record<string, number>,
  },
]

const DURATIONS = [
  { value: '5',  label: '5s'  },
  { value: '10', label: '10s' },
]

const MOTION_PRESETS = [
  { id: 'push_in',   label: 'Aproximar'          },
  { id: 'pull_out',  label: 'Afastar'            },
  { id: 'pan_right', label: 'Pan lateral'        },
  { id: 'crane_up',  label: 'Subir levemente'    },
  { id: 'orbit',     label: 'Órbita suave'       },
  { id: 'walk_in',   label: 'Travelling interno' },
  { id: 'static',    label: 'Câmera estática'    },
]

const LOADING_TEXTS = [
  'Enviando imagem...',
  'Analisando composição...',
  'Configurando câmera...',
  'Gerando frames...',
  'Processando vídeo...',
  'Finalizando animação...',
  'Quase pronto...',
]

function formatElapsed(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

export default function VideoClient({ initialCredits }: VideoClientProps) {
  const [imageFile,        setImageFile]        = useState<File | null>(null)
  const [imagePreview,     setImagePreview]     = useState<string | null>(null)
  const [selectedEngine,   setSelectedEngine]   = useState(ENGINES[1].id)
  const [selectedDuration, setSelectedDuration] = useState('5')
  const [selectedMotion,   setSelectedMotion]   = useState('push_in')
  const [customPrompt,     setCustomPrompt]     = useState('')
  const [isLoading,        setIsLoading]        = useState(false)
  const [loadingText,      setLoadingText]      = useState(LOADING_TEXTS[0])
  const [elapsed,          setElapsed]          = useState(0)
  const [resultUrl,        setResultUrl]        = useState<string | null>(null)
  const [credits,          setCredits]          = useState(initialCredits)
  const [error,            setError]            = useState<string | null>(null)
  const [wasCropped,       setWasCropped]       = useState(false)
  const [isDragging,       setIsDragging]       = useState(false)

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const loadingInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeEngine = ENGINES.find(e => e.id === selectedEngine)!
  const nodeCost     = activeEngine.nodesByDuration[selectedDuration] ?? 30

  useEffect(() => {
    if (!isLoading) {
      if (elapsedInterval.current) clearInterval(elapsedInterval.current)
      return
    }
    elapsedInterval.current = setInterval(() => setElapsed(n => n + 1), 1000)
    return () => { if (elapsedInterval.current) clearInterval(elapsedInterval.current) }
  }, [isLoading])

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Arquivo deve ser uma imagem.'); return }
    if (file.size > 20 * 1024 * 1024)   { setError('Imagem muito grande. Máximo 20 MB.'); return }

    const reader = new FileReader()
    reader.onload = e => {
      const src = e.target?.result as string
      const img = new Image()
      img.onload = () => {
        const ratio = img.width / img.height
        const needsCrop = ratio < 0.4 || ratio > 2.5

        if (!needsCrop) {
          setImageFile(file)
          setImagePreview(src)
          setResultUrl(null)
          setError(null)
          setWasCropped(false)
          return
        }

        // Center-crop to nearest valid boundary
        const canvas  = document.createElement('canvas')
        const ctx     = canvas.getContext('2d')!
        if (ratio < 0.4) {
          // Too tall — crop height
          canvas.width  = img.width
          canvas.height = Math.round(img.width / 0.4)
          ctx.drawImage(img, 0, -Math.round((img.height - canvas.height) / 2))
        } else {
          // Too wide — crop width
          canvas.width  = Math.round(img.height * 2.5)
          canvas.height = img.height
          ctx.drawImage(img, -Math.round((img.width - canvas.width) / 2), 0)
        }

        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95)
        canvas.toBlob(blob => {
          if (!blob) return
          setImageFile(new File([blob], file.name, { type: 'image/jpeg' }))
          setImagePreview(croppedDataUrl)
          setResultUrl(null)
          setError(null)
          setWasCropped(true)
        }, 'image/jpeg', 0.95)
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  function startLoadingTexts() {
    let i = 0
    setLoadingText(LOADING_TEXTS[0])
    loadingInterval.current = setInterval(() => {
      i = (i + 1) % LOADING_TEXTS.length
      setLoadingText(LOADING_TEXTS[i])
    }, 3000)
  }

  function stopLoadingTexts() {
    if (loadingInterval.current) clearInterval(loadingInterval.current)
  }

  async function handleSubmit() {
    if (!imageFile || credits < nodeCost || isLoading) return
    setIsLoading(true)
    setElapsed(0)
    setError(null)
    setResultUrl(null)
    startLoadingTexts()

    const body = new FormData()
    body.append('image',    imageFile)
    body.append('engine',   selectedEngine)
    body.append('duration', selectedDuration)
    body.append('motion',   selectedMotion)
    body.append('prompt',   customPrompt)

    try {
      const res  = await fetch('/api/video', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro desconhecido'); return }
      setResultUrl(data.url)
      setCredits(c => c - nodeCost)
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      stopLoadingTexts()
      setIsLoading(false)
    }
  }

  const canSubmit = !!imageFile && credits >= nodeCost && !isLoading

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0a0a', color: '#ffffff' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Painel esquerdo ──────────────────────────────────────────────── */}
      <div style={{
        width: 420, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '0.5px solid rgba(255,255,255,0.07)',
        overflow: 'hidden',
      }}>

        {/* Cabeçalho */}
        <div style={{ padding: '24px 24px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Animar Render</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
            Transforme uma imagem estática em um vídeo curto para apresentar seu projeto.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Upload */}
          <div>
            <label style={L}>Imagem</label>
            <div
              onClick={() => !isLoading && fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault(); setIsDragging(false)
                if (!isLoading) { const f = e.dataTransfer.files[0]; if (f) loadImageFile(f) }
              }}
              style={{
                border: `1.5px dashed ${isDragging ? 'rgba(255,255,255,0.4)' : imageFile ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 10, overflow: 'hidden',
                padding: imageFile ? 0 : '28px 20px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: isLoading ? 'default' : 'pointer',
                background: isDragging ? 'rgba(255,255,255,0.04)' : 'transparent',
                transition: 'border-color 0.15s, background 0.15s',
                minHeight: imageFile ? 0 : 120,
              }}
            >
              {imageFile ? (
                <img src={imagePreview!} alt="preview" style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'cover' }} />
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 10 }}>Arraste ou clique para enviar</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>PNG, JPG, WEBP — até 20 MB</span>
                </>
              )}
            </div>
            {imageFile && !isLoading && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {wasCropped ? (
                  <span style={{ fontSize: 10, color: 'rgba(255,200,50,0.6)' }}>
                    Recortada automaticamente para proporção compatível
                  </span>
                ) : <span />}
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null); setResultUrl(null); setWasCropped(false) }}
                  style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Trocar imagem
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) loadImageFile(f) }} />
          </div>

          {/* Motor */}
          <div>
            <label style={L}>Motor</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ENGINES.map(engine => (
                <button
                  key={engine.id}
                  onClick={() => !isLoading && setSelectedEngine(engine.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8, textAlign: 'left', width: '100%',
                    border: `1px solid ${selectedEngine === engine.id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
                    background: selectedEngine === engine.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                    cursor: isLoading ? 'default' : 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: selectedEngine === engine.id ? '#ffffff' : 'rgba(255,255,255,0.2)',
                    transition: 'background 0.15s',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '-0.01em', color: selectedEngine === engine.id ? '#ffffff' : 'rgba(255,255,255,0.6)' }}>
                        {engine.label}
                      </span>
                      <span style={{ fontSize: 9, color: selectedEngine === engine.id ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)' }}>
                        {engine.tag}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{engine.desc}</div>
                  </div>
                  {engine.badge && (
                    <span style={{
                      fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: engine.badgeColor ?? 'rgba(255,255,255,0.4)',
                      background: `${engine.badgeColor ?? 'rgba(255,255,255,0.1)'}22`,
                      border: `1px solid ${engine.badgeColor ?? 'rgba(255,255,255,0.1)'}44`,
                      padding: '2px 6px', borderRadius: 20, flexShrink: 0,
                    }}>
                      {engine.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Duração */}
          <div>
            <label style={L}>Duração</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {DURATIONS.map(d => {
                const cost    = activeEngine.nodesByDuration[d.value]
                const active  = selectedDuration === d.value
                return (
                  <button
                    key={d.value}
                    onClick={() => !isLoading && setSelectedDuration(d.value)}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 8, textAlign: 'center',
                      border: `1px solid ${active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)'}`,
                      background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                      cursor: isLoading ? 'default' : 'pointer',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: active ? '#ffffff' : 'rgba(255,255,255,0.5)' }}>
                      {d.label}
                    </div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2, letterSpacing: '0.04em' }}>
                      {cost} nodes
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Movimento de câmera */}
          <div>
            <label style={L}>Movimento de câmera</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {MOTION_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => !isLoading && setSelectedMotion(p.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 11, letterSpacing: '-0.01em',
                    border: `1px solid ${selectedMotion === p.id ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.09)'}`,
                    background: selectedMotion === p.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: selectedMotion === p.id ? '#ffffff' : 'rgba(255,255,255,0.5)',
                    cursor: isLoading ? 'default' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt adicional */}
          <div>
            <label style={L}>
              Prompt adicional{' '}
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.6 }}>(opcional)</span>
            </label>
            <textarea
              value={customPrompt}
              onChange={e => !isLoading && setCustomPrompt(e.target.value)}
              placeholder="Ex: fachada de concreto aparente, jardim com movimento sutil de árvores..."
              rows={3}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8,
                padding: '10px 12px', fontSize: 12, color: '#ffffff',
                resize: 'none', outline: 'none', fontFamily: 'inherit',
                lineHeight: 1.5, boxSizing: 'border-box',
                opacity: isLoading ? 0.5 : 1,
              }}
            />
          </div>

          {/* Erro */}
          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              fontSize: 11, color: '#fca5a5',
            }}>
              {error}
            </div>
          )}

        </div>

        {/* Rodapé */}
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
            disabled={!canSubmit}
            style={{
              width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
              background: canSubmit ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.07)',
              color: canSubmit ? '#0a0a0a' : 'rgba(255,255,255,0.25)',
              fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {isLoading ? loadingText : credits < nodeCost ? 'Sem Nodes' : 'Gerar Vídeo'}
          </button>
        </div>
      </div>

      {/* ── Painel direito ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, overflow: 'hidden' }}>

        {/* Loading */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, maxWidth: 360, width: '100%' }}>
            {imagePreview && (
              <div style={{ position: 'relative', width: '100%', borderRadius: 12, overflow: 'hidden' }}>
                <img src={imagePreview} alt="render" style={{ width: '100%', display: 'block', maxHeight: 300, objectFit: 'cover', filter: 'brightness(0.3)' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.12)',
                    borderTop: '2px solid rgba(255,255,255,0.7)',
                    animation: 'spin 0.9s linear infinite',
                  }} />
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.02em' }}>{loadingText}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>{formatElapsed(elapsed)}</div>
                </div>
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Vídeos levam entre 1 e 4 minutos.</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>Mantenha esta aba aberta enquanto gera.</div>
            </div>
          </div>
        )}

        {/* Resultado */}
        {!isLoading && resultUrl && (
          <div style={{ width: '100%', maxWidth: 720 }}>
            <video
              src={resultUrl}
              autoPlay
              loop
              muted
              playsInline
              controls
              style={{ width: '100%', borderRadius: 12, display: 'block', background: '#111' }}
            />
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
                {activeEngine.label} · {selectedDuration}s · {MOTION_PRESETS.find(p => p.id === selectedMotion)?.label}
              </div>
              <a
                href={resultUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)',
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
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
                Baixar vídeo
              </a>
            </div>
          </div>
        )}

        {/* Estado vazio */}
        {!isLoading && !resultUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: 0.2 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
            <div style={{ fontSize: 12, letterSpacing: '0.02em' }}>O vídeo aparecerá aqui</div>
          </div>
        )}

      </div>
    </div>
  )
}

// Label reutilizável para seções do painel
const L: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
  display: 'block', marginBottom: 10,
}
