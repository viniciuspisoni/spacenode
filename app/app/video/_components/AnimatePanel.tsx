'use client'

// Painel único de configuração do Animar. Substitui os antigos 3 modos
// (Animar imagem / Câmera arquitetônica / Cena guiada) por um fluxo só:
//
//   Tipo de vídeo → Movimento → Formato → Duração → Intensidade →
//   Direção criativa → Ajustes avançados (recolhido)
//
// Superfície limpa com defaults inteligentes; profundidade nos avançados.

import VideoTypePresets from './VideoTypePresets'
import MotionSelector from './MotionSelector'
import FormatSelector from './FormatSelector'
import DurationSelector from './DurationSelector'
import IntensitySelector from './IntensitySelector'
import VideoPromptBox from './VideoPromptBox'
import VideoSettingsPanel from './VideoSettingsPanel'
import AdvancedSettings from './AdvancedSettings'
import PreservationControls from './PreservationControls'
import FidelityModeSelector from './FidelityModeSelector'
import SceneTypeSelector from './SceneTypeSelector'
import AtmosphereSelector from './AtmosphereSelector'
import ReferenceFrameUploader from './ReferenceFrameUploader'
import CameraMotionPresets from './CameraMotionPresets'
import VideoModelSelector from './VideoModelSelector'
import { SCENE_TYPES } from '@/lib/video/scenes'
import type { VideoModel } from '@/lib/video/models'
import type { CameraMotion } from '@/lib/video/cameraPresets'
import type { AnimateState, AnimateDispatch } from '../_hooks/useAnimateState'

interface Props {
  state:          AnimateState
  dispatch:       AnimateDispatch
  model:          VideoModel
  resolvedMotion: CameraMotion
  nodeCost:       number
  onGenerate:     () => void
}

// Converte estimatedGenerationMs do motor em faixa legível.
function estimateLabel(ms: number): string {
  if (ms <= 100_000) return '1–2 min'
  if (ms <= 160_000) return '2–3 min'
  return '2–4 min'
}

// Grupo inicial do catálogo avançado conforme a cena detectada/escolhida.
function groupForArchetype(archetype: string): 'interior' | 'facade' | 'commercial' | 'social' {
  if (archetype === 'facade' || archetype === 'exterior') return 'facade'
  if (archetype === 'commercial')                          return 'commercial'
  if (archetype === 'social')                              return 'social'
  return 'interior'
}

export default function AnimatePanel({
  state, dispatch, model, resolvedMotion, nodeCost, onGenerate,
}: Props) {
  const ready       = !!state.imageFile && state.status !== 'analyzing'
  const isLoading   = state.status === 'generating'
  const isAnalyzing = state.status === 'analyzing'
  const locked      = isLoading || isAnalyzing
  const suggestion  = state.analysis?.suggestedPrompt

  return (
    <VideoSettingsPanel
      title="Configurar vídeo"
      subtitle="Escolha o tipo de vídeo e ajuste só o que importa. A arquitetura permanece fiel ao original."
      nodeCost={nodeCost}
      credits={state.credits}
      ready={ready}
      isLoading={isLoading}
      isAnalyzing={isAnalyzing}
      estimateLabel={estimateLabel(model.estimatedGenerationMs)}
      onSubmit={onGenerate}
    >
      <VideoTypePresets
        selected={state.videoType}
        onSelect={id => dispatch({ type: 'applyPreset', videoType: id })}
        disabled={locked}
      />

      <MotionSelector
        choice={state.motionChoice}
        resolvedMotion={resolvedMotion}
        onSelect={c => dispatch({ type: 'setMotionChoice', motionChoice: c })}
        disabled={locked}
      />

      <FormatSelector
        value={state.aspectRatio}
        onChange={v => dispatch({ type: 'setAspectRatio', aspectRatio: v })}
        model={model}
        disabled={locked}
      />

      <DurationSelector
        modelId={state.modelId}
        value={state.duration}
        onChange={d => dispatch({ type: 'setDuration', duration: d })}
        disabled={locked}
      />

      <IntensitySelector
        value={state.intensity}
        onChange={v => dispatch({ type: 'setIntensity', intensity: v })}
        disabled={locked}
      />

      <VideoPromptBox
        value={state.userPrompt}
        onChange={v => dispatch({ type: 'setUserPrompt', userPrompt: v })}
        suggestion={suggestion}
        onUseSuggestion={suggestion
          ? () => dispatch({ type: 'setUserPrompt', userPrompt: suggestion })
          : undefined}
        disabled={locked}
      />

      {state.analysis?.fidelityNotes?.length ? (
        <div>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            color: 'var(--color-text-tertiary)',
            marginBottom: 10,
          }}>
            Preservaremos nesta imagem
          </div>
          <ul style={{
            margin: 0, padding: 0, listStyle: 'none',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {state.analysis.fidelityNotes.slice(0, 3).map((note, i) => (
              <li key={i} style={{
                fontSize:    11,
                color:       'var(--color-text-secondary)',
                lineHeight:  1.5,
                paddingLeft: 12,
                position:    'relative',
              }}>
                <span style={{
                  position: 'absolute', left: 0, top: 7,
                  width: 4, height: 4, borderRadius: '50%',
                  background: 'var(--color-accent-green-dim)',
                }} />
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AdvancedSettings>
        <PreservationControls
          avoidPeople={state.avoidPeople}
          onToggleAvoidPeople={v => dispatch({ type: 'setAvoidPeople', avoidPeople: v })}
          disabled={locked}
        />

        <FidelityModeSelector
          value={state.fidelityMode}
          onChange={v => dispatch({ type: 'setFidelity', fidelityMode: v })}
          disabled={locked}
        />

        <SceneTypeSelector
          value={state.sceneType}
          onChange={s => dispatch({ type: 'setScene', sceneType: s })}
          disabled={locked}
        />

        <AtmosphereSelector
          value={state.atmosphere}
          onChange={v => dispatch({ type: 'setAtmosphere', atmosphere: v })}
          disabled={locked}
        />

        <ReferenceFrameUploader
          label="Frame final (opcional)"
          hint="Adicione um segundo frame para dirigir o final do vídeo"
          preview={state.endImagePreview}
          onLoaded={(file, preview) => dispatch({ type: 'setEndImage', file, preview })}
          onClear={() => dispatch({ type: 'setEndImage', file: null, preview: null })}
          disabled={locked}
          compact
        />

        <div>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            color: 'var(--color-text-tertiary)',
            marginBottom: 10,
          }}>
            Catálogo completo de movimentos
          </div>
          <CameraMotionPresets
            selectedId={resolvedMotion.id}
            onSelect={id => dispatch({ type: 'setMotionChoice', motionChoice: id })}
            recommendedId={state.analysis?.suggestedCameraMotion}
            defaultGroup={groupForArchetype(SCENE_TYPES[state.sceneType].archetype)}
            compact
          />
        </div>

        <VideoModelSelector
          selectedId={state.modelId}
          onSelect={id => dispatch({ type: 'setModel', modelId: id })}
          showRecommendBanner={!state.imageFile}
          recommendedId={state.analysis?.suggestedModelId}
          disabled={locked}
        />
      </AdvancedSettings>
    </VideoSettingsPanel>
  )
}
