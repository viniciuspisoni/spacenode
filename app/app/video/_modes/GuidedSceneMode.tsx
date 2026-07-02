'use client'

// Modo 3 — "Cena guiada"
// Expõe todos os controles avançados: frame inicial + frame final,
// prompt, tipo de cena, movimento de câmera, intensidade, fidelidade,
// atmosfera, modelo, duração. Para usuário que quer controle total.

import VideoSettingsPanel from '../_components/VideoSettingsPanel'
import VideoModelSelector from '../_components/VideoModelSelector'
import DurationSelector from '../_components/DurationSelector'
import VideoPromptBox from '../_components/VideoPromptBox'
import CameraMotionPresets from '../_components/CameraMotionPresets'
import SceneTypeSelector from '../_components/SceneTypeSelector'
import IntensitySelector from '../_components/IntensitySelector'
import FidelityModeSelector from '../_components/FidelityModeSelector'
import AtmosphereSelector from '../_components/AtmosphereSelector'
import ReferenceFrameUploader from '../_components/ReferenceFrameUploader'
import { CAMERA_MOTIONS } from '@/lib/video/cameraPresets'
import { SCENE_TYPES } from '@/lib/video/scenes'
import type { AnimateState, AnimateDispatch } from '../_hooks/useAnimateState'

interface Props {
  state:      AnimateState
  dispatch:   AnimateDispatch
  nodeCost:   number
  onGenerate: () => void
}

export default function GuidedSceneMode({ state, dispatch, nodeCost, onGenerate }: Props) {
  const ready       = !!state.imageFile && state.status !== 'analyzing'
  const isLoading   = state.status === 'generating'
  const isAnalyzing = state.status === 'analyzing'

  return (
    <VideoSettingsPanel
      title="Cena guiada"
      subtitle="Controle total: combine frame inicial, final, prompt, câmera, fidelidade e atmosfera."
      nodeCost={nodeCost}
      credits={state.credits}
      ready={ready}
      isLoading={isLoading}
      isAnalyzing={isAnalyzing}
      onSubmit={onGenerate}
      disabledHint={!state.imageFile ? 'Carregue uma imagem do projeto primeiro' : undefined}
    >
      <ReferenceFrameUploader
        label="Final desejado (opcional)"
        hint="Adicione um segundo frame para dirigir o final do vídeo"
        preview={state.endImagePreview}
        onLoaded={(file, preview) => dispatch({ type: 'setEndImage', file, preview })}
        onClear={() => dispatch({ type: 'setEndImage', file: null, preview: null })}
        disabled={isLoading || isAnalyzing}
        compact
      />

      <SceneTypeSelector
        value={state.sceneType}
        onChange={s => {
          dispatch({ type: 'setScene', sceneType: s })
          // Atualiza o movimento default da nova cena
          const defaultMotion = SCENE_TYPES[s].defaultMotionId
          dispatch({ type: 'setCameraMotion', motionId: defaultMotion as never })
        }}
        disabled={isLoading || isAnalyzing}
      />

      <div>
        <Label>Movimento de câmera</Label>
        <CameraMotionPresets
          selectedId={state.cameraMotion}
          onSelect={id => {
            dispatch({ type: 'setCameraMotion', motionId: id })
            const motion = CAMERA_MOTIONS[id]
            if (motion) dispatch({ type: 'setIntensity', intensity: motion.intensityHint })
          }}
          recommendedId={state.analysis?.suggestedCameraMotion}
          compact
        />
      </div>

      <IntensitySelector
        value={state.intensity}
        onChange={v => dispatch({ type: 'setIntensity', intensity: v })}
        disabled={isLoading || isAnalyzing}
      />

      <FidelityModeSelector
        value={state.fidelityMode}
        onChange={v => dispatch({ type: 'setFidelity', fidelityMode: v })}
        disabled={isLoading || isAnalyzing}
      />

      <AtmosphereSelector
        value={state.atmosphere}
        onChange={v => dispatch({ type: 'setAtmosphere', atmosphere: v })}
        disabled={isLoading || isAnalyzing}
      />

      <VideoPromptBox
        value={state.userPrompt}
        onChange={v => dispatch({ type: 'setUserPrompt', userPrompt: v })}
        suggestion={state.analysis?.suggestedPrompt}
        onUseSuggestion={state.analysis?.suggestedPrompt
          ? () => dispatch({ type: 'setUserPrompt', userPrompt: state.analysis!.suggestedPrompt })
          : undefined}
        disabled={isLoading || isAnalyzing}
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

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize:    10, fontWeight: 600, letterSpacing: '0.1em',
    textTransform:'uppercase' as const,
    color:       'var(--color-text-tertiary)',
    marginBottom: 10,
  }}>
    {children}
  </div>
)
