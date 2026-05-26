'use client'

// Fluxo standalone da Retocar:
//   empty   → upload da imagem (ou Importar do histórico)
//   editing → canvas + brush + prompt + quality + action
//   result  → slider compare antes/depois + Salvar/Descartar/Editar de novo

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RetocarCanvas, type RetocarCanvasHandle, BRUSH_MIN, BRUSH_MAX } from './RetocarCanvas'
import { RetocarImportModal } from './RetocarImportModal'
import { RetocarModeTabs } from './RetocarModeTabs'
import { getEditCost, LARGE_MASK_THRESHOLD } from '@/lib/spaces/edit-economy'
import type { Quality, EditSourceType } from '@/lib/spaces/types'
import { EDIT_MODE_LABELS, type EditMode } from '@/lib/spaces/engines'

type Step = 'empty' | 'editing' | 'result'

interface Props {
  initialBalance: number
}

export function RetocarStandaloneFlow({ initialBalance }: Props) {
  const canvasRef = useRef<RetocarCanvasHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [step, setStep] = useState<Step>('empty')
  const [sourceUrl, setSourceUrl]     = useState<string | null>(null)
  const [sourceType, setSourceType]   = useState<EditSourceType>('upload')
  const [sourceId, setSourceId]       = useState<string | null>(null)
  const [resultUrl, setResultUrl]     = useState<string | null>(null)
  const [coverage, setCoverage]       = useState(0)
  const [brush, setBrush]             = useState(40)
  const [prompt, setPrompt]           = useState('')
  const [quality, setQuality]         = useState<Quality>('2k')
  // Edit intention. Default is 'material' (Google NB2/NB Pro, Flux fallback).
  // User can pick a different tab; the router decides which FAL endpoint to call.
  const [mode, setMode]               = useState<EditMode>('material')
  const [balance, setBalance]         = useState(initialBalance)
  const [submitting, setSubmitting]   = useState(false)
  const [validating, setValidating]   = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [showImport, setShowImport]   = useState(false)
  const [driftWarning, setDriftWarning] = useState<number | null>(null)

  const cost = getEditCost(quality)
  const balanceShort = balance < cost

  // ── upload da imagem ─────────────────────────────────────────
  async function uploadSourceFile(file: File) {
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'source')
    const res = await fetch('/api/edits/upload-asset', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error ?? 'Erro ao salvar imagem')
    return data.url as string
  }

  async function onFilePicked(f: File | null) {
    if (!f) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('Formato não suportado. Use JPG, PNG ou WebP.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Imagem maior que 10 MB.')
      return
    }
    setError(null)
    try {
      const url = await uploadSourceFile(f)
      setSourceUrl(url)
      setSourceType('upload')
      setSourceId(null)
      setStep('editing')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function onImportPicked(picked: { url: string; type: EditSourceType; id: string | null }) {
    setSourceUrl(picked.url)
    setSourceType(picked.type)
    setSourceId(picked.id)
    setShowImport(false)
    setStep('editing')
  }

  // ── gerar edit ───────────────────────────────────────────────
  async function handleGenerate() {
    if (!canvasRef.current?.hasMask()) {
      setError('Pinte a área que quer editar antes de gerar.')
      return
    }
    // 'remove' doesn't need a prompt — the model fills from surroundings.
    // For every other mode, the user must describe what they want.
    if (mode !== 'remove' && !prompt.trim()) {
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

      // Chama edit. `mode` is forwarded so the API routes to the right engine.
      // Prompt is sent even for 'remove' (server ignores it for that mode).
      const res = await fetch('/api/edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_image_url: sourceUrl,
          mask_url:         maskData.url,
          prompt:           mode === 'remove' ? '' : prompt.trim(),
          quality,
          source_type:      sourceType,
          source_id:        sourceId,
          mask_coverage:    maskCoverage,
          mode,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402) throw new Error(data?.message ?? 'Saldo insuficiente')
        throw new Error(data?.error ?? 'Erro na edição')
      }

      const outputUrl = data.result_url as string
      setResultUrl(outputUrl)
      if (data.balance_after?.total_balance != null) {
        setBalance(data.balance_after.total_balance as number)
      }

      // Validação pixel-a-pixel client-side fora da máscara.
      // Wrapped in its own try/catch so a canvas SecurityError (cross-origin CORS)
      // never blocks the user from seeing an already-successful edit result.
      setValidating(true)
      try {
        const v = await canvasRef.current.validateOutsideMaskPreservation(outputUrl)
        if (!v.ok) {
          setDriftWarning(v.drift)
        }
      } catch (valErr) {
        console.warn('[retocar] pixel validation skipped:', (valErr as Error).message)
      } finally {
        setValidating(false)
      }

      setStep('result')
    } catch (e) {
      console.error('[retocar] handleGenerate error:', e)
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  function discardResult() {
    setResultUrl(null)
    setDriftWarning(null)
    setStep('editing')
  }

  function editAgainOnResult() {
    if (!resultUrl) return
    setSourceUrl(resultUrl)
    setSourceType('edit')
    setSourceId(null)
    setResultUrl(null)
    setDriftWarning(null)
    setPrompt('')
    if (canvasRef.current) canvasRef.current.clearMask()
    setStep('editing')
  }

  function startOver() {
    setSourceUrl(null)
    setResultUrl(null)
    setDriftWarning(null)
    setPrompt('')
    setStep('empty')
  }

  return (
    <div style={{ width: '100%', maxWidth: 1240, margin: '0 auto', padding: '32px 24px 80px' }}>

      {/* Breadcrumb */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        fontSize: 12, color: 'var(--color-text-tertiary)',
        letterSpacing: '-0.005em', marginBottom: 24,
      }}>
        <Link href="/app">Workspace</Link>
        <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>Editar</span>
        {step === 'editing' && (
          <>
            <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
            <span>Editando</span>
          </>
        )}
        {step === 'result' && (
          <>
            <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
            <span>Resultado</span>
          </>
        )}
      </div>

      {step === 'empty' && (
        <EmptyStep
          onUpload={() => fileInputRef.current?.click()}
          onImport={() => setShowImport(true)}
          fileInputRef={fileInputRef}
          onFilePicked={onFilePicked}
          error={error}
        />
      )}

      {step === 'editing' && sourceUrl && (
        <EditingStep
          sourceUrl={sourceUrl}
          canvasRef={canvasRef}
          coverage={coverage}
          setCoverage={setCoverage}
          brush={brush}
          setBrush={setBrush}
          prompt={prompt}
          setPrompt={setPrompt}
          quality={quality}
          setQuality={setQuality}
          mode={mode}
          setMode={setMode}
          balance={balance}
          balanceShort={balanceShort}
          cost={cost}
          submitting={submitting}
          validating={validating}
          error={error}
          onGenerate={handleGenerate}
          onStartOver={startOver}
        />
      )}

      {step === 'result' && sourceUrl && resultUrl && (
        <ResultStep
          sourceUrl={sourceUrl}
          resultUrl={resultUrl}
          prompt={prompt}
          coverage={coverage}
          driftWarning={driftWarning}
          onEditAgain={editAgainOnResult}
          onDiscard={discardResult}
        />
      )}

      {showImport && (
        <RetocarImportModal
          onClose={() => setShowImport(false)}
          onPick={onImportPicked}
        />
      )}
    </div>
  )
}

