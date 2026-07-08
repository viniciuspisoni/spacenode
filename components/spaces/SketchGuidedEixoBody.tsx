'use client'

// Body do eixo Ângulo — upload de sketches + lista editável + chips de
// sugestão de label + quality + action button.
//
// Cada sketch é uploadado individualmente (1 file por chamada de API).
// O batch só é disparado quando o usuário clica em "Gerar".

import { useMemo, useRef, useState } from 'react'
import { ENGINES, type EngineId, type Resolution } from '@/lib/engines'
import { getVistaGenerationCost } from '@/lib/spaces/economy'
import type { Axis, Quality } from '@/lib/spaces/types'
import type { PlanId } from '@/lib/plans'
import { InsufficientBalancePanel } from './InsufficientBalancePanel'
import { QualityPicker } from './EixosPanel'
import { uploadDirect } from '@/lib/storage/direct-upload-client'

const MAX_SKETCHES = 10
const MAX_BYTES    = 25 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

// O upload vai direto pro Storage (teto da área: 10 MB), mas sketch é material
// de trabalho — comprimir acima de 4 MB economiza banda e acelera o batch.
const COMPRESS_THRESHOLD = 4 * 1024 * 1024
const MAX_DIMENSION      = 2400
const JPEG_QUALITY       = 0.85

function scaleToFit(w: number, h: number, maxDim: number) {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h }
  const ratio = w > h ? maxDim / w : maxDim / h
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao decodificar imagem')) }
    img.src = url
  })
}

async function compressIfNeeded(file: File): Promise<File> {
  if (file.size <= COMPRESS_THRESHOLD) return file
  const img = await loadImage(file)
  const { width, height } = scaleToFit(img.width, img.height, MAX_DIMENSION)
  const canvas = document.createElement('canvas')
  canvas.width  = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) return file
  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], newName, { type: 'image/jpeg' })
}

export interface SketchPayload {
  url:    string
  label:  string | null
}

interface SketchItem {
  localId:    string
  file:       File
  previewUrl: string
  remoteUrl:  string | null      // URL pública depois do upload
  status:     'uploading' | 'uploaded' | 'failed'
  label:      string             // sempre string; "" significa sem label
  error?:     string
}

interface Props {
  axis:               Axis
  spaceId:            string
  engine:             EngineId
  quality:            Resolution
  setQuality:         (q: Resolution) => void
  availableQualities: Quality[]
  balance:            number
  planId:             PlanId
  disabled?:          boolean
  onGenerate:         (sketches: SketchPayload[], quality: Quality) => Promise<void>
  labelSuggestions:   string[]
}

