'use client'

// Painel do Animar: uma superfície e três linhas.
//
// Antes eram 13 controles empilhados (66 opções discretas) e nenhum campo
// obrigatório — tudo já tinha default. O problema nunca foi falta de default,
// era excesso de superfície: formato e intensidade são CONSEQUÊNCIA do tipo de
// vídeo (o preset já os define) e mesmo assim ocupavam a tela, enquanto o
// motor — o único controle que faz uma conta gratuita de 80 nodes caber —
// ficava enterrado nos "ajustes avançados".
//
// Agora só o tipo de vídeo fica exposto, porque é o único campo que o usuário
// realmente decide: ele traduz objetivo em técnica e reconfigura todo o resto.
// O que sobra vira três famílias, cada uma mostrando o valor já resolvido:
//
//   ▤ Câmera            Aproximação suave · Sutil        ›
//   ▣ Formato e custo   16:9 · 8s · Cinemático · 280 …   ›
//   ✒ Direção           Padrão do preset                 ›

import { useState } from 'react'
import { ChoiceGroup, RowIcon, SettingGroup, SettingRow } from '@/components/app/glass'
import { VIDEO_TYPE_ORDER, VIDEO_TYPE_PRESETS, type VideoTypeId } from '@/lib/video/videoPresets'
import type { VideoModel } from '@/lib/video/models'
import type { CameraMotion } from '@/lib/video/cameraPresets'
import type { AnimateState, AnimateDispatch } from '../_hooks/useAnimateState'
import CameraSheet from './CameraSheet'
import OutputSheet from './OutputSheet'
import DirectionSheet from './DirectionSheet'
import {
  VIDEO_TYPE_NOTES,
  cameraSummary,
  directionSummary,
  outputSummary,
} from './animateLabels'

type SheetId = 'camera' | 'output' | 'direction' | null

// Faixa de espera do motor. Dizer quanto tempo leva ANTES de o usuário
// gastar 280 nodes é a informação que o rodapé antigo (CostSummary) trazia e
// que o dock tinha perdido — depois do clique já é tarde para escolher outro.
function estimateLabel(ms: number): string {
  if (ms <= 100_000) return '1–2 min'
  if (ms <= 160_000) return '2–3 min'
  return '2–4 min'
}

interface Props {
  state:          AnimateState
  dispatch:       AnimateDispatch
  model:          VideoModel
  resolvedMotion: CameraMotion
  nodeCost:       number
  onGenerate:     () => void
}

