'use client'

// MasksPanel — ajustes locais por máscara: pincel, gradientes, céu (heurística
// local), luminosidade (janelas estouradas / sombras). Nada aqui usa Nodes.

import { MAX_LOCAL_ADJUSTMENTS, type FinalizeDoc, type LocalAdjustment } from '@/lib/finalizar/types'
import { makeId } from '@/lib/finalizar/composition'
import type { BrushSettings, MaskOverlayColor } from '../CanvasViewport'
import { ActiveDot, Chip, Section, SliderRow, Seg } from '../ui'
import { useState } from 'react'

export type QuickMask = 'brush' | 'linear' | 'radial' | 'sky' | 'windows' | 'shadows'

export interface MasksPanelProps {
  doc: FinalizeDoc
  patch: (label: string, updater: (d: FinalizeDoc) => FinalizeDoc, coalesceKey?: string) => void
  activeLocalId: string | null
  onSelectLocal: (id: string | null) => void
  brush: BrushSettings
  onBrush: (b: BrushSettings) => void
  maskInteraction: 'brush' | 'shape'
  onMaskInteraction: (m: 'brush' | 'shape') => void
  showMaskOverlay: boolean
  onToggleOverlay: () => void
  maskOverlayColor: MaskOverlayColor
  onMaskOverlayColor: (c: MaskOverlayColor) => void
  /** Criação fica no editor (céu precisa do viewport). */
  onAddLocal: (kind: QuickMask) => void
  skyBusy: boolean
}

const KIND_LABEL: Record<string, string> = {
  brush: 'Pincel', linear: 'Gradiente linear', radial: 'Gradiente radial',
  luminosity: 'Luminosidade', sky: 'Céu',
}