export function SketchGuidedEixoBody({
  axis, spaceId, engine, quality, setQuality, availableQualities,
  balance, planId, disabled, onGenerate, labelSuggestions,
}: Props) {
  void axis
  const [items, setItems] = useState<SketchItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const readyCount = items.filter(i => i.status === 'uploaded').length
  const costPer = useMemo(() => getVistaGenerationCost(engine, quality), [engine, quality])
  const total   = costPer * readyCount
  const insufficient = total > balance && readyCount > 0

  const usedLabels = new Set(
    items.map(i => i.label.trim()).filter(l => l.length > 0)
  )

  function nextLocalId(): string {
    return `sk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  // ── upload pipeline ──────────────────────────────────────────

  async function uploadOne(item: SketchItem): Promise<void> {
    try {
      const compressed = await compressIfNeeded(item.file)
      // Direto browser → Storage (sem passar pela Vercel; ver direct-upload-client)
      const { url } = await uploadDirect(compressed, 'spaces-sketch', { spaceId })
      if (!url) throw new Error('Erro no upload')

      setItems(curr => curr.map(c =>
        c.localId === item.localId
          ? { ...c, remoteUrl: url, status: 'uploaded' as const }
          : c,
      ))
    } catch (e) {
      setItems(curr => curr.map(c =>
        c.localId === item.localId
          ? { ...c, status: 'failed' as const, error: (e as Error).message }
          : c,
      ))
    }
  }

  function addFiles(files: FileList | File[]) {
    setError(null)
    const list = Array.from(files)
    const slotsLeft = MAX_SKETCHES - items.length
    if (slotsLeft <= 0) {
      setError(`Limite de ${MAX_SKETCHES} sketches atingido — remova um pra adicionar outro.`)
      return
    }

    const accepted: SketchItem[] = []
    for (const f of list.slice(0, slotsLeft)) {
      if (!ALLOWED_MIME.includes(f.type)) {
        setError(`"${f.name}" não é um formato suportado (JPG, PNG ou WebP).`)
        continue
      }
      if (f.size > MAX_BYTES) {
        setError(`"${f.name}" é maior que 25 MB.`)
        continue
      }
      accepted.push({
        localId:    nextLocalId(),
        file:       f,
        previewUrl: URL.createObjectURL(f),
        remoteUrl:  null,
        status:     'uploading',
        label:      '',
      })
    }
    if (accepted.length === 0) return

    if (list.length > slotsLeft) {
      setError(`Apenas ${slotsLeft} sketches foram aceitos — limite de ${MAX_SKETCHES} por geração.`)
    }

    setItems(curr => [...curr, ...accepted])
    accepted.forEach(it => { void uploadOne(it) })
  }

  function removeItem(localId: string) {
    setItems(curr => {
      const it = curr.find(c => c.localId === localId)
      if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl)
      return curr.filter(c => c.localId !== localId)
    })
    setError(null)
  }

  function setLabel(localId: string, value: string) {
    setItems(curr => curr.map(c => c.localId === localId ? { ...c, label: value } : c))
  }

  function applySuggestion(label: string) {
    setItems(curr => {
      // Aplica no primeiro sketch ainda sem label
      const idx = curr.findIndex(c => c.label.trim().length === 0)
      if (idx === -1) return curr
      const next = curr.slice()
      next[idx] = { ...next[idx], label }
      return next
    })
  }

  function retryUpload(localId: string) {
    const it = items.find(c => c.localId === localId)
    if (!it) return
    setItems(curr => curr.map(c =>
      c.localId === localId ? { ...c, status: 'uploading' as const, error: undefined } : c,
    ))
    void uploadOne(it)
  }

  async function handleGenerate() {
    if (readyCount === 0 || submitting || disabled) return
    if (insufficient) {
      setError(`Saldo insuficiente. Necessários ${total} nodes.`)
      return
    }
    setError(null)
    setSubmitting(true)

    const ready = items.filter(i => i.status === 'uploaded' && i.remoteUrl)
    const sketches: SketchPayload[] = ready.map(i => ({
      url:   i.remoteUrl!,
      label: i.label.trim() || null,
    }))

    try {
      await onGenerate(sketches, quality)
      // clear após sucesso
      items.forEach(i => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl) })
      setItems([])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── render ──────────────────────────────────────────────────

  const limitReached = items.length >= MAX_SKETCHES

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.01em', marginBottom: 6,
        }}>
          Suba prints de sketch dos ângulos que você quer renderizar
        </div>
        <div style={{
          fontSize: 11, color: 'var(--color-text-secondary)',
          lineHeight: 1.5, marginBottom: 6,
        }}>
          O print que você enviar é a <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>base geométrica</strong> da
          geração — geometria, enquadramento e perspectiva são preservados. O DNA do projeto
          entra só como referência estética (materiais, luz e acabamento).
        </div>
        <div style={{
          fontSize: 11, color: 'var(--color-text-tertiary)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h0" strokeLinecap="round"/>
          </svg>
          Sketches limpos do SketchUp (modo Hidden Line) funcionam melhor
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
        style={{ display: 'none' }}
      />

      {/* Drop zone */}
      <button
        type="button"
        onClick={() => !limitReached && fileInputRef.current?.click()}
        onDragOver={e => { if (!limitReached) { e.preventDefault(); setDragOver(true) } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          if (limitReached) return
          if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
        }}
        disabled={limitReached}
        style={{
          width: '100%',
          padding: '24px 20px',
          background: limitReached
            ? 'var(--color-bg)'
            : dragOver ? 'rgba(48,209,88,0.04)' : 'var(--color-bg)',
          border: limitReached
            ? '0.5px dashed var(--color-border-strong)'
            : dragOver
              ? '1.5px dashed var(--color-accent-green)'
              : '0.5px dashed var(--color-border-strong)',
          borderRadius: 12,
          color: 'var(--color-text-tertiary)',
          cursor: limitReached ? 'not-allowed' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          transition: 'background 0.18s, border-color 0.18s',
          marginBottom: 18,
        }}
      >
        {limitReached ? (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="1.5"/>
              <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
            </svg>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Limite de {MAX_SKETCHES} atingido
            </span>
            <span style={{ fontSize: 11 }}>
              Remova um sketch pra adicionar outro
            </span>
          </>
        ) : (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '-0.01em' }}>
              Arraste sketches aqui ou clique pra upload
            </span>
            <span style={{ fontSize: 11 }}>
              JPG, PNG ou WebP · até {MAX_SKETCHES} sketches
            </span>
          </>
        )}
      </button>

      {/* Lista de sketches */}
      {items.length > 0 && (
        <>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)', marginBottom: 8,
          }}>
            Sketches ({items.length} de {MAX_SKETCHES})
          </div>
          <div style={{
            border: '0.5px solid var(--color-border)',
            borderRadius: 10, overflow: 'hidden',
            marginBottom: 18,
          }}>
            {items.map((it, i) => (
              <SketchListItem
                key={it.localId}
                item={it}
                isLast={i === items.length - 1}
                onLabelChange={(v) => setLabel(it.localId, v)}
                onRemove={() => removeItem(it.localId)}
                onRetry={() => retryUpload(it.localId)}
              />
            ))}
          </div>
        </>
      )}

      {/* Sugestões de label */}
      {items.length > 0 && labelSuggestions.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)', marginBottom: 8,
          }}>
            Sugestões de label
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {labelSuggestions.map(label => {
              const used = usedLabels.has(label)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => !used && applySuggestion(label)}
                  disabled={used}
                  className="spn-pill"
                  style={{
                    padding: '6px 12px', borderRadius: 999, fontSize: 11,
                    background: used ? 'var(--color-surface)' : 'transparent',
                    color: used ? 'var(--color-text-quaternary)' : 'var(--color-text-secondary)',
                    border: '0.5px solid var(--color-border-strong)',
                    cursor: used ? 'not-allowed' : 'pointer',
                    letterSpacing: '-0.005em',
                    textDecoration: used ? 'line-through' : 'none',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14,
          background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
          color: '#e57373', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Quality */}
      <QualityPicker
        engine={engine} quality={quality} setQuality={setQuality}
        availableQualities={availableQualities}
      />

      {/* Action / Insufficient */}
      <div style={{ marginTop: 16 }}>
        {insufficient ? (
          <InsufficientBalancePanel
            count={readyCount}
            costPer={costPer}
            total={total}
            available={balance}
            currentPlan={planId}
            onReduceTo={(n) => {
              // Mantém os primeiros N sketches uploadados
              setItems(curr => {
                const ready = curr.filter(c => c.status === 'uploaded')
                const others = curr.filter(c => c.status !== 'uploaded')
                ready.slice(n).forEach(it => { if (it.previewUrl) URL.revokeObjectURL(it.previewUrl) })
                return [...ready.slice(0, n), ...others]
              })
            }}
          />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 14, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {readyCount > 0
                ? <>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{readyCount} sketch{readyCount === 1 ? '' : 'es'}</span>
                    <span style={{ marginLeft: 8 }}>· {ENGINES[engine].name} {quality.toUpperCase()} = {total} nodes</span>
                  </>
                : items.length > 0
                  ? `aguardando uploads… (${items.filter(i => i.status === 'uploading').length} pendentes)`
                  : 'suba pelo menos 1 sketch pra gerar'}
            </div>
            <button
              onClick={handleGenerate}
              disabled={readyCount === 0 || submitting || disabled}
              className="spn-action"
              style={{
                width: 'auto', minWidth: 220, padding: '12px 22px',
                background: '#1D9E75', color: '#042818',
                border: '0.5px solid rgba(0,0,0,0.18)',
                opacity: readyCount === 0 ? 0.5 : 1,
                boxShadow: readyCount > 0
                  ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(29,158,117,0.18)'
                  : 'none',
              }}
            >
              {submitting
                ? 'Gerando…'
                : `Gerar ${readyCount > 0 ? `${readyCount} variaç${readyCount === 1 ? 'ão' : 'ões'} · ${total} nodes` : 'variações'} →`}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Sketch list item ──────────────────────────────────────────

function SketchListItem({ item, isLast, onLabelChange, onRemove, onRetry }: {
  item:          SketchItem
  isLast:        boolean
  onLabelChange: (v: string) => void
  onRemove:      () => void
  onRetry:       () => void
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderBottom: isLast ? 'none' : '0.5px solid var(--color-border)',
      background: item.status === 'failed' ? 'rgba(163,45,45,0.06)' : 'transparent',
    }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 12px',
    }}>
      {/* Thumbnail */}
      <div style={{
        position: 'relative', flexShrink: 0,
        width: 60, height: 60, borderRadius: 8, overflow: 'hidden',
        background: 'var(--color-surface)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.previewUrl} alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {item.status === 'uploading' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 18, height: 18, border: '2px solid #fff',
              borderTopColor: 'transparent', borderRadius: 999,
              animation: 'sketchSpin 0.8s linear infinite',
            }} />
            <style>{`@keyframes sketchSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
        {item.status === 'failed' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(163,45,45,0.6)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 16, fontWeight: 700,
          }}>
            !
          </div>
        )}
      </div>

      {/* Label input */}
      <input
        type="text"
        value={item.label}
        onChange={e => onLabelChange(e.target.value)}
        placeholder="Nome do ângulo (opcional)"
        maxLength={48}
        style={{
          flex: 1, minWidth: 0,
          padding: '8px 12px', borderRadius: 7,
          background: 'var(--color-bg)',
          border: '0.5px solid var(--color-border-strong)',
          color: 'var(--color-text-primary)',
          fontSize: 12, letterSpacing: '-0.005em',
          outline: 'none',
        }}
      />

      {/* Status / actions */}
      {item.status === 'failed' ? (
        <button
          onClick={onRetry}
          style={{
            padding: '6px 10px', fontSize: 11, borderRadius: 6,
            background: 'transparent', color: '#e57373',
            border: '0.5px solid rgba(163,45,45,0.4)',
            cursor: 'pointer',
          }}
        >
          ↻ Reenviar
        </button>
      ) : null}

      <button
        onClick={onRemove}
        title="Remover"
        style={{
          flexShrink: 0,
          width: 28, height: 28, borderRadius: 6,
          background: 'transparent', color: 'var(--color-text-tertiary)',
          border: '0.5px solid var(--color-border-strong)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18"/>
          <line x1="6" y1="18" x2="18" y2="6"/>
        </svg>
      </button>
    </div>
    {item.status === 'failed' && item.error && (
      <div style={{
        padding: '0 12px 10px 84px',
        fontSize: 11, color: '#e57373', lineHeight: 1.4,
      }}>
        {item.error}
      </div>
    )}
    </div>
  )
}
