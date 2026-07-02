'use client'

// Canvas grande à esquerda. Renderiza um dos 5 estados:
//   empty       → EmptyAnimateState (convite ao upload)
//   uploaded    → preview estático com badge "Pronto para animar"
//   analyzing   → AnalyzingOverlay
//   generating  → VideoGenerationTimeline
//   success     → VideoResultActions
//   error       → mensagem de erro com botão "Tentar novamente"

import EmptyAnimateState from './EmptyAnimateState'
import AnalyzingOverlay from './AnalyzingOverlay'
import VideoGenerationTimeline from './VideoGenerationTimeline'
import VideoResultActions from './VideoResultActions'
import { useImageUpload } from '../_hooks/useImageUpload'
import { useRef, useState } from 'react'
import type { AnimateState } from '../_hooks/useAnimateState'

interface Props {
  state:              AnimateState
  onImagePicked:      (file: File, preview: string, wasCropped: boolean) => void
  onImageError:       (message: string) => void
  onClearImage:       () => void
  onGenerateAgain:    () => void
  onTryAnotherMotion: () => void
  onUseAsReference:   () => void
  onImprovePrompt:    () => void
  onClearError:       () => void
}

export default function VideoCreationCanvas({
  state,
  onImagePicked,
  onImageError,
  onClearImage,
  onGenerateAgain,
  onTryAnotherMotion,
  onUseAsReference,
  onImprovePrompt,
  onClearError,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const { loadFile } = useImageUpload({
    onLoaded: r => onImagePicked(r.file, r.preview, r.wasCropped),
    onError:  onImageError,
  })

  const renderEmpty = () => (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => {
        e.preventDefault(); setIsDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) loadFile(f)
      }}
      style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
    >
      <EmptyAnimateState
        isDragging={isDragging}
        onPick={() => fileInputRef.current?.click()}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f) }}
      />
    </div>
  )

  const renderUploaded = () => (
    <div style={{
      flex:        1,
      display:     'flex',
      alignItems:  'center',
      justifyContent: 'center',
      padding:     '24px 28px 40px',
      overflow:    'auto',
    }}>
      <div style={{ width: '100%', maxWidth: 720 }}>
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.imagePreview!}
            alt="preview"
            style={{ width: '100%', display: 'block', maxHeight: 460, objectFit: 'cover' }}
          />
          <div style={{
            position:     'absolute',
            top:          12,
            left:         12,
            padding:      '4px 10px',
            borderRadius: 20,
            background:   'var(--color-scrim)',
            border:       '0.5px solid rgba(255,255,255,0.18)',
            color:        'rgba(255,255,255,0.85)',
            fontSize:     10,
            fontWeight:   600,
            letterSpacing:'0.1em',
            textTransform:'uppercase',
            backdropFilter: 'blur(8px)',
          }}>
            {state.analysis ? 'Sugestões aplicadas' : 'Imagem carregada'}
          </div>
          <button
            type="button"
            onClick={onClearImage}
            style={{
              position:     'absolute',
              top:          12,
              right:        12,
              padding:      '5px 10px',
              borderRadius: 6,
              background:   'var(--color-scrim)',
              border:       '0.5px solid rgba(255,255,255,0.15)',
              color:        'rgba(255,255,255,0.75)',
              fontSize:     11,
              cursor:       'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            Trocar imagem
          </button>
        </div>

        {state.imageWasCropped && (
          <div style={{
            marginTop:  10,
            fontSize:   11,
            color:      'rgba(255,200,50,0.7)',
            textAlign:  'center',
          }}>
            Imagem foi recortada para uma proporção compatível com os modelos de vídeo.
          </div>
        )}

        {state.analysisError && (
          <div style={{
            marginTop:  10,
            fontSize:   11,
            color:      'var(--color-text-tertiary)',
            textAlign:  'center',
          }}>
            {state.analysisError} Você pode configurar manualmente no painel ao lado.
          </div>
        )}
      </div>
    </div>
  )

  const renderAnalyzing = () => (
    <div style={{
      flex:        1,
      display:     'flex',
      alignItems:  'center',
      justifyContent: 'center',
      padding:     '24px 28px 40px',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <AnalyzingOverlay preview={state.imagePreview} />
      </div>
    </div>
  )

  const renderGenerating = () => (
    <div style={{
      flex:        1,
      display:     'flex',
      alignItems:  'center',
      justifyContent: 'center',
      padding:     '24px 28px 40px',
    }}>
      <VideoGenerationTimeline
        preview={state.imagePreview}
        modelId={state.modelId}
        elapsed={state.elapsed}
      />
    </div>
  )

  const renderSuccess = () => state.result && (
    <div style={{
      flex:        1,
      display:     'flex',
      alignItems:  'center',
      justifyContent: 'center',
      padding:     '24px 28px 40px',
      overflow:    'auto',
    }}>
      <VideoResultActions
        result={state.result}
        onGenerateAgain={onGenerateAgain}
        onTryAnotherMotion={onTryAnotherMotion}
        onUseAsReference={onUseAsReference}
        onImprovePrompt={onImprovePrompt}
      />
    </div>
  )

  const renderError = () => (
    <div style={{
      flex:           1,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        32,
    }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, margin: '0 auto 16px',
          background: 'var(--color-error-bg)',
          border:     '0.5px solid var(--color-error-border)',
          color:      'var(--color-error)',
          display:    'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8"  x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div style={{ fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 8 }}>
          Não conseguimos gerar o vídeo
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.55 }}>
          {state.error ?? 'Erro desconhecido. Tente novamente.'}
        </div>
        <button
          type="button"
          onClick={onClearError}
          style={{
            marginTop:   18,
            padding:     '8px 16px',
            background:  'var(--color-surface-hover)',
            border:      '1px solid var(--color-border-strong)',
            color:       'var(--color-text-primary)',
            borderRadius:8,
            fontSize:    12,
            cursor:      'pointer',
          }}
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )

  if (state.status === 'error')      return renderError()
  if (state.status === 'success')    return renderSuccess()
  if (state.status === 'generating') return renderGenerating()
  if (state.status === 'analyzing')  return renderAnalyzing()
  if (state.imageFile)               return renderUploaded()
  return renderEmpty()
}
