'use client'

// O objetivo é a única escolha obrigatória. Duração, câmera, motor, resolução
// e intensidade vêm do preset; o servidor confirma preço e tier antes de cobrar.
import { ChoiceGroup } from '@/components/app/glass'
import { VIDEO_TYPE_ORDER, VIDEO_TYPE_PRESETS, type VideoTypeId } from '@/lib/video/videoPresets'
import type { VideoModel } from '@/lib/video/models'
import type { AnimateState, AnimateDispatch } from '../_hooks/useAnimateState'

interface Props {
  state:      AnimateState
  dispatch:   AnimateDispatch
  model:      VideoModel
  nodeCost:   number
  onGenerate: () => void
}

export default function AnimatePanel({ state, dispatch, model, nodeCost, onGenerate }: Props) {
  const locked = state.status === 'generating' || state.status === 'analyzing'
  const insufficient = state.credits < nodeCost
  const canGenerate = !!state.imageFile && !insufficient && !locked

  const ctaLabel =
    state.status === 'generating' ? 'Gerando vídeo…' :
    state.status === 'analyzing'  ? 'Analisando imagem…' :
    !state.imageFile              ? 'Envie uma imagem' :
    insufficient                 ? 'Saldo insuficiente' : 'Gerar vídeo'

  return (
    <aside className="spn-tool-panel spn-glass spn-glass--chrome">
      <div className="spn-tool-panel-body">
        <div className="spn-field">
          <span className="spn-field-label">Onde você vai usar o vídeo?</span>
          <ChoiceGroup
            label="Destino do vídeo"
            value={state.videoType}
            onChange={(id: VideoTypeId) => dispatch({ type: 'applyPreset', videoType: id })}
            cols={2}
            options={VIDEO_TYPE_ORDER.map(id => ({
              value: id,
              title: VIDEO_TYPE_PRESETS[id].label,
              note: id === 'reels' ? 'Vertical · 720p' : 'Original · 1080p',
              disabled: locked,
            }))}
          />
          <p className="spn-hint">A SpaceNode escolhe um movimento suave para a imagem. Vídeo de 8 segundos, sem áudio.</p>
        </div>

        <div className="spn-field">
          <label className="spn-field-label" htmlFor="animar-direction">Direção opcional</label>
          <textarea
            id="animar-direction"
            className="spn-textarea"
            rows={3}
            maxLength={280}
            value={state.userPrompt}
            onChange={e => dispatch({ type: 'setUserPrompt', userPrompt: e.target.value })}
            placeholder="Ex.: movimento lento para revelar a luz natural."
            disabled={locked}
            style={{ width: '100%' }}
          />
          <p className="spn-hint">A composição e os materiais da imagem orientam a geração. Revise o resultado antes de apresentar.</p>
        </div>
      </div>

      <div className="spn-dock spn-glass spn-glass--chrome">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
          <span className="spn-hint" style={{ margin: 0 }}>8 s · {model.supportedResolutions[0]} · cerca de 2–4 min</span>
          <span className="spn-balance">Saldo <b>{state.credits.toLocaleString('pt-BR')}</b> nodes</span>
        </div>
        {insufficient && (
          <p className="spn-hint" style={{ marginBottom: 10 }}>
            Faltam {(nodeCost - state.credits).toLocaleString('pt-BR')} nodes. <a href="/app/billing">Ver planos e pacotes</a>
          </p>
        )}
        <button type="button" className="spn-cta" onClick={onGenerate} disabled={!canGenerate}>
          {ctaLabel} <span className="spn-cta-meta">{nodeCost} nodes</span>
        </button>
      </div>
    </aside>
  )
}
