'use client'

// Canvas grande à esquerda. Renderiza um dos estados:
//   empty       → EmptyAnimateState (proposta de valor + upload)
//   uploaded    → preview com badge e nota de preservação
//   analyzing   → AnalyzingOverlay
//   generating  → VideoGenerationTimeline
//   success     → VideoResultActions (tela de resultado premium)
//   error       → mensagem clara com ação de retry

import EmptyAnimateState from './EmptyAnimateState'
import AnalyzingOverlay from './AnalyzingOverlay'
import VideoGenerationTimeline from './VideoGenerationTimeline'
import VideoResultActions from './VideoResultActions'
import { useImageUpload } from '../_hooks/useImageUpload'
import { useRef, useState } from 'react'
import type { AnimateState } from '../_hooks/useAnimateState'

interface Props {
  state:              AnimateState
  configLine:         string   // resumo curto da config p/ estados de espera
  onImagePicked:      (file: File, preview: string, wasCropped: boolean) => void
  onImageError:       (message: string) => void
  onPickFromHistory:  () => void
  onClearImage:       () => void
  onGenerateAgain:    () => void
  onAdjust:           () => void
  onUseAsReference:   () => void
  onClearError:       () => void
}

export default function VideoCreationCanvas({
  state,
  configLine,
  onImagePicked,
  onImageError,
  onPickFromHistory,
  onClearImage,
  onGenerateAgain,
  onAdjust,
  onUseAsReference,
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
        onPickFromHistory={onPickFromHistory}
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
      <div style={{ width: '100%', maxWidth: 760 }}>
        <div style={{
          position:     'relative',
          borderRadius: 14,
          overflow:     'hidden',
          border:       '0.5px solid var(--color-border)',
          background:   'var(--color-preview-bg)',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.imagePreview!}
            alt="Imagem base do projeto"
            style={{ width: '100%', display: 'block', maxHeight: 480, objectFit: 'contain' }}
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
            {state.analysis ? 'Imagem analisada' : 'Pronto para gerar'}
          </div>
          <div style={{
            position: 'absolute',
            top:      12,
            right:    12,
            display:  'flex',
            gap:      6,
          }}>
            <button
              type="button"
              onClick={onPickFromHistory}
              style={overlayChipStyle}
            >
              Do histórico
            </button>
            <button
              type="button"
              onClick={onClearImage}
              style={overlayChipStyle}
            >
              Trocar imagem
            </button>
          </div>
        </div>

        <div style={{
          marginTop:      12,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            6,
          fontSize:       11,
          color:          'var(--color-text-tertiary)',
          textAlign:      'center',
        }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"
            stroke="var(--color-accent-green-dim)" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M3 8.5 L6.5 12 L13 4.5"/>
          </svg>
          Composição, materiais e mobiliário serão preservados no vídeo.
        </div>

        {state.imageWasCropped && (
          <div style={{
            marginTop:  8,
            fontSize:   11,
            color:      'var(--color-warning)',
            textAlign:  'center',
          }}>
            A imagem foi recortada para uma proporção compatível com os motores de vídeo.
          </div>
        )}

        {state.analysisError && (
          <div style={{
            marginTop:  8,
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
        configLine={configLine}
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
        onAdjust={onAdjust}
        onUseAsReference={onUseAsReference}
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
        <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 8 }}>
          Se houve cobrança, os Nodes são devolvidos automaticamente.
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

const overlayChipStyle: React.CSSProperties = {
  padding:      '5px 10px',
  borderRadius: 6,
  background:   'var(--color-scrim)',
  border:       '0.5px solid rgba(255,255,255,0.15)',
  color:        'rgba(255,255,255,0.75)',
  fontSize:     11,
  cursor:       'pointer',
  backdropFilter: 'blur(8px)',
}
