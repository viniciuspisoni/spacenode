'use client'

// Overlay full-screen do modo embebido da Retocar (dentro do Spaces).
//
// Mostra canvas + painel lateral com DNA ativo + Vista Mestre como thumbnail.
// Difere do standalone: prompt simplificado, contexto enriquecido server-side,
// cria nova vista no Space (com is_edited + parent_vista_id + edit_chain_root_id).

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RetocarCanvas, type RetocarCanvasHandle, BRUSH_MIN, BRUSH_MAX } from './RetocarCanvas'
import { RetocarModeTabs } from './RetocarModeTabs'
import { getEditCost, LARGE_MASK_THRESHOLD } from '@/lib/spaces/edit-economy'
import type { Quality, Space, Vista, ProjectDNA } from '@/lib/spaces/types'
import { EDIT_MODE_LABELS, type EditMode } from '@/lib/spaces/engines'

interface Props {
  space:    Space
  vista:    Vista
  dna:      ProjectDNA | null
  balance:  number
  onClose:  () => void
}

export function RetocarOverlay({ space, vista, dna, balance, onClose }: Props) {
  const router = useRouter()
  const canvasRef = useRef<RetocarCanvasHandle | null>(null)

  const [brush, setBrush]           = useState(40)
  const [coverage, setCoverage]     = useState(0)
  const [prompt, setPrompt]         = useState('')
  const [quality, setQuality]       = useState<Quality>(vista.quality)
  // Edit intention. Same contract as RetocarStandaloneFlow.
  const [mode, setMode]             = useState<EditMode>('material')
  const [submitting, setSubmitting] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [showMestreLightbox, setShowMestreLightbox] = useState(false)
  const [resultUrl, setResultUrl]   = useState<string | null>(null)
  const [resultVistaId, setResultVistaId] = useState<string | null>(null)
  const [driftWarning, setDriftWarning] = useState<number | null>(null)
  const [stage, setStage]           = useState<'editing' | 'result'>('editing')

  const cost        = getEditCost(quality)
  const balanceShort = balance < cost
  const largeMask    = coverage > LARGE_MASK_THRESHOLD
  const modeMeta    = EDIT_MODE_LABELS[mode]
  const isRemove    = mode === 'remove'
  const disabledBtn = coverage === 0 || balanceShort || submitting || (!isRemove && !prompt.trim())

  async function handleGenerate() {
    if (!canvasRef.current?.hasMask()) {
      setError('Pinte a área que quer editar antes de gerar.')
      return
    }
    if (!isRemove && !prompt.trim()) {
      setError('Descreva o que você quer nessa área antes de gerar.')
      return
    }
    if (balanceShort) {
      setError(`Saldo insuficiente. Necessários ${cost} nodes.`)
      return
    }
    setError(null)
    setDriftWarning(null)
    setSubmitting(true)

    try {
      const blob = await canvasRef.current.getMaskBlob()
      if (!blob) throw new Error('Falha ao gerar máscara')
      const maskCoverage = canvasRef.current.getMaskCoverage()

      // Upload máscara
      const fd = new FormData()
      fd.append('file', new File([blob], 'mask.png', { type: 'image/png' }))
      fd.append('kind', 'mask')
      const maskRes = await fetch('/api/edits/upload-asset', { method: 'POST', body: fd })
      const maskData = await maskRes.json()
      if (!maskRes.ok) throw new Error(maskData?.error ?? 'Erro ao salvar máscara')

      // Chama edit embebido. `mode` é encaminhado pro router server-side.
      const res = await fetch(`/api/spaces/${space.id}/vistas/${vista.id}/edit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          mask_url:      maskData.url,
          prompt:        isRemove ? '' : prompt.trim(),
          quality,
          mask_coverage: maskCoverage,
          mode,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402) throw new Error(data?.message ?? 'Saldo insuficiente')
        throw new Error(data?.error ?? 'Erro na edição')
      }

      const newVista = data.vista as { id: string; image_url: string }
      setResultUrl(newVista.image_url)
      setResultVistaId(newVista.id)

      setValidating(true)
      try {
        const v = await canvasRef.current.validateOutsideMaskPreservation(newVista.image_url)
        if (!v.ok) setDriftWarning(v.drift)
      } finally {
        setValidating(false)
      }

      setStage('result')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  function acceptAsVersion() {
    if (!resultVistaId) return
    // A nova vista já foi criada no backend. Redireciona pra detalhe dela.
    router.push(`/app/spaces/${space.id}/vistas/${resultVistaId}`)
  }

  function redoEdit() {
    setStage('editing')
    setResultUrl(null)
    setResultVistaId(null)
    setDriftWarning(null)
    setError(null)
    // Mantém máscara e prompt
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(10,10,10,0.96)', backdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '0.5px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
            Retocar vista · {space.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            {vista.axis_label ?? 'Vista'} · {vista.quality.toUpperCase()}
            {stage === 'result' && ' · Resultado'}
          </div>
        </div>
        <button onClick={onClose} style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)',
          border: '0.5px solid var(--color-border-strong)', cursor: 'pointer',
          fontSize: 18,
        }}>×</button>
      </header>

      {/* Body */}
      <div style={{
        flex: 1, padding: 18,
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 18,
        minHeight: 0,
      }}>
        {/* Canvas + prompt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          {stage === 'editing' && vista.image_url && (
            <>
              <div style={{ flex: 1, minHeight: 0 }}>
                <RetocarCanvas
                  ref={canvasRef}
                  imageUrl={vista.image_url}
                  onMaskChange={setCoverage}
                  brush={brush}
                  onBrushChange={setBrush}
                />
              </div>

              <div style={{
                background: 'var(--color-bg-elevated)',
                border: '0.5px solid var(--color-border)',
                borderRadius: 12, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <RetocarModeTabs mode={mode} onModeChange={setMode} disabled={submitting} />

                <div style={{
                  fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em',
                }}>
                  {modeMeta.description}
                </div>

                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={isRemove
                    ? 'Não precisa de prompt — o motor preenche com o entorno automaticamente.'
                    : `${modeMeta.promptPlaceholder} · O motor já conhece o estilo do projeto.`
                  }
                  rows={2}
                  disabled={isRemove}
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'var(--color-bg)',
                    border: '0.5px solid var(--color-border-strong)',
                    borderRadius: 8, color: 'var(--color-text-primary)',
                    fontSize: 13, letterSpacing: '-0.005em',
                    fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                    opacity: isRemove ? 0.55 : 1,
                    cursor: isRemove ? 'not-allowed' : 'text',
                  }}
                />
                {error && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
                    color: '#e57373', fontSize: 12,
                  }}>
                    {error}
                  </div>
                )}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 10, flexWrap: 'wrap',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {coverage > 0 ? <>área: {(coverage * 100).toFixed(1)}%</> : 'pinte a área a editar'}
                    {largeMask && <span style={{ color: '#e0a766', marginLeft: 10 }}>⚠ área grande</span>}
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={disabledBtn}
                    className="spn-action"
                    style={{
                      width: 'auto', minWidth: 200, padding: '11px 22px',
                      background: '#1D9E75', color: '#042818',
                      border: '0.5px solid rgba(0,0,0,0.18)',
                      opacity: disabledBtn ? 0.5 : 1,
                      boxShadow: !disabledBtn
                        ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(29,158,117,0.18)'
                        : 'none',
                    }}
                  >
                    {submitting
                      ? (validating ? 'Validando…' : 'Editando…')
                      : `${modeMeta.label} · ${cost} nodes →`}
                  </button>
                </div>
              </div>
            </>
          )}

          {stage === 'result' && resultUrl && vista.image_url && (
            <ResultPane
              beforeUrl={vista.image_url}
              afterUrl={resultUrl}
              prompt={prompt}
              driftWarning={driftWarning}
              onAccept={acceptAsVersion}
              onRedo={redoEdit}
              onDiscard={onClose}
            />
          )}
        </div>

        {/* Painel lateral */}
        <aside style={{
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 12, padding: 16,
          display: 'flex', flexDirection: 'column', gap: 14,
          alignSelf: 'start', overflowY: 'auto', maxHeight: '100%',
        }}>
          <PanelLabel>Ferramentas</PanelLabel>

          {stage === 'editing' && (
            <>
              <div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Brush</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{brush}px</span>
                </div>
                <input
                  type="range" min={BRUSH_MIN} max={BRUSH_MAX} value={brush}
                  onChange={e => setBrush(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#1D9E75' }}
                />
              </div>

              <button onClick={() => canvasRef.current?.clearMask()}
                className="spn-action spn-action--ghost"
                style={{ width: '100%', padding: '8px 12px', fontSize: 11 }}>
                Limpar máscara
              </button>

              <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 12 }}>
                <PanelLabel>Qualidade</PanelLabel>
                <div style={{
                  display: 'flex', gap: 4, padding: 3, marginTop: 8,
                  background: 'var(--color-surface)', borderRadius: 8,
                }}>
                  {(['hd', '2k', '4k'] as Quality[]).map(q => {
                    const active = q === quality
                    return (
                      <button key={q} onClick={() => setQuality(q)}
                        style={{
                          flex: 1, padding: '5px 0', borderRadius: 6,
                          background: active ? 'var(--color-bg-elevated)' : 'transparent',
                          color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          fontSize: 11, fontWeight: 500,
                          cursor: 'pointer',
                          boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
                        }}>
                        {q.toUpperCase()}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* DNA ativo */}
          {dna && (
            <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 12 }}>
              <PanelLabel>DNA ativo</PanelLabel>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.55 }}>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: 'var(--color-text-quaternary)' }}>Estilo: </span>
                  {dna.estilo.nome}
                </div>
                {dna.materiais.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: 'var(--color-text-quaternary)' }}>Materiais: </span>
                    {dna.materiais.slice(0, 3).map(m => m.nome).join(', ')}
                  </div>
                )}
                {dna.paleta.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {dna.paleta.slice(0, 6).map((c, i) => (
                      <span key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '0.5px solid rgba(255,255,255,0.1)' }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Vista Mestre como thumb */}
          {space.vista_mestre_url && (
            <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 12 }}>
              <PanelLabel>Referência</PanelLabel>
              <button
                onClick={() => setShowMestreLightbox(true)}
                style={{
                  width: '100%', padding: 0, marginTop: 8, cursor: 'pointer',
                  border: '0.5px solid var(--color-border-strong)', borderRadius: 8,
                  background: 'transparent', overflow: 'hidden',
                }}
              >
                <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={space.vista_mestre_url} alt="Vista Mestre"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </button>
              <div style={{ fontSize: 10, color: 'var(--color-text-quaternary)', marginTop: 6, textAlign: 'center', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                vista mestre · ver maior
              </div>
            </div>
          )}

          {stage === 'editing' && (
            <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 12, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Saldo: <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{balance}</span> nodes
            </div>
          )}
        </aside>
      </div>

      {/* Lightbox Vista Mestre */}
      {showMestreLightbox && space.vista_mestre_url && (
        <div
          onClick={() => setShowMestreLightbox(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 110,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 40, cursor: 'zoom-out',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={space.vista_mestre_url} alt="Vista Mestre"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}

function ResultPane({ beforeUrl, afterUrl, prompt, driftWarning, onAccept, onRedo, onDiscard }: {
  beforeUrl:    string
  afterUrl:     string
  prompt:       string
  driftWarning: number | null
  onAccept:     () => void
  onRedo:       () => void
  onDiscard:    () => void
}) {
  const [sliderPos, setSliderPos] = useState(50)
  const ref = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  function move(clientX: number) {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const pct = ((clientX - r.left) / r.width) * 100
    setSliderPos(Math.max(0, Math.min(100, pct)))
  }
  return (
    <>
      {driftWarning !== null && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(186,117,23,0.12)', border: '0.5px solid rgba(186,117,23,0.3)',
          color: '#e0a766', fontSize: 12,
        }}>
          ⚠ Motor alterou {(driftWarning * 100).toFixed(1)}% dos pixels fora da máscara (acima do limite de 2%).
        </div>
      )}

      <div
        ref={ref}
        onPointerDown={e => { setDragging(true); move(e.clientX); (e.target as Element).setPointerCapture(e.pointerId) }}
        onPointerMove={e => { if (dragging) move(e.clientX) }}
        onPointerUp={() => setDragging(false)}
        style={{
          position: 'relative', flex: 1, minHeight: 0,
          borderRadius: 14, overflow: 'hidden',
          background: 'var(--color-bg-elevated)', cursor: 'ew-resize',
          userSelect: 'none', touchAction: 'none',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={afterUrl} alt="depois"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
        <div style={{ position: 'absolute', inset: 0, width: `${sliderPos}%`, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={beforeUrl} alt="antes"
            style={{ position: 'absolute', inset: 0, height: '100%', objectFit: 'contain', width: ref.current?.getBoundingClientRect().width ?? '100%' }} draggable={false} />
        </div>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: `${sliderPos}%`,
          width: 2, background: '#fff', transform: 'translateX(-1px)',
          boxShadow: '0 0 10px rgba(0,0,0,0.5)',
        }} />
      </div>

      <div style={{
        background: 'var(--color-bg-elevated)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 12, padding: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          &quot;{prompt}&quot;
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onDiscard} className="spn-action spn-action--ghost"
            style={{ width: 'auto', padding: '9px 16px', fontSize: 12, color: '#e57373' }}>
            Descartar
          </button>
          <button onClick={onRedo} className="spn-action spn-action--ghost"
            style={{ width: 'auto', padding: '9px 16px', fontSize: 12 }}>
            ↶ Refazer
          </button>
          <button onClick={onAccept} className="spn-action"
            style={{
              width: 'auto', padding: '9px 18px', fontSize: 12,
              background: '#1D9E75', color: '#042818',
              border: '0.5px solid rgba(0,0,0,0.18)',
            }}>
            ✓ Aceitar como nova versão
          </button>
        </div>
      </div>
    </>
  )
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--color-text-tertiary)',
    }}>
      {children}
    </div>
  )
}
