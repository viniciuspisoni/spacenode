'use client'

// Folha "Câmera" — movimento + intensidade.
//
// O catálogo dos 19 movimentos estava enterrado num bloco recolhido dentro de
// outro bloco recolhido; a superfície ficava com uma lista curada de 7 e uma
// nota de rodapé para avisar que o movimento em uso não estava ali. Aqui os 19
// aparecem de uma vez, em blocos por contexto — numa folha rolável cabe o
// catálogo inteiro sem custar nada a quem nunca a abre.

import { Sheet, PillGroup } from '@/components/app/glass'
import {
  CAMERA_GROUPS,
  CAMERA_MOTIONS,
  type CameraIntensity,
  type CameraMotion,
  type CameraMotionId,
} from '@/lib/video/cameraPresets'
import type { MotionChoice } from '@/lib/video/videoPresets'
import {
  AUTO_MOTION_LABEL,
  INTENSITY_HINTS,
  INTENSITY_LABELS,
  INTENSITY_ORDER,
  QUICK_MOTION_IDS,
  motionIdByLabel,
  motionLabels,
} from './animateLabels'

type GroupId = keyof typeof CAMERA_GROUPS

// Os nomes do catálogo ('Comercial / corporativo', 'Redes sociais') são de
// documentação; como rótulo de bloco eles competem com os das pílulas.
const GROUP_LABELS: Record<GroupId, string> = {
  interior:   'Interiores',
  facade:     'Fachadas',
  commercial: 'Comercial',
  social:     'Redes sociais',
  generic:    'Genéricos',
}

const GROUP_ORDER: GroupId[] = ['interior', 'facade', 'commercial', 'social', 'generic']

interface Props {
  open:           boolean
  onClose:        () => void
  choice:         MotionChoice
  resolvedMotion: CameraMotion
  intensity:      CameraIntensity
  /**
   * A análise da imagem chegou a indicar um movimento? Em 'Automático' o
   * valor vem da análise SE houver; senão do preset e por fim do tipo de
   * cena (useAnimateState:resolveMotion). Sem esta distinção a dica afirmava
   * "é o movimento que a análise indicou" mesmo sem imagem carregada.
   */
  fromAnalysis?:  boolean
  onMotion:       (choice: MotionChoice) => void
  onIntensity:    (intensity: CameraIntensity) => void
  disabled?:      boolean
}

export default function CameraSheet({
  open, onClose, choice, resolvedMotion, intensity, fromAnalysis,
  onMotion, onIntensity, disabled,
}: Props) {
  const isAuto = choice === 'auto'
  const currentLabel = isAuto ? '' : CAMERA_MOTIONS[choice as CameraMotionId].label

  function pick(label: string) {
    if (label === AUTO_MOTION_LABEL) { onMotion('auto'); return }
    const id = motionIdByLabel(label)
    if (id) onMotion(id)
  }

  return (
    <Sheet open={open} title="Câmera" onClose={onClose}>
      <div className="spn-field">
        <span className="spn-field-label">Movimento</span>
        <PillGroup
          label="Movimento"
          value={isAuto ? AUTO_MOTION_LABEL : currentLabel}
          onChange={pick}
          options={[AUTO_MOTION_LABEL, ...motionLabels(QUICK_MOTION_IDS)]}
          disabled={disabled}
        />
        <p className="spn-hint">
          {isAuto
            ? fromAnalysis
              ? <>Automático usa <b>{resolvedMotion.label}</b> nesta imagem — é o movimento que a análise indicou.</>
              : <>Automático usa <b>{resolvedMotion.label}</b>, o padrão deste tipo de vídeo. Com a imagem analisada, passa a seguir a cena.</>
            : resolvedMotion.description}
        </p>
      </div>

      {GROUP_ORDER.map(gid => (
        <div className="spn-field" key={gid}>
          <span className="spn-field-label">{GROUP_LABELS[gid]}</span>
          <PillGroup
            label={GROUP_LABELS[gid]}
            value={currentLabel}
            onChange={pick}
            options={motionLabels(CAMERA_GROUPS[gid].motionIds)}
            disabled={disabled}
          />
        </div>
      ))}

      <div className="spn-field">
        <span className="spn-field-label">Intensidade</span>
        <PillGroup
          label="Intensidade"
          value={INTENSITY_LABELS[intensity]}
          onChange={label => {
            const id = INTENSITY_ORDER.find(i => INTENSITY_LABELS[i] === label)
            if (id) onIntensity(id)
          }}
          options={INTENSITY_ORDER.map(i => INTENSITY_LABELS[i])}
          disabled={disabled}
        />
        <p className="spn-hint">{INTENSITY_HINTS[intensity]}</p>
      </div>
    </Sheet>
  )
}
