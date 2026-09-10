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
          borderRadius: 'var(--r-card)',
          overflow:     'hidden',
          background:   'var(--color-preview-bg)',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.imagePreview!}
            alt="Imagem base do projeto"
            style={{ width: '100%', display: 'block', maxHeight: 480, objectFit: 'contain' }}
          />
          {/* Vidro elevado em vez de um scrim com blur inline: assim o chip
              acompanha o tema e cai no sólido junto com o resto quando o
              usuário pede menos transparência. */}
          <div className="spn-glass spn-glass--raised" style={{
            position:     'absolute',
            top:          12,
            left:         12,
            padding:      '4px 10px',
            borderRadius: 999,
            color:        'var(--color-text-secondary)',
            fontSize:     10,
            fontWeight:   600,
            letterSpacing:'0.1em',
            textTransform:'uppercase',
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
            <button type="button" className="spn-ghost" onClick={onPickFromHistory} style={overlayChipStyle}>
              Do histórico
            </button>
            <button type="button" className="spn-ghost" onClick={onClearImage} style={overlayChipStyle}>
              Trocar imagem
            </button>
          </div>
        </div>

        {/* A garantia de preservação e o que a análise achou nesta imagem
            específica. Estava no painel, entre os controles; aqui fica ao lado
            da imagem de que fala — e o painel ganhou o silêncio de volta. */}
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

        {state.analysis?.fidelityNotes?.length ? (
          <div style={{
            marginTop:      8,
            display:        'flex',
            flexWrap:       'wrap',
            justifyContent: 'center',
            gap:            6,
          }}>
            {state.analysis.fidelityNotes.slice(0, 3).map((note, i) => (
              <span key={i} className="spn-glass spn-glass--raised" style={{
                padding:      '4px 11px',
                borderRadius: 999,
                fontSize:     11,
                color:        'var(--color-text-secondary)',
              }}>
                {note}
              </span>
            ))}
          </div>
        ) : null}

        {state.imageWasCropped && (
          <p className="spn-hint" style={{ textAlign: 'center', color: 'var(--color-warning)' }}>
            A imagem foi recortada para uma proporção compatível com os motores de vídeo.
          </p>
        )}

        {state.analysisError && (
          <p className="spn-hint" style={{ textAlign: 'center' }}>
            {state.analysisError} Você pode configurar manualmente no painel ao lado.
          </p>
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
      {/* Uma caixa de erro só no app inteiro: .spn-error. A versão anterior
          montava a sua com --color-error-bg na mão. */}
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 10 }}>
          Não conseguimos gerar o vídeo
        </div>
        <div className="spn-error">
          {state.error ?? 'Erro desconhecido. Tente novamente.'}
        </div>
        <p className="spn-hint">
          Se houve cobrança, os Nodes são devolvidos automaticamente.
        </p>
        <button type="button" className="spn-ghost" onClick={onClearError} style={{ marginTop: 16 }}>
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

// Só a geometria: o material vem de .spn-ghost (que já borra pela classe e
// degrada para sólido nos dois fallbacks de acessibilidade).
const overlayChipStyle: React.CSSProperties = {
  height:   28,
  padding:  '0 11px',
  fontSize: 11.5,
}
