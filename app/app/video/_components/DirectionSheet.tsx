'use client'

// Folha "Direção" — o que o usuário quer dizer sobre a cena, quando quiser
// dizer algo. Todos os seis campos já vêm resolvidos pelo preset e pela
// análise da imagem; por isso a linha resume "Padrão do preset" enquanto
// ninguém mexe, e só passa a listar valores quando há desvio de verdade.

import { Sheet, ChoiceGroup, PillGroup, MultiPillGroup } from '@/components/app/glass'
import { SCENE_TYPES, SCENE_TYPE_ORDER, type SceneTypeId } from '@/lib/video/scenes'
import type { FidelityMode } from '@/lib/video/promptBuilder'
import ReferenceFrameUploader from './ReferenceFrameUploader'
import {
  ATMOSPHERES,
  FIDELITY_LABELS,
  FIDELITY_NOTES,
  FIDELITY_ORDER,
  atmosphereLabel,
} from './animateLabels'

const AVOID_PEOPLE = 'Evitar pessoas'

interface Props {
  open:            boolean
  onClose:         () => void
  userPrompt:      string
  suggestion?:     string
  fidelityMode:    FidelityMode
  sceneType:       SceneTypeId
  atmosphere:      string
  avoidPeople:     boolean
  endImagePreview: string | null
  onUserPrompt:    (v: string) => void
  onFidelity:      (v: FidelityMode) => void
  onScene:         (v: SceneTypeId) => void
  onAtmosphere:    (v: string) => void
  onAvoidPeople:   (v: boolean) => void
  onEndImage:      (file: File | null, preview: string | null) => void
  disabled?:       boolean
}

export default function DirectionSheet({
  open, onClose, userPrompt, suggestion, fidelityMode, sceneType, atmosphere,
  avoidPeople, endImagePreview, onUserPrompt, onFidelity, onScene, onAtmosphere,
  onAvoidPeople, onEndImage, disabled,
}: Props) {
  return (
    <Sheet open={open} title="Direção" onClose={onClose}>
      <div className="spn-field">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, marginBottom: 8,
        }}>
          <span className="spn-field-label" style={{ marginBottom: 0 }}>Direção criativa</span>
          {suggestion && suggestion !== userPrompt && (
            <button
              type="button"
              className="spn-pill"
              onClick={() => onUserPrompt(suggestion)}
              disabled={disabled}
              style={{ padding: '4px 11px', fontSize: 11 }}
            >
              Usar sugestão
            </button>
          )}
        </div>
        <textarea
          className="spn-textarea"
          value={userPrompt}
          onChange={e => onUserPrompt(e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="Ex: câmera entrando lentamente na sala, preservando materiais e mobiliário."
        />
        <p className="spn-hint">
          Complementa as diretivas de preservação — nunca as substitui.
        </p>
      </div>

      <div className="spn-field">
        <span className="spn-field-label">Fidelidade ao projeto</span>
        <ChoiceGroup
          label="Fidelidade ao projeto"
          value={fidelityMode}
          onChange={onFidelity}
          cols={3}
          options={FIDELITY_ORDER.map(id => ({
            value: id,
            title: FIDELITY_LABELS[id],
            note:  FIDELITY_NOTES[id],
            disabled,
          }))}
        />
      </div>

      <div className="spn-field">
        <span className="spn-field-label">Tipo de cena</span>
        <PillGroup
          label="Tipo de cena"
          value={SCENE_TYPES[sceneType].label}
          onChange={label => {
            const id = SCENE_TYPE_ORDER.find(s => SCENE_TYPES[s].label === label)
            if (id) onScene(id)
          }}
          options={SCENE_TYPE_ORDER.map(id => SCENE_TYPES[id].label)}
          disabled={disabled}
        />
      </div>

      <div className="spn-field">
        <span className="spn-field-label">Atmosfera</span>
        <PillGroup
          label="Atmosfera"
          value={atmosphereLabel(atmosphere)}
          onChange={label => {
            const chip = ATMOSPHERES.find(a => a.label === label)
            if (chip) onAtmosphere(chip.value)
          }}
          options={ATMOSPHERES.map(a => a.label)}
          disabled={disabled}
        />
      </div>

      <div className="spn-field">
        <span className="spn-field-label">Pessoas</span>
        <MultiPillGroup
          label="Pessoas"
          values={avoidPeople ? [AVOID_PEOPLE] : []}
          onChange={vals => onAvoidPeople(vals.includes(AVOID_PEOPLE))}
          options={[AVOID_PEOPLE]}
          disabled={disabled}
        />
        <p className="spn-hint">Reforça que a cena permaneça sem figuras humanas.</p>
      </div>

      <div className="spn-field">
        <span className="spn-field-label">Frame final (opcional)</span>
        <ReferenceFrameUploader
          hint="Arraste ou clique para dirigir o final do vídeo"
          preview={endImagePreview}
          onLoaded={(file, preview) => onEndImage(file, preview)}
          onClear={() => onEndImage(null, null)}
          disabled={disabled}
          compact
        />
      </div>
    </Sheet>
  )
}
