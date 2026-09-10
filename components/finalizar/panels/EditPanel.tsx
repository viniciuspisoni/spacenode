'use client'

// EditPanel — a edição por IA dentro do editor unificado.
//
// Substitui o antigo CleanupPanel, que tinha uma ação e meia (remover/corrigir)
// e falava com o motor v1. Aqui são as cinco ações do produto sobre o motor
// Seedream (`/api/edit-v4`), com a seleção vinda da varinha mágica.
//
// É a ÚNICA parte da ferramenta que consome Nodes. Todo o resto — exposição,
// cor, curva, HSL, máscaras locais, geometria, camadas, exportação — é local e
// gratuito. O preço aparece antes de executar, sempre.

import { useState } from 'react'
import { ChoiceGroup } from '@/components/app/glass'
import type { EditV4Action } from '@/lib/edit-v4/types'
import { Chip, Label, Section, Seg, SliderRow } from '../ui'
import type { EditSubTool } from '../CanvasViewport'

export interface EditActionDef {
  id: EditV4Action
  /** UMA palavra — é o rótulo do cartão. */
  short: string
  /** Três a cinco palavras, SEMPRE visíveis sob o rótulo. Não é enfeite: é o
   *  que separa "Remover" de "Refinar" — a dúvida que faz alguém pedir para
   *  deletar um objeto quando queria consertar a textura dele, e que custou
   *  uma edição paga em 10/09. Dica de hover não resolveria: quem não sabe que
   *  há diferença não passa o mouse para descobrir. */
  note: string
  placeholder: string
  ref: 'material' | 'object' | null
  refLabel: string
  requiresSelection: boolean
}

export const EDIT_ACTIONS: EditActionDef[] = [
  { id: 'swap_material', short: 'Material', note: 'troca o acabamento', placeholder: 'Ex.: trocar o piso por porcelanato amadeirado', ref: 'material', refLabel: 'Material de referência', requiresSelection: false },
  { id: 'remove', short: 'Remover', note: 'tira o objeto, refaz o fundo', placeholder: 'Ex.: retirar o tapete da sala', ref: null, refLabel: '', requiresSelection: false },
  { id: 'insert_element', short: 'Inserir', note: 'acrescenta algo novo', placeholder: 'Ex.: inserir um vaso com planta no canto', ref: 'object', refLabel: 'Objeto de referência', requiresSelection: true },
  { id: 'replace_object', short: 'Substituir', note: 'um objeto por outro', placeholder: 'Ex.: trocar este sofá por um de couro caramelo', ref: 'object', refLabel: 'Objeto de referência', requiresSelection: true },
  { id: 'refine_area', short: 'Refinar', note: 'conserta textura ou emenda', placeholder: 'Ex.: alisar a costura do estofado', ref: null, refLabel: '', requiresSelection: false },
]

export interface EditPanelProps {
  action: EditV4Action
  onAction: (a: EditV4Action) => void
  instruction: string
  onInstruction: (v: string) => void

  subTool: EditSubTool
  brushSize: number
  onBrushSize: (v: number) => void

  tolerance: number
  onTolerance: (v: number) => void
  contiguous: boolean
  onContiguous: (v: boolean) => void
  wandAvailable: boolean
  hasWand: boolean
  hasSelection: boolean
  onClearSelection: () => void

  referenceUrl: string | null
  onPickReference: () => void
  onClearReference: () => void
  referenceBusy: boolean

  preservation: 'maximum' | 'standard'
  onPreservation: (v: 'maximum' | 'standard') => void
  intensity: 'subtle' | 'standard' | 'strong'
  onIntensity: (v: 'subtle' | 'standard' | 'strong') => void
  edge: 'hard' | 'soft'
  onEdge: (v: 'hard' | 'soft') => void

  nodes: number
  balance: number | null
  busy: boolean
  onExecute: () => void
  message: string | null
  messageKind: 'error' | 'info' | null
}

