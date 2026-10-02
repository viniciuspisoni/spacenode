'use client'

// Folha "Formato e custo" — proporção, duração e motor.
//
// O motor subiu para cá vindo do bloco recolhido, e essa é a mudança de
// produto desta folha: ele é o ÚNICO controle que resolve "saldo
// insuficiente". O cadastro dá 80 nodes, o preset default custa 280 — quem
// nunca abria os avançados só via o botão morto. Por isso os três campos
// carregam o preço junto e a dica de baixo diz o que cabe no saldo.

import { Sheet, ChoiceGroup } from '@/components/app/glass'
import {
  getNodeCost,
  listAvailableVideoModels,
  type VideoModel,
} from '@/lib/video/models'
import { cheapestFit, offeredFormats } from './animateLabels'

interface Props {
  open:        boolean
  onClose:     () => void
  model:       VideoModel
  aspectRatio: string
  duration:    string
  credits:     number
  nodeCost:    number
  onAspectRatio: (v: string) => void
  onDuration:    (v: string) => void
  onModel:       (id: string) => void
  disabled?:     boolean
}

// Faixa de preço do motor — é o número que responde "qual cabe no meu saldo?".
function costRange(m: VideoModel): string {
  const costs = m.supportedDurations
    .map(d => m.costInNodes[d])
    .filter((c): c is number => typeof c === 'number')
  if (costs.length === 0) return ''
  const min = Math.min(...costs)
  const max = Math.max(...costs)
  return min === max ? `${min} nodes` : `${min}–${max} nodes`
}

export default function OutputSheet({
  open, onClose, model, aspectRatio, duration, credits, nodeCost,
  onAspectRatio, onDuration, onModel, disabled,
}: Props) {
  const formats = offeredFormats()
  const missing = formats.filter(o => !model.supportedAspectRatios.includes(o.id))
  const owners = Array.from(new Set(
    listAvailableVideoModels()
      .filter(m => m.id !== model.id && missing.some(o => m.supportedAspectRatios.includes(o.id)))
      .map(m => m.label),
  ))

  const models = listAvailableVideoModels()
  const insufficient = credits < nodeCost
  const fit = insufficient ? cheapestFit(credits) : null

  return (
    <Sheet open={open} title="Formato e custo" onClose={onClose}>
      <div className="spn-field">
        <span className="spn-field-label">Formato</span>
        <ChoiceGroup
          label="Formato"
          value={aspectRatio}
          onChange={onAspectRatio}
          cols={formats.length > 3 ? 2 : 3}
          options={formats.map(o => ({
            value:    o.id,
            title:    o.label,
            note:     o.note,
            disabled: disabled || !model.supportedAspectRatios.includes(o.id),
          }))}
        />
        {missing.length > 0 && owners.length > 0 && (
          <p className="spn-hint">
            {missing.map(o => o.label).join(' e ')} {missing.length > 1 ? 'exigem' : 'exige'}{' '}
            o motor {owners.join(' ou ')}.
          </p>
        )}
      </div>

      <div className="spn-field">
        <span className="spn-field-label">Duração</span>
        <ChoiceGroup
          label="Duração"
          value={duration}
          onChange={onDuration}
          cols={model.supportedDurations.length > 2 ? 3 : 2}
          options={model.supportedDurations.map(d => {
            let cost = 0
            try { cost = getNodeCost(model.id, d) } catch { cost = 0 }
            return { value: d, title: `${d}s`, note: `${cost} nodes`, disabled }
          })}
        />
      </div>

      <div className="spn-field">
        <span className="spn-field-label">Motor</span>
        <ChoiceGroup
          label="Motor"
          value={model.id}
          onChange={onModel}
          cols={models.length > 2 ? 3 : 2}
          options={models.map(m => ({
            value:    m.id,
            title:    m.label,
            note:     costRange(m),
            disabled,
          }))}
        />
        <p className="spn-hint">
          {insufficient
            ? fit
              // Trocar o motor NÃO leva junto a duração que cabe: o estado cai
              // na duração mais longa que o novo motor suporta (useAnimateState
              // :217), que é também a mais cara. Sem dizer isso, o usuário
              // clica no motor barato e continua com o botão morto.
              ? fit.label === model.label
                ? <>Seu saldo é de {credits} nodes. Com <b>{fit.duration}s</b> este motor custa {fit.cost} — cabe. Ajuste a duração acima.</>
                : <>Seu saldo é de {credits} nodes. Cabe o motor <b>{fit.label}</b> com {fit.duration}s: {fit.cost} nodes. Troque o motor aqui e volte à duração para {fit.duration}s.</>
              : <>Seu saldo é de {credits} nodes e nenhuma combinação cabe. Compre nodes para gerar.</>
            : 'Trocar o motor ajusta duração e formato para o que ele entrega de verdade.'}
        </p>
      </div>
    </Sheet>
  )
}
