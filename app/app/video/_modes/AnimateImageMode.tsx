'use client'

// Modo 1 — "Animar imagem"
// Fluxo mais simples: upload → análise automática → sugestões aplicadas →
// usuário pode ajustar 2-3 coisas → gerar. Esconde controles avançados.

import VideoSettingsPanel from '../_components/VideoSettingsPanel'
import VideoModelSelector from '../_components/VideoModelSelector'
import DurationSelector from '../_components/DurationSelector'
import VideoPromptBox from '../_components/VideoPromptBox'
import { CAMERA_MOTIONS } from '@/lib/video/cameraPresets'
import type { AnimateState, AnimateDispatch } from '../_hooks/useAnimateState'

interface Props {
  state:      AnimateState
  dispatch:   AnimateDispatch
  nodeCost:   number
  onGenerate: () => void
}

export default function AnimateImageMode({ state, dispatch, nodeCost, onGenerate }: Props) {
  const ready       = !!state.imageFile && state.status !== 'analyzing'
  const isLoading   = state.status === 'generating'
  const isAnalyzing = state.status === 'analyzing'
  const suggestion  = state.analysis?.suggestedPrompt
  const motion      = CAMERA_MOTIONS[state.cameraMotion]

  return (
    <VideoSettingsPanel
      title="Animar imagem"
      subtitle="Sugerimos modelo, câmera e duração automaticamente. Você só ajusta o que importa."
      nodeCost={nodeCost}
      credits={state.credits}
      ready={ready}
      isLoading={isLoading}
      isAnalyzing={isAnalyzing}
      onSubmit={onGenerate}
      disabledHint={!state.imageFile ? 'Carregue uma imagem do projeto primeiro' : undefined}
    >
      <VideoModelSelector
        selectedId={state.modelId}
        onSelect={id => dispatch({ type: 'setModel', modelId: id })}
        showRecommendBanner={!state.imageFile}
        recommendedId={state.analysis?.suggestedModelId}
        disabled={isLoading || isAnalyzing}
      />

      <DurationSelector
        modelId={state.modelId}
        value={state.duration}
        onChange={d => dispatch({ type: 'setDuration', duration: d })}
        disabled={isLoading || isAnalyzing}
      />

      {motion && state.imageFile && (
        <div>
          <Label>Movimento sugerido</Label>
          <div style={{
            padding:      '11px 12px',
            borderRadius: 10,
            background:   'rgba(255,255,255,0.04)',
            border:       '1px solid rgba(255,255,255,0.10)',
          }}>
            <div style={{
              fontSize:      12.5,
              fontWeight:    500,
              color:         '#ffffff',
              letterSpacing: '-0.01em',
            }}>
              {motion.label}
            </div>
            <div style={{
              fontSize:   10.5,
              color:      'rgba(255,255,255,0.40)',
              marginTop:  3,
              lineHeight: 1.45,
            }}>
              {motion.description}
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: 'setMode', mode: 'camera' })}
              style={{
                marginTop:  10,
                fontSize:   10.5,
                color:      'rgba(255,255,255,0.55)',
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                padding:    0,
                letterSpacing: '-0.005em',
              }}
            >
              Trocar movimento →
            </button>
          </div>
        </div>
      )}

      <VideoPromptBox
        value={state.userPrompt}
        onChange={v => dispatch({ type: 'setUserPrompt', userPrompt: v })}
        suggestion={suggestion}
        onUseSuggestion={suggestion ? () => dispatch({ type: 'setUserPrompt', userPrompt: suggestion }) : undefined}
        disabled={isLoading || isAnalyzing}
      />

      {state.analysis?.fidelityNotes?.length ? (
        <div>
          <Label>Preservaremos</Label>
          <ul style={{
            margin: 0, padding: 0, listStyle: 'none',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {state.analysis.fidelityNotes.slice(0, 3).map((note, i) => (
              <li key={i} style={{
                fontSize:   11,
                color:      'rgba(255,255,255,0.55)',
                lineHeight: 1.5,
                paddingLeft: 12,
                position:   'relative',
              }}>
                <span style={{
                  position: 'absolute', left: 0, top: 7,
                  width: 4, height: 4, borderRadius: '50%',
                  background: 'rgba(134,239,172,0.5)',
                }} />
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </VideoSettingsPanel>
  )
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize:    10, fontWeight: 600, letterSpacing: '0.1em',
    textTransform:'uppercase' as const,
    color:       'rgba(255,255,255,0.40)',
    marginBottom: 10,
  }}>
    {children}
  </div>
)