export default function AnimatePanel({
  state, dispatch, model, resolvedMotion, nodeCost, onGenerate,
}: Props) {
  const [sheet, setSheet] = useState<SheetId>(null)

  const isLoading    = state.status === 'generating'
  const isAnalyzing  = state.status === 'analyzing'
  const locked       = isLoading || isAnalyzing
  const insufficient = state.credits < nodeCost
  const canGenerate  = !!state.imageFile && !insufficient && !locked

  const ctaLabel =
    isLoading        ? 'Gerando vídeo…'     :
    isAnalyzing      ? 'Analisando imagem…' :
    !state.imageFile ? 'Envie uma imagem'   :
    insufficient     ? 'Saldo insuficiente' :
                       'Gerar vídeo'

  return (
    <aside className="spn-tool-panel spn-glass spn-glass--chrome">
      <div className="spn-tool-panel-body">
        <div className="spn-field">
          <span className="spn-field-label">Tipo de vídeo</span>
          <ChoiceGroup
            label="Tipo de vídeo"
            value={state.videoType}
            onChange={(id: VideoTypeId) => dispatch({ type: 'applyPreset', videoType: id })}
            cols={2}
            options={VIDEO_TYPE_ORDER.map(id => ({
              value:    id,
              title:    VIDEO_TYPE_PRESETS[id].label,
              note:     VIDEO_TYPE_NOTES[id],
              disabled: locked,
            }))}
          />
          <p className="spn-hint">
            O tipo já resolve câmera, formato, duração e motor. As três linhas
            abaixo mostram o que ficou — abra só se quiser mudar.
          </p>
        </div>

        <SettingGroup>
          <SettingRow
            icon={<RowIcon name="motion" />}
            title="Câmera"
            value={cameraSummary(state, resolvedMotion)}
            onOpen={() => setSheet('camera')}
            disabled={locked}
          />
          <SettingRow
            icon={<RowIcon name="format" />}
            title="Formato e custo"
            value={outputSummary(state, model, nodeCost)}
            onOpen={() => setSheet('output')}
            disabled={locked}
          />
          <SettingRow
            icon={<RowIcon name="direction" />}
            title="Direção"
            value={directionSummary(state)}
            onOpen={() => setSheet('direction')}
            disabled={locked}
          />
        </SettingGroup>
      </div>

      {/* O CTA nunca some no scroll — é a razão de o dock existir. */}
      <div className="spn-dock spn-glass spn-glass--chrome">
        {insufficient ? (
          <div className="spn-error" style={{ marginBottom: 10 }}>
            Faltam {nodeCost - state.credits} nodes. Um motor mais barato cabe no
            seu saldo — veja em <b>Formato e custo</b>.
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 10, marginBottom: 8,
          }}>
            <span className="spn-hint" style={{ marginTop: 0 }}>
              Fica pronto em ~{estimateLabel(model.estimatedGenerationMs)}
            </span>
            <span className="spn-balance">
              <i className="spn-balance-dot" aria-hidden />
              Saldo <b>{state.credits}</b> nodes
            </span>
          </div>
        )}

        <button type="button" className="spn-cta" onClick={onGenerate} disabled={!canGenerate}>
          {ctaLabel} <span className="spn-cta-meta">{nodeCost} nodes</span>
        </button>
      </div>

      <CameraSheet
        open={sheet === 'camera'}
        onClose={() => setSheet(null)}
        choice={state.motionChoice}
        resolvedMotion={resolvedMotion}
        intensity={state.intensity}
        fromAnalysis={!!state.analysis?.suggestedCameraMotion}
        onMotion={c => dispatch({ type: 'setMotionChoice', motionChoice: c })}
        onIntensity={i => dispatch({ type: 'setIntensity', intensity: i })}
        disabled={locked}
      />

      <OutputSheet
        open={sheet === 'output'}
        onClose={() => setSheet(null)}
        model={model}
        aspectRatio={state.aspectRatio}
        duration={state.duration}
        credits={state.credits}
        nodeCost={nodeCost}
        onAspectRatio={v => dispatch({ type: 'setAspectRatio', aspectRatio: v })}
        onDuration={d => dispatch({ type: 'setDuration', duration: d })}
        onModel={id => dispatch({ type: 'setModel', modelId: id })}
        disabled={locked}
      />

      <DirectionSheet
        open={sheet === 'direction'}
        onClose={() => setSheet(null)}
        userPrompt={state.userPrompt}
        suggestion={state.analysis?.suggestedPrompt}
        fidelityMode={state.fidelityMode}
        sceneType={state.sceneType}
        atmosphere={state.atmosphere}
        avoidPeople={state.avoidPeople}
        endImagePreview={state.endImagePreview}
        onUserPrompt={v => dispatch({ type: 'setUserPrompt', userPrompt: v })}
        onFidelity={v => dispatch({ type: 'setFidelity', fidelityMode: v })}
        onScene={s => dispatch({ type: 'setScene', sceneType: s })}
        onAtmosphere={v => dispatch({ type: 'setAtmosphere', atmosphere: v })}
        onAvoidPeople={v => dispatch({ type: 'setAvoidPeople', avoidPeople: v })}
        onEndImage={(file, preview) => dispatch({ type: 'setEndImage', file, preview })}
        disabled={locked}
      />
    </aside>
  )
}
