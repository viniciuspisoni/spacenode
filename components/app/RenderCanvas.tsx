'use client'

import { useEffect, useState } from 'react'
import BeforeAfter from './BeforeAfter'

export type CanvasState = 'idle' | 'generating' | 'done'

const LOADING_TEXTS = [
  'analisando projeto…',
  'ajustando iluminação…',
  'refinando materiais…',
  'calculando sombras…',
  'finalizando render…',
]

interface RenderCanvasProps {
  state: CanvasState
  inputUrl: string | null
  outputUrl: string | null
  onDownload: () => void
  onVariation: () => void
  onUpscale: () => void
  onShare: () => void
}

export default function RenderCanvas({
  state,
  inputUrl,
  outputUrl,
  onDownload,
  onVariation,
  onUpscale,
  onShare,
}: RenderCanvasProps) {
  const [textIdx, setTextIdx] = useState(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state !== 'generating') { setTextIdx(0); return }
    const t = setInterval(() => setTextIdx((i) => (i + 1) % LOADING_TEXTS.length), 1400)
    return () => clearInterval(t)
  }, [state])

  /* ── IDLE ── */
  if (state === 'idle') {
    return (
      <div className="w-full h-full min-h-[420px] flex flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed border-border">
        <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <rect x="2" y="5" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.4" className="text-text-tertiary" />
            <circle cx="8.5" cy="10.5" r="2" stroke="currentColor" strokeWidth="1.4" className="text-text-tertiary" />
            <path d="M2 17l5.5-4 4.5 3 5-5.5 7 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-text-tertiary" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-text-secondary">
            envie um projeto para começar
          </p>
          <p className="mt-1 text-xs text-text-tertiary">o render aparecerá aqui</p>
        </div>
      </div>
    )
  }

  /* ── GENERATING ── */
  if (state === 'generating') {
    return (
      <div className="w-full h-full min-h-[420px] flex flex-col items-center justify-center gap-6 rounded-2xl border border-border bg-surface">
        {inputUrl && (
          <div className="relative w-full max-w-sm aspect-[4/3] rounded-xl overflow-hidden">
            <img
              src={inputUrl}
              alt="input"
              className="w-full h-full object-cover opacity-25 blur-sm"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-text-primary border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        )}
        <div className="text-center px-6">
          <p className="text-sm font-medium text-text-primary animate-pulse">
            {LOADING_TEXTS[textIdx]}
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
            isso leva cerca de 15 segundos
          </p>
        </div>
      </div>
    )
  }

  /* ── DONE ── */
  return (
    <div className="w-full h-full flex flex-col gap-4">
      {inputUrl && outputUrl ? (
        <BeforeAfter beforeUrl={inputUrl} afterUrl={outputUrl} />
      ) : outputUrl ? (
        <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden">
          <img src={outputUrl} alt="render" className="w-full h-full object-cover" />
        </div>
      ) : null}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <ActionBtn icon={<DownloadIcon />} label="Baixar" onClick={onDownload} primary />
        <ActionBtn icon={<VariationIcon />} label="Variação" onClick={onVariation} />
        <ActionBtn icon={<UpscaleIcon />} label="Upscale" onClick={onUpscale} />
        <ActionBtn icon={<ShareIcon />} label="Compartilhar" onClick={onShare} />
      </div>
    </div>
  )
}

function ActionBtn({
  icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 hover:-translate-y-px active:scale-[0.98] ${
        primary
          ? 'bg-text-primary text-bg hover:opacity-90'
          : 'bg-surface text-text-secondary border border-border hover:bg-surface-hover hover:text-text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1v8M4 6l3 3 3-3M1 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function VariationIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7a5 5 0 0 1 5-5M12 7a5 5 0 0 1-5 5M5 7h6M8 5l3 2-3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UpscaleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 13 13 1M8.5 1H13v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="11" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="3" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.4 6.3 9.6 3.7M4.4 7.7l5.2 2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