export function EditPanel(props: EditPanelProps) {
  const [openWhat, setOpenWhat] = useState(true)
  const [openArea, setOpenArea] = useState(true)
  const [openPrecision, setOpenPrecision] = useState(false)

  const def = EDIT_ACTIONS.find(a => a.id === props.action) ?? EDIT_ACTIONS[0]
  const insufficient = props.balance !== null && props.nodes > props.balance
  const blocked = def.requiresSelection && !props.hasSelection
  const canExecute =
    !props.busy && !insufficient && !blocked &&
    (props.hasSelection || props.instruction.trim().length > 0 || !!props.referenceUrl)

  return (
    <div>
      <Section title="O que fazer" open={openWhat} onToggle={() => setOpenWhat(v => !v)}>
        <ChoiceGroup
          label="Ação"
          cols={2}
          value={props.action}
          onChange={props.onAction}
          options={EDIT_ACTIONS.map(a => ({ value: a.id, title: a.short, note: a.note }))}
        />
        <textarea
          className="spn-textarea"
          aria-label="Descreva a mudança"
          rows={3}
          value={props.instruction}
          onChange={e => props.onInstruction(e.target.value)}
          placeholder={def.placeholder}
          disabled={props.busy}
          style={{ marginTop: 10 }}
        />
        {blocked && (
          <p style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
            {props.action === 'insert_element'
              ? 'Marque o lugar onde o elemento entra.'
              : 'Marque o objeto que será trocado.'}
          </p>
        )}

        {def.ref && (
          <div style={{ marginTop: 10 }}>
            {props.referenceUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={props.referenceUrl} alt="Referência" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 8 }} />
                <span style={{ flex: 1, fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{def.refLabel}</span>
                <Chip onClick={props.onClearReference}>Remover</Chip>
              </div>
            ) : (
              <Chip onClick={props.onPickReference} disabled={props.referenceBusy}>
                {props.referenceBusy ? 'Enviando…' : `+ ${def.refLabel}`}
              </Chip>
            )}
          </div>
        )}
      </Section>

      <Section title="Onde" open={openArea} onToggle={() => setOpenArea(v => !v)}>
        <p style={{ fontSize: 11.5, color: 'var(--color-text-quaternary)', lineHeight: 1.55, marginBottom: 10 }}>
          {props.wandAvailable
            ? 'A ferramenta fica na barra sobre a imagem. A varinha pega a superfície inteira num clique; laço, polígono e retângulo desenham a área; Alt subtrai.'
            : 'A varinha fica indisponível com geometria aplicada — ajuste a perspectiva depois de editar. Laço, polígono, retângulo e pincel seguem valendo.'}
        </p>
        {props.subTool === 'wand' && props.wandAvailable ? (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SliderRow
              label="Tolerância" value={props.tolerance} min={0} max={100} defaultValue={11}
              format={v => `${v}`}
              title="Baixa mira o material exato; alta abraça variações de cor"
              onChange={props.onTolerance}
            />
            <Seg
              label="Alcance"
              options={[
                { id: 'perto', label: 'Área conectada' },
                { id: 'toda', label: 'Toda a imagem' },
              ]}
              value={props.contiguous ? 'perto' : 'toda'}
              onChange={v => props.onContiguous(v === 'perto')}
            />
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <SliderRow
              label="Tamanho" value={props.brushSize} min={8} max={240} defaultValue={64}
              format={v => `${v}`} onChange={props.onBrushSize}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <Chip onClick={props.onClearSelection} disabled={!props.hasSelection} title="Limpa a seleção">
            Desmarcar
          </Chip>
          {props.hasWand && <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)', alignSelf: 'center' }}>varinha ativa</span>}
        </div>
      </Section>

      <Section title="Precisão" open={openPrecision} onToggle={() => setOpenPrecision(v => !v)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Seg
            label="Preservação fora da área"
            options={[
              { id: 'maximum', label: 'Preserva o máximo' },
              { id: 'standard', label: 'Padrão' },
            ]}
            value={props.preservation}
            onChange={props.onPreservation}
          />
          <Seg
            label="Intensidade"
            options={[
              { id: 'subtle', label: 'Sutil' },
              { id: 'standard', label: 'Padrão' },
              { id: 'strong', label: 'Forte' },
            ]}
            value={props.intensity}
            onChange={props.onIntensity}
          />
          <Seg
            label="Borda"
            options={[
              { id: 'hard', label: 'Exata' },
              { id: 'soft', label: 'Macia' },
            ]}
            value={props.edge}
            onChange={props.onEdge}
          />
        </div>
      </Section>

      <div style={{ padding: '12px 12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <Label>{props.nodes} nodes</Label>
          <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>
            {props.balance === null ? '' : `Saldo: ${props.balance}`}
          </span>
        </div>
        <button
          type="button"
          className="spn-cta"
          onClick={props.onExecute}
          disabled={!canExecute}
        >
          {props.busy ? 'Editando…' : 'Aplicar na imagem'}
        </button>
        {insufficient && (
          <p style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
            Saldo insuficiente para esta edição.
          </p>
        )}
        <p style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 8, lineHeight: 1.5 }}>
          Só a edição por IA consome nodes. Ajustes, cor, máscaras, geometria e
          exportação são locais e gratuitos.
        </p>
        {props.message && (
          <p style={{
            fontSize: 11.5, marginTop: 8, lineHeight: 1.5,
            color: props.messageKind === 'error' ? 'var(--color-danger-text)' : 'var(--color-text-tertiary)',
          }}>
            {props.message}
          </p>
        )}
      </div>
    </div>
  )
}
