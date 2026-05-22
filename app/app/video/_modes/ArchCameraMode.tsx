'use client'

// Modo 2 — "Câmera arquitetônica"
// Foco nos presets de câmera (todos os grupos). Modelo e duração ficam
// visíveis mas em segundo plano. Sem prompt — o preset já carrega a
// direção cinematográfica.

import VideoSettingsPanel from '../_components/VideoSettingsPanel'
import VideoModelSelector from '../_components/VideoModelSelector'
import DurationSelector from '../_components/DurationSelector'
import CameraMotionPresets from '../_components/CameraMotionPresets'
import { CAMERA_MOTIONS } from '@/lib/video/cameraPresets'
import type { AnimateState, AnimateDispatch } from '../_hooks/useAnimateState'

interface Props {
  state:      AnimateState
  dispatch:   AnimateDispatch
  nodeCost:   number
  onGenerate: () => void
}

export default function ArchCameraMode({ state, dispatch, nodeCost, onGenerate }: Props) {
  const ready       = !!state.imageFile && state.status !== 'analyzing'
  const isLoading   = state.status === 'generating'
  const isAnalyzing = state.status === 'analyzing'

  return (
    <VideoSettingsPanel
      title="Câmera arquitetônica"
      subtitle="Escolha um movimento de câmera pensado para arquitetura — sem precisar escrever prompt."
      nodeCost={nodeCost}
      credits={state.credits}
      ready={ready}
      isLoading={isLoading}
      isAnalyzing={isAnalyzing}
      onSubmit={onGenerate}
      disabledHint={!state.imageFile ? 'Carregue uma imagem do projeto primeiro' : undefined}
    >
      <CameraMotionPresets
        selectedId={state.cameraMotion}
        onSelect={id => {
          dispatch({ type: 'setCameraMotion', motionId: id })
          // Aplicar duração e intensidade recomendadas do preset automaticamente
          const motion = CAMERA_MOTIONS[id]
          if (motion) {
            dispatch({ type: 'setIntensity', intensity: motion.intensityHint })
          }
        }}
        recommendedId={state.analysis?.suggestedCameraMotion}
      />

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
    </VideoSettingsPanel>
  )
}