export function MasksPanel(props: MasksPanelProps) {
  const {
    doc, patch, activeLocalId, onSelectLocal, brush, onBrush,
    maskInteraction, onMaskInteraction, showMaskOverlay, onToggleOverlay,
    maskOverlayColor, onMaskOverlayColor, onAddLocal, skyBusy,
  } = props
  const [openList, setOpenList] = useState(true)
  const [openBrush, setOpenBrush] = useState(true)
  const [openAdjust, setOpenAdjust] = useState(true)

  const active = doc.locals.find((l) => l.id === activeLocalId) ?? null
  const full = doc.locals.length >= MAX_LOCAL_ADJUSTMENTS

  const patchLocal = (label: string, id: string, up: (l: LocalAdjustment) => LocalAdjustment, key?: string) => {
    patch(label, (d) => ({ ...d, locals: d.locals.map((l) => (l.id === id ? up(l) : l)) }), key)
  }

  const localValue = (label: string, field: keyof LocalAdjustment['values']) => ({
    value: active ? active.values[field] : 0,
    onChange: (v: number) => {
      if (!active) return
      patchLocal(`${active.name} — ${label}`, active.id, (l) => ({ ...l, values: { ...l.values, [field]: v } }), `local.${active.id}.${field}`)
    },
  })

  return (
    <div>
      <Section title="Nova máscara" open={openList} onToggle={() => setOpenList((v) => !v)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Chip onClick={() => onAddLocal('brush')} disabled={full} title="Pinte a área que recebe os ajustes">Pincel</Chip>
          <Chip onClick={() => onAddLocal('linear')} disabled={full} title="Arraste no canvas para definir a transição">Linear</Chip>
          <Chip onClick={() => onAddLocal('radial')} disabled={full} title="Arraste no canvas para definir a elipse">Radial</Chip>
          <Chip onClick={() => onAddLocal('sky')} disabled={full || skyBusy} title="Seleção automática do céu (beta) — refine com o pincel">
            {skyBusy ? 'Detectando…' : 'Céu (auto)'}
          </Chip>
          <Chip onClick={() => onAddLocal('windows')} disabled={full} title="Seleciona as áreas mais claras — recupere janelas estouradas">Janelas estouradas</Chip>
          <Chip onClick={() => onAddLocal('shadows')} disabled={full} title="Seleciona as áreas mais escuras — abra ou aprofunde sombras">Sombras</Chip>
        </div>
        {full && (
          <p style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 8, lineHeight: 1.5 }}>
            Limite de {MAX_LOCAL_ADJUSTMENTS} máscaras por projeto.
          </p>
        )}

        {doc.locals.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
            {doc.locals.map((l) => {
              const isActive = l.id === activeLocalId
              return (
                <div
                  key={l.id}
                  onClick={() => onSelectLocal(isActive ? null : l.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
                    borderRadius: 9, cursor: 'pointer',
                    border: `1px solid ${isActive ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                    background: isActive ? 'var(--color-surface)' : 'transparent',
                  }}
                >
                  <ActiveDot on={isActive} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      patchLocal(l.enabled ? `Desativar ${l.name}` : `Ativar ${l.name}`, l.id, (x) => ({ ...x, enabled: !x.enabled }))
                    }}
                    title={l.enabled ? 'Desativar máscara' : 'Ativar máscara'}
                    style={{ ...miniBtn, color: l.enabled ? 'var(--color-text-secondary)' : 'var(--color-text-quaternary)' }}
                  >
                    {l.enabled ? <EyeIcon /> : <EyeOffIcon />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <RenameableName
                      name={l.name}
                      onRename={(n) => patchLocal('Renomear máscara', l.id, (x) => ({ ...x, name: n }))}
                    />
                    <div style={{ fontSize: 10.5, color: 'var(--color-text-quaternary)' }}>{KIND_LABEL[l.shape.kind]}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!window.confirm(`Remover a máscara "${l.name}"?`)) return
                      patch(`Remover ${l.name}`, (d) => ({ ...d, locals: d.locals.filter((x) => x.id !== l.id) }))
                      if (isActive) onSelectLocal(null)
                    }}
                    title="Remover máscara"
                    style={miniBtn}
                  >
                    <TrashIcon />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {doc.locals.length === 0 && (
          <p style={{ fontSize: 11.5, color: 'var(--color-text-quaternary)', marginTop: 10, lineHeight: 1.55 }}>
            Máscaras aplicam ajustes só onde você quer — luz interna vs. externa,
            céu, janelas, materiais.
          </p>
        )}
      </Section>

      {active && (
        <Section title={`Pincel · ${active.name}`} open={openBrush} onToggle={() => setOpenBrush((v) => !v)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(active.shape.kind === 'linear' || active.shape.kind === 'radial') && (
              <Seg
                options={[
                  { id: 'shape', label: 'Forma', title: 'Arraste no canvas para reposicionar o gradiente' },
                  { id: 'brush', label: 'Refinar', title: 'Pinte para adicionar ou apagar áreas' },
                ]}
                value={maskInteraction}
                onChange={onMaskInteraction}
              />
            )}
            {active.shape.kind === 'radial' && (
              <SliderRow label="Suavidade" value={Math.round(active.shape.feather * 100)} min={5} max={95} defaultValue={50}
                format={(v) => `${v}%`}
                title="Transição da borda do gradiente radial"
                onChange={(v) => patchLocal('Suavidade do radial', active.id, (l) => l.shape.kind === 'radial' ? ({ ...l, shape: { ...l.shape, feather: v / 100 } }) : l, `local.${active.id}.rfeather`)} />
            )}
            {active.shape.kind === 'luminosity' && (
              <>
                <SliderRow label="De (escuro)" value={Math.round(active.shape.min * 100)} min={0} max={100}
                  format={(v) => `${v}%`}
                  onChange={(v) => patchLocal('Faixa de luminosidade', active.id, (l) => l.shape.kind === 'luminosity' ? ({ ...l, shape: { ...l.shape, min: Math.min(v / 100, l.shape.max - 0.02) } }) : l, `local.${active.id}.lmin`)} />
                <SliderRow label="Até (claro)" value={Math.round(active.shape.max * 100)} min={0} max={100} defaultValue={100}
                  format={(v) => `${v}%`}
                  onChange={(v) => patchLocal('Faixa de luminosidade', active.id, (l) => l.shape.kind === 'luminosity' ? ({ ...l, shape: { ...l.shape, max: Math.max(v / 100, l.shape.min + 0.02) } }) : l, `local.${active.id}.lmax`)} />
                <SliderRow label="Transição" value={Math.round(active.shape.smooth * 100)} min={1} max={40} defaultValue={15}
                  format={(v) => `${v}%`}
                  onChange={(v) => patchLocal('Transição da luminosidade', active.id, (l) => l.shape.kind === 'luminosity' ? ({ ...l, shape: { ...l.shape, smooth: v / 100 } }) : l, `local.${active.id}.lsmooth`)} />
              </>
            )}
            <Seg
              options={[
                { id: 'paint', label: 'Pintar', title: 'Adiciona à área da máscara' },
                { id: 'erase', label: 'Borracha', title: 'Remove da área da máscara' },
              ]}
              value={brush.erase ? 'erase' : 'paint'}
              onChange={(v) => onBrush({ ...brush, erase: v === 'erase' })}
            />
            <SliderRow label="Tamanho" value={brush.size} min={8} max={240} defaultValue={64}
              format={(v) => `${v}`} onChange={(v) => onBrush({ ...brush, size: v })} />
            <SliderRow label="Dureza" value={Math.round(brush.hardness * 100)} min={0} max={100} defaultValue={50}
              format={(v) => `${v}%`} onChange={(v) => onBrush({ ...brush, hardness: v / 100 })} />
            <SliderRow label="Fluxo" value={Math.round(brush.flow * 100)} min={5} max={100} defaultValue={100}
              format={(v) => `${v}%`} onChange={(v) => onBrush({ ...brush, flow: v / 100 })} />
            {(active.shape.kind === 'brush' || active.shape.kind === 'sky') && (
              <SliderRow label="Suavizar borda" value={active.feather} min={0} max={150}
                format={(v) => `${v}`}
                title="Suaviza a borda de toda a máscara"
                onChange={(v) => patchLocal('Suavizar borda da máscara', active.id, (l) => ({ ...l, feather: v }), `local.${active.id}.feather`)} />
            )}
            <SliderRow label="Densidade" value={active.density} min={0} max={100} defaultValue={100}
              format={(v) => `${v}%`}
              title="Teto de intensidade do efeito da máscara"
              onChange={(v) => patchLocal('Densidade da máscara', active.id, (l) => ({ ...l, density: v }), `local.${active.id}.density`)} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              <Chip active={showMaskOverlay} onClick={onToggleOverlay} title="Ver a área da máscara colorida sobre a imagem">Ver máscara</Chip>
              <Chip
                active={active.invert}
                onClick={() => patchLocal(`Inverter ${active.name}`, active.id, (l) => ({ ...l, invert: !l.invert }))}
                title="Inverte a área afetada"
              >
                Inverter
              </Chip>
              <Chip
                onClick={() => {
                  if (full) return
                  patch(`Duplicar ${active.name}`, (d) => {
                    const idx = d.locals.findIndex((l) => l.id === active.id)
                    if (idx < 0 || d.locals.length >= MAX_LOCAL_ADJUSTMENTS) return d
                    const src = d.locals[idx]
                    const copy: LocalAdjustment = {
                      ...src,
                      id: makeId('m'),
                      name: `${src.name} (cópia)`,
                      strokes: src.strokes.map((s) => ({ ...s, points: [...s.points] })),
                      values: { ...src.values },
                      shape: { ...src.shape },
                    }
                    const arr = [...d.locals]
                    arr.splice(idx + 1, 0, copy)
                    return { ...d, locals: arr }
                  })
                }}
                disabled={full}
                title={full ? `Limite de ${MAX_LOCAL_ADJUSTMENTS} máscaras` : 'Duplica esta máscara com os mesmos ajustes'}
              >
                Duplicar
              </Chip>
              <Chip
                onClick={() => patchLocal(`Limpar traços de ${active.name}`, active.id, (l) => ({ ...l, strokes: [] }))}
                disabled={active.strokes.length === 0}
                title="Remove os traços de pincel desta máscara"
              >
                Limpar traços
              </Chip>
            </div>
            {showMaskOverlay && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>Cor da visualização</span>
                {([['green', 'Verde'], ['red', 'Vermelho'], ['white', 'Branco']] as [MaskOverlayColor, string][]).map(([c, label]) => (
                  <Chip key={c} active={maskOverlayColor === c} onClick={() => onMaskOverlayColor(c)} title={label}>
                    {label}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {active && (
        <Section title="Ajustes da máscara" open={openAdjust} onToggle={() => setOpenAdjust((v) => !v)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <SliderRow label="Exposição" min={-100} max={100} {...localValue('Exposição', 'exposure')} />
            <SliderRow label="Contraste" min={-100} max={100} {...localValue('Contraste', 'contrast')} />
            <SliderRow label="Realces" min={-100} max={100} {...localValue('Realces', 'highlights')} />
            <SliderRow label="Sombras" min={-100} max={100} {...localValue('Sombras', 'shadows')} />
            <SliderRow label="Temperatura" min={-100} max={100} {...localValue('Temperatura', 'temperature')} />
            <SliderRow label="Matiz" min={-100} max={100} {...localValue('Matiz', 'tint')} />
            <SliderRow label="Saturação" min={-100} max={100} {...localValue('Saturação', 'saturation')} />
            <SliderRow label="Clareza" min={-100} max={100} {...localValue('Clareza', 'clarity')}
              title="Realça materiais e texturas na área da máscara" />
            <SliderRow label="Nitidez" min={-100} max={100} {...localValue('Nitidez', 'sharpness')}
              title="Positivo aumenta a nitidez; negativo suaviza (reduz aparência plástica)" />
          </div>
        </Section>
      )}
    </div>
  )
}

// ── mini componentes ─────────────────────────────────────────────────────────

function RenameableName({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  if (!editing) {
    return (
      <div
        onDoubleClick={(e) => { e.stopPropagation(); setDraft(name); setEditing(true) }}
        title="Duplo-clique para renomear"
        style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {name}
      </div>
    )
  }
  const commit = () => {
    const n = draft.trim()
    if (n && n !== name) onRename(n)
    setEditing(false)
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: '100%', fontSize: 12.5, padding: '2px 6px', borderRadius: 6,
        border: '0.5px solid var(--color-border-strong)', background: 'var(--color-bg)',
        color: 'var(--color-text-primary)', outline: 'none',
      }}
    />
  )
}

const miniBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 6, background: 'transparent',
  color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0, border: 'none',
}

const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOffIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.36M6.6 6.6A13.2 13.2 0 0 0 2 11s3.5 7 10 7a9 9 0 0 0 3.4-.65" /><path d="M3 3l18 18" />
  </svg>
)
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
)
