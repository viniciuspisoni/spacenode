'use client'

import { ChoiceGroup } from '@/components/app/glass'
import { VIDEO_ENGINES, type VideoEngineId } from '@/lib/video/engines'
import { getNodeCost, listVideoVariants, type VideoModel } from '@/lib/video/models'

interface Props {
  model: VideoModel
  duration: string
  availableModelIds: readonly string[]
  onModel: (id: string) => void
  disabled: boolean
}

export default function VideoEnginePicker({ model, duration, availableModelIds, onModel, disabled }: Props) {
  const variants = model.engineId ? listVideoVariants(model.engineId) : []
  const available = (candidate: VideoModel) => availableModelIds.includes(candidate.id)

  function chooseEngine(engineId: VideoEngineId) {
    const candidates = listVideoVariants(engineId).filter(available)
    const next = candidates.find(candidate => candidate.variant === 'Original') ?? candidates[0]
    if (next) onModel(next.id)
  }

  return (
    <div className="spn-animate-engine">
      <span className="spn-field-label">Motor</span>
      <ChoiceGroup label="Motor de vídeo" value={model.engineId ?? 'orbit'} onChange={chooseEngine} cols={2}
        options={VIDEO_ENGINES.map(engine => {
          const ready = listVideoVariants(engine.id).filter(available)
          const minimum = Math.min(...ready.flatMap(candidate => Object.values(candidate.costInNodes)))
          return { value: engine.id, title: engine.label,
            note: ready.length ? `A partir de ${minimum} Nodes` : 'Em preparação',
            disabled: disabled || !ready.length }
        })} />

      <label className="spn-animate-select-label" htmlFor="animate-variant">Variante</label>
      <select id="animate-variant" className="spn-animate-select" value={model.id}
        onChange={event => onModel(event.target.value)} disabled={disabled}>
        {variants.map(candidate => {
          const seconds = candidate.supportedDurations.includes(duration) ? duration : candidate.supportedDurations[0]
          return <option key={candidate.id} value={candidate.id} disabled={!available(candidate)}>
            {candidate.label} · {available(candidate) ? `${seconds}s · ${getNodeCost(candidate.id, seconds)} Nodes` : 'Em preparação'}
          </option>
        })}
      </select>
      <details className="spn-animate-details">
        <summary>Detalhes do motor{model.isBeta ? ' · Beta' : ''}</summary>
        <p>{model.tag} · {model.supportedResolutions.join(' / ')}. {model.description}</p>
        {model.isBeta && <p>Variante em avaliação. Confira os detalhes do projeto no resultado.</p>}
      </details>
    </div>
  )
}
