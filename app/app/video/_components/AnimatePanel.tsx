'use client'

import { useState } from 'react'
import { ChoiceGroup } from '@/components/app/glass'
import { getNodeCost, listAvailableVideoModels, type VideoModel } from '@/lib/video/models'
import { CAMERA_MOTIONS, type CameraMotion, type CameraMotionId } from '@/lib/video/cameraPresets'
import { resolveArchitecturalTake } from '@/lib/video/takePolicy'
import type { AnimateState, AnimateDispatch } from '../_hooks/useAnimateState'
import CameraSheet from './CameraSheet'
import DirectionSheet from './DirectionSheet'
import VideoEnginePicker from './VideoEnginePicker'
import { FORMAT_OPTIONS } from './animateLabels'

const MOVEMENTS: { id: CameraMotionId; title: string; note: string }[] = [
  { id: 'dolly-in-soft', title: 'Aproximar', note: 'Avanço suave' },
  { id: 'lateral-tracking', title: 'Deslizar', note: 'Movimento lateral' },
  { id: 'orbit-soft', title: 'Orbitar', note: 'Arco curto na vista' },
  { id: 'static-ambient', title: 'Câmera fixa', note: 'Movimento ambiente' },
]

interface Props {
  state: AnimateState
  dispatch: AnimateDispatch
  model: VideoModel
  resolvedMotion: CameraMotion
  nodeCost: number
  availableModelIds: readonly string[]
  onGenerate: () => void
}