// ── Step: empty (upload / import) ────────────────────────────

function EmptyStep({ onUpload, onImport, fileInputRef, onFilePicked, error }: {
  onUpload:     () => void
  onImport:     () => void
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>
  onFilePicked: (f: File | null) => void
  error:        string | null
}) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 26, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 8,
        }}>
          Editar
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
          Edite áreas específicas de qualquer imagem. Pinte a máscara, descreva o que quer
          naquela região, o resto fica intacto.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={e => onFilePicked(e.target.files?.[0] ?? null)}
        style={{ display: 'none' }}
      />

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          onFilePicked(e.dataTransfer.files[0] ?? null)
        }}
        onClick={onUpload}
        style={{
          maxWidth: 540, margin: '0 auto',
          aspectRatio: '4 / 3',
          background: dragOver ? 'rgba(48,209,88,0.04)' : 'var(--color-bg-elevated)',
          border: dragOver
            ? '1.5px dashed var(--color-accent-green)'
            : '0.5px dashed var(--color-border-strong)',
          borderRadius: 14,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 14, cursor: 'pointer', padding: 32,
          transition: 'background 0.2s, border-color 0.2s',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '-0.01em' }}>
          Suba uma imagem ou arraste aqui
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          JPG, PNG ou WebP até 10MB
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onImport() }}
          style={{
            marginTop: 10,
            fontSize: 12, color: 'var(--color-text-secondary)',
            background: 'transparent', cursor: 'pointer', padding: '6px 12px',
            border: '0.5px solid var(--color-border-strong)', borderRadius: 6,
          }}
        >
          ou Importar do histórico
        </button>
      </div>

      {error && (
        <div style={{
          maxWidth: 540, margin: '14px auto 0',
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
          color: '#e57373', fontSize: 13,
        }}>
          {error}
        </div>
      )}
    </>
  )
}

// ── Step: editing ────────────────────────────────────────────

function EditingStep(props: {
  sourceUrl:    string
  canvasRef:    React.MutableRefObject<RetocarCanvasHandle | null>
  coverage:     number
  setCoverage:  (v: number) => void
  brush:        number
  setBrush:     (v: number) => void
  prompt:       string
  setPrompt:    (v: string) => void
  quality:      Quality
  setQuality:   (q: Quality) => void
  mode:         EditMode
  setMode:      (m: EditMode) => void
  balance:      number
  balanceShort: boolean
  cost:         number
  submitting:   boolean
  validating:   boolean
  error:        string | null
  onGenerate:   () => void
  onStartOver:  () => void
}) {
  const {
    sourceUrl, canvasRef, coverage, setCoverage, brush, setBrush,
    prompt, setPrompt, quality, setQuality, mode, setMode,
    balance, balanceShort,
    cost, submitting, validating, error, onGenerate, onStartOver,
  } = props

  const largeMask  = coverage > LARGE_MASK_THRESHOLD
  const modeMeta   = EDIT_MODE_LABELS[mode]
  const isRemove   = mode === 'remove'
  // 'remove' is happy without a prompt; other modes require text before submit.
  const disabledBtn = coverage === 0 || balanceShort || submitting || (!isRemove && !prompt.trim())

  return (
    <div style={{
      display: 'grid', gap: 18,
      gridTemplateColumns: 'minmax(0, 1fr) 280px',
    }}>
      {/* Canvas + prompt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ height: 'calc(100vh - 360px)', minHeight: 420 }}>
          <RetocarCanvas
            ref={canvasRef}
            imageUrl={sourceUrl}
            onMaskChange={setCoverage}
            brush={brush}
            onBrushChange={setBrush}
          />
        </div>

        <div style={{
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 12, padding: 16,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Mode tabs — picks the architectural intention. Router maps it
              to the right FAL endpoint behind the scenes. */}
          <RetocarModeTabs mode={mode} onModeChange={setMode} disabled={submitting} />

          <div style={{
            fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em',
            marginTop: -4,
          }}>
            {modeMeta.description}
          </div>

          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={isRemove
              ? 'Não precisa de prompt — o motor preenche com o entorno automaticamente.'
              : modeMeta.promptPlaceholder
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
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
              color: '#e57373', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {coverage > 0
                ? <>área mascarada: {(coverage * 100).toFixed(1)}%</>
                : 'pinte a área a editar'}
              {largeMask && (
                <span style={{ color: '#e0a766', marginLeft: 10 }}>
                  ⚠ Área grande pode comprometer coerência
                </span>
              )}
            </div>
            <button
              onClick={onGenerate}
              disabled={disabledBtn}
              className="spn-action"
              style={{
                width: 'auto', minWidth: 220, padding: '12px 22px',
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
      </div>

      {/* Painel lateral */}
      <aside style={{
        background: 'var(--color-bg-elevated)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 12, padding: 16,
        display: 'flex', flexDirection: 'column', gap: 14,
        alignSelf: 'start',
      }}>
        <PanelLabel>Ferramentas</PanelLabel>

        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>Tamanho do brush</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>{brush}px</span>
          </div>
          <input
            type="range"
            min={BRUSH_MIN} max={BRUSH_MAX}
            value={brush}
            onChange={e => setBrush(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#1D9E75' }}
          />
          <div style={{ fontSize: 10, color: 'var(--color-text-quaternary)', marginTop: 4 }}>
            atalhos [ ]
          </div>
        </div>

        <button
          onClick={() => canvasRef.current?.clearMask()}
          className="spn-action spn-action--ghost"
          style={{ width: '100%', padding: '9px 14px', fontSize: 12 }}
        >
          Limpar máscara
        </button>

        <div style={{
          fontSize: 10, color: 'var(--color-text-quaternary)', lineHeight: 1.55,
          padding: 10, background: 'var(--color-bg)', borderRadius: 8,
        }}>
          atalhos:<br/>
          Cmd/Ctrl+Z desfazer · [ ] tamanho do brush
        </div>

        <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 14 }}>
          <PanelLabel>Qualidade</PanelLabel>
          <div style={{
            display: 'flex', gap: 4, padding: 3, marginTop: 8,
            background: 'var(--color-surface)', borderRadius: 8,
          }}>
            {(['hd', '2k', '4k'] as Quality[]).map(q => {
              const active = q === quality
              return (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 6,
                    background: active ? 'var(--color-bg-elevated)' : 'transparent',
                    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    fontSize: 11, fontWeight: 500, letterSpacing: '0.02em',
                    cursor: 'pointer',
                    boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
                  }}
                >
                  {q.toUpperCase()}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Saldo: <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{balance}</span> nodes
          </div>
          <button
            onClick={onStartOver}
            style={{
              marginTop: 10, fontSize: 11, color: 'var(--color-text-tertiary)',
              background: 'none', cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Trocar imagem
          </button>
        </div>
      </aside>
    </div>
  )
}

// ── Step: result ─────────────────────────────────────────────

function ResultStep({ sourceUrl, resultUrl, prompt, coverage, driftWarning, onEditAgain, onDiscard }: {
  sourceUrl:    string
  resultUrl:    string
  prompt:       string
  coverage:     number
  driftWarning: number | null
  onEditAgain:  () => void
  onDiscard:    () => void
}) {
  const [sliderPos, setSliderPos] = useState(50)
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{
          fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.025em', marginBottom: 6,
        }}>
          Resultado
        </h2>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Prompt: <span style={{ color: 'var(--color-text-secondary)' }}>&quot;{prompt}&quot;</span>
          <span style={{ marginLeft: 12 }}>· área editada: {(coverage * 100).toFixed(1)}%</span>
        </div>
      </div>

      {driftWarning !== null && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(186,117,23,0.12)', border: '0.5px solid rgba(186,117,23,0.3)',
          color: '#e0a766', fontSize: 12, letterSpacing: '-0.005em',
        }}>
          ⚠ O motor alterou {(driftWarning * 100).toFixed(1)}% dos pixels fora da máscara
          (acima do limite recomendado de 2%). Considere refazer ou ajustar a máscara.
        </div>
      )}

      <BeforeAfterSlider
        beforeUrl={sourceUrl}
        afterUrl={resultUrl}
        pos={sliderPos}
        setPos={setSliderPos}
      />

      <div style={{
        marginTop: 18, display: 'flex', gap: 10, justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        <button onClick={onDiscard} className="spn-action spn-action--ghost"
          style={{ width: 'auto', padding: '10px 18px', fontSize: 12, color: '#e57373' }}>
          Descartar
        </button>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onEditAgain} className="spn-action spn-action--ghost"
            style={{ width: 'auto', padding: '10px 18px', fontSize: 12 }}>
            ✦ Editar de novo
          </button>
          <a
            href={resultUrl} download="editar-result.jpg" target="_blank" rel="noopener noreferrer"
            className="spn-action spn-action--primary"
            style={{ width: 'auto', padding: '10px 18px', fontSize: 12, textDecoration: 'none' }}
          >
            ⤓ Download
          </a>
        </div>
      </div>
    </>
  )
}

function BeforeAfterSlider({ beforeUrl, afterUrl, pos, setPos }: {
  beforeUrl: string; afterUrl: string; pos: number; setPos: (n: number) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setContainerWidth(el.getBoundingClientRect().width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function move(clientX: number) {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const pct = ((clientX - r.left) / r.width) * 100
    setPos(Math.max(0, Math.min(100, pct)))
  }

  return (
    <div
      ref={ref}
      onPointerDown={e => { setDragging(true); move(e.clientX); (e.target as Element).setPointerCapture(e.pointerId) }}
      onPointerMove={e => { if (dragging) move(e.clientX) }}
      onPointerUp={() => setDragging(false)}
      style={{
        position: 'relative', width: '100%',
        aspectRatio: '4 / 3', borderRadius: 12, overflow: 'hidden',
        background: 'var(--color-bg-elevated)', cursor: 'ew-resize',
        userSelect: 'none', touchAction: 'none',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterUrl} alt="depois"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
      <div style={{ position: 'absolute', inset: 0, width: `${pos}%`, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={beforeUrl} alt="antes"
          style={{ position: 'absolute', inset: 0, height: '100%', objectFit: 'contain', width: containerWidth ?? '100%' }} draggable={false} />
      </div>
      {/* Cortina */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: `${pos}%`,
        width: 2, background: '#fff', transform: 'translateX(-1px)',
        boxShadow: '0 0 12px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 28, height: 28, borderRadius: 999, background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: '#1a1a1a',
        }}>
          ◂▸
        </div>
      </div>
      <div style={{
        position: 'absolute', top: 12, left: 12,
        padding: '4px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.55)',
        color: '#fff', fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>antes</div>
      <div style={{
        position: 'absolute', top: 12, right: 12,
        padding: '4px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.55)',
        color: '#fff', fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>depois</div>
    </div>
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