export default function AnimatePanel({ state, dispatch, model, resolvedMotion, nodeCost, availableModelIds, onGenerate }: Props) {
  const [sheet, setSheet] = useState<'camera' | 'direction' | null>(null)
  const isLoading = state.status === 'generating'
  const isAnalyzing = state.status === 'analyzing'
  const locked = isLoading || isAnalyzing
  const unavailable = !availableModelIds.includes(model.id)
  const insufficient = state.credits < nodeCost
  const canGenerate = !!state.imageFile && nodeCost > 0 && !unavailable && !insufficient && !locked
  const fits = listAvailableVideoModels().filter(candidate => availableModelIds.includes(candidate.id))
    .flatMap(candidate => candidate.supportedDurations.map(seconds => ({
      id: candidate.id, label: candidate.label, seconds, cost: getNodeCost(candidate.id, seconds),
    })))
    .filter(candidate => candidate.cost <= state.credits)
    .sort((a, b) => a.cost - b.cost)
  const fit = insufficient ? fits[0] : undefined
  const currentMotion = state.motionChoice === 'auto' ? resolvedMotion.id : state.motionChoice
  const take = resolveArchitecturalTake({ cameraMotion: currentMotion, sceneType: state.sceneType,
    intensity: state.intensity, duration: state.duration, hasEndFrame: !!state.endImageFile })
  const ctaLabel = isLoading ? 'Gerando vídeo…' : isAnalyzing ? 'Analisando imagem…'
    : unavailable ? 'Motor indisponível' : !state.imageFile ? 'Envie uma imagem'
      : insufficient ? 'Saldo insuficiente' : 'Gerar vídeo'

  function useAffordableOption() {
    if (!fit) return
    dispatch({ type: 'setModel', modelId: fit.id })
    dispatch({ type: 'setDuration', duration: fit.seconds })
  }

  return (
    <aside className="spn-tool-panel spn-glass spn-glass--chrome spn-animate-panel" aria-label="Configurar vídeo">
      <div className="spn-tool-panel-body spn-tool-panel-body--scroll">
        <VideoEnginePicker model={model} duration={state.duration} availableModelIds={availableModelIds}
          onModel={id => dispatch({ type: 'setModel', modelId: id })} disabled={locked} />

        <div className="spn-animate-section">
          <div className="spn-animate-field-head">
            <span className="spn-field-label">Movimento de câmera</span>
            <button type="button" className="spn-animate-link" onClick={() => setSheet('camera')} disabled={locked}>Ver todos</button>
          </div>
          <ChoiceGroup label="Movimento de câmera" value={currentMotion}
            onChange={motionChoice => dispatch({ type: 'setMotionChoice', motionChoice })}
            cols={2} options={MOVEMENTS.map(motion => ({ ...motion, value: motion.id, disabled: locked }))} />
          {!MOVEMENTS.some(motion => motion.id === currentMotion) && (
            <p className="spn-hint">Selecionado: {CAMERA_MOTIONS[currentMotion].label}.</p>
          )}
          {take.notes.map(note => <p key={note} className="spn-hint" role="status">{note}</p>)}
        </div>

        <div className="spn-animate-output spn-animate-section">
          <div>
            <label className="spn-animate-select-label" htmlFor="animate-duration">Duração</label>
            <select id="animate-duration" className="spn-animate-select" value={state.duration}
              onChange={event => dispatch({ type: 'setDuration', duration: event.target.value })} disabled={locked}>
              {model.supportedDurations.map(seconds => (
                <option key={seconds} value={seconds}>{seconds}s · {getNodeCost(model.id, seconds)} Nodes</option>
              ))}
            </select>
          </div>
          <div>
            <label className="spn-animate-select-label" htmlFor="animate-format">Formato</label>
            <select id="animate-format" className="spn-animate-select" value={state.aspectRatio}
              onChange={event => dispatch({ type: 'setAspectRatio', aspectRatio: event.target.value })} disabled={locked}>
              {FORMAT_OPTIONS.filter(format => model.supportedAspectRatios.includes(format.id)).map(format => (
                <option key={format.id} value={format.id}>{format.label}</option>
              ))}
            </select>
          </div>
        </div>

        <button type="button" className="spn-animate-advanced" onClick={() => setSheet('direction')} disabled={locked}>
          <span>Direção e ajustes</span><span aria-hidden="true">＋</span>
        </button>
        <p className="spn-hint spn-animate-fidelity">Um take contínuo, com movimento curto e preservação do projeto.</p>
      </div>

      <div className="spn-dock spn-glass spn-glass--chrome">
        <div className="spn-animate-cost" aria-live="polite">
          <span>{model.supportedResolutions.join(' / ')} · {state.duration}s</span>
          <span><b>{nodeCost}</b> Nodes</span>
        </div>
        <button type="button" className="spn-cta" onClick={onGenerate} disabled={!canGenerate}>{ctaLabel}</button>
        <div className="spn-animate-balance">Saldo: {state.credits} Nodes</div>
        {insufficient && !unavailable && (
          <div className="spn-animate-balance spn-animate-shortfall" role="status">
            Faltam {nodeCost - state.credits} Nodes.
            {fit ? <button type="button" className="spn-animate-link" onClick={useAffordableOption} disabled={locked}>
              Usar {fit.label} · {fit.seconds}s · {fit.cost} Nodes
            </button> : <a className="spn-animate-link" href="/app/billing">Adicionar Nodes</a>}
          </div>
        )}
      </div>

      <CameraSheet open={sheet === 'camera'} onClose={() => setSheet(null)} choice={state.motionChoice}
        resolvedMotion={resolvedMotion} intensity={state.intensity} fromAnalysis={!!state.analysis?.suggestedCameraMotion}
        onMotion={motionChoice => dispatch({ type: 'setMotionChoice', motionChoice })}
        onIntensity={intensity => dispatch({ type: 'setIntensity', intensity })} disabled={locked} />
      <DirectionSheet open={sheet === 'direction'} onClose={() => setSheet(null)} userPrompt={state.userPrompt}
        suggestion={state.analysis?.suggestedPrompt} fidelityMode={state.fidelityMode} sceneType={state.sceneType}
        atmosphere={state.atmosphere} avoidPeople={state.avoidPeople} endImagePreview={state.endImagePreview}
        supportsEndFrame={model.supportedInputs.includes('imageEnd')}
        onUserPrompt={userPrompt => dispatch({ type: 'setUserPrompt', userPrompt })}
        onFidelity={fidelityMode => dispatch({ type: 'setFidelity', fidelityMode })}
        onScene={sceneType => dispatch({ type: 'setScene', sceneType })}
        onAtmosphere={atmosphere => dispatch({ type: 'setAtmosphere', atmosphere })}
        onAvoidPeople={avoidPeople => dispatch({ type: 'setAvoidPeople', avoidPeople })}
        onEndImage={(file, preview) => dispatch({ type: 'setEndImage', file, preview })} disabled={locked} />
    </aside>
  )
}
