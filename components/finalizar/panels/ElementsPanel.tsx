'use client'

// ElementsPanel — camadas de composição (céu, vegetação, pessoas, veículos,
// imagens, logo). Mover/redimensionar/rotacionar acontecem no canvas; aqui
// ficam ordem, opacidade, mesclagem, espelhar, máscara, duplicar e excluir.

import { useState } from 'react'
import {
  BLEND_MODES, ELEMENT_CATEGORIES, MAX_ELEMENTS,
  type BlendMode, type ElementLayer, type FinalizeDoc,
} from '@/lib/finalizar/types'
import { makeId } from '@/lib/finalizar/composition'
import type { BrushSettings } from '../CanvasViewport'
import { ActiveDot, Chip, Section, Seg, SliderRow } from '../ui'

export interface ElementsPanelProps {
  doc: FinalizeDoc
  patch: (label: string, updater: (d: FinalizeDoc) => FinalizeDoc, coalesceKey?: string) => void
  activeElementId: string | null
  onSelectElement: (id: string | null) => void
  onAddElement: () => void
  elementMaskMode: boolean
  onElementMaskMode: (b: boolean) => void
  brush: BrushSettings
  onBrush: (b: BrushSettings) => void
  /** Calcula gain/offset do elemento vs base e grava em colorMatch (editor). */
  onAutoColorMatch: (id: string) => void
}

export function ElementsPanel(props: ElementsPanelProps) {
  const {
    doc, patch, activeElementId, onSelectElement, onAddElement,
    elementMaskMode, onElementMaskMode, brush, onBrush, onAutoColorMatch,
  } = props
  const [openList, setOpenList] = useState(true)
  const [openProps, setOpenProps] = useState(true)
  const [openMask, setOpenMask] = useState(false)

  const active = doc.elements.find((e) => e.id === activeElementId) ?? null
  const full = doc.elements.length >= MAX_ELEMENTS
  // Topo do painel = topo da composição.
  const ordered = [...doc.elements].reverse()

  const patchEl = (label: string, id: string, up: (e: ElementLayer) => ElementLayer, key?: string) => {
    patch(label, (d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? up(e) : e)) }), key)
  }

  const move = (id: string, dir: 'up' | 'down') => {
    patch(dir === 'up' ? 'Trazer elemento para frente' : 'Enviar elemento para trás', (d) => {
      const arr = [...d.elements]
      const idx = arr.findIndex((e) => e.id === id)
      const target = dir === 'up' ? idx + 1 : idx - 1
      if (idx < 0 || target < 0 || target >= arr.length) return d
      ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
      return { ...d, elements: arr }
    })
  }

  const duplicate = (el: ElementLayer) => {
    patch(`Duplicar ${el.name}`, (d) => {
      if (d.elements.length >= 24) return d
      const copy: ElementLayer = {
        ...el,
        id: makeId('e'),
        name: `${el.name} (cópia)`,
        transform: { ...el.transform, x: Math.min(1.4, el.transform.x + 0.04), y: Math.min(1.4, el.transform.y + 0.04) },
        maskStrokes: el.maskStrokes.map((s) => ({ ...s, points: [...s.points] })),
      }
      const idx = d.elements.findIndex((e) => e.id === el.id)
      const arr = [...d.elements]
      arr.splice(idx + 1, 0, copy)
      return { ...d, elements: arr }
    })
  }

  return (
    <div>
      <Section
        title="Camadas"
        open={openList}
        onToggle={() => setOpenList((v) => !v)}
        right={
          <Chip onClick={onAddElement} disabled={full} title={full ? `Limite de ${MAX_ELEMENTS} elementos por projeto` : 'Adicionar imagem, céu, vegetação, pessoas ou logo como camada'}>
            + Adicionar
          </Chip>
        }
      >
        {ordered.length === 0 && (
          <div style={{ padding: '6px 2px' }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: 0 }}>
              Componha por cima do render: céu, vegetação, pessoas, veículos,
              overlays de luz ou seu logo — de outra geração, do histórico ou de upload.
            </p>
            <ul style={{ margin: '10px 0 0', paddingLeft: 16, fontSize: 11.5, color: 'var(--color-text-tertiary)', lineHeight: 1.7 }}>
              <li>Mover, redimensionar e rotacionar direto no canvas</li>
              <li>Mesclagem, opacidade e máscara por pincel</li>
              <li>Cor ajustada automaticamente ao fundo</li>
            </ul>
            <p style={{ fontSize: 11, color: 'var(--color-text-quaternary)', lineHeight: 1.5, marginTop: 10 }}>
              A imagem base fica sempre protegida no fundo.
            </p>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ordered.map((el, visualIdx) => {
            const isActive = el.id === activeElementId
            const isTop = visualIdx === 0
            const isBottom = visualIdx === ordered.length - 1
            return (
              <div
                key={el.id}
                onClick={() => onSelectElement(isActive ? null : el.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px',
                  borderRadius: 9, cursor: 'pointer',
                  border: `1px solid ${isActive ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                  background: isActive ? 'var(--color-surface)' : 'transparent',
                }}
              >
                <ActiveDot on={isActive} />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); patchEl(el.visible ? `Ocultar ${el.name}` : `Mostrar ${el.name}`, el.id, (x) => ({ ...x, visible: !x.visible })) }}
                  title={el.visible ? 'Ocultar camada' : 'Mostrar camada'}
                  style={{ ...miniBtn, color: el.visible ? 'var(--color-text-secondary)' : 'var(--color-text-quaternary)' }}
                >
                  {el.visible ? <EyeIcon /> : <EyeOffIcon />}
                </button>
                <span style={{ width: 36, height: 27, borderRadius: 6, overflow: 'hidden', flexShrink: 0, border: '0.5px solid var(--color-border)', background: 'var(--color-surface)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={el.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <RenameableName name={el.name} onRename={(n) => patchEl('Renomear elemento', el.id, (x) => ({ ...x, name: n }))} />
                  <div style={{ fontSize: 10.5, color: 'var(--color-text-quaternary)' }}>
                    {ELEMENT_CATEGORIES.find((c) => c.id === el.category)?.label ?? 'Imagem'} · {Math.round(el.opacity * 100)}%
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                  <button type="button" disabled={isTop} onClick={(e) => { e.stopPropagation(); move(el.id, 'up') }} style={{ ...miniBtn, opacity: isTop ? 0.3 : 1 }} title="Trazer para frente"><ChevronUp /></button>
                  <button type="button" disabled={isBottom} onClick={(e) => { e.stopPropagation(); move(el.id, 'down') }} style={{ ...miniBtn, opacity: isBottom ? 0.3 : 1 }} title="Enviar para trás"><ChevronDown /></button>
                  <button type="button" disabled={full} onClick={(e) => { e.stopPropagation(); duplicate(el) }} style={{ ...miniBtn, opacity: full ? 0.3 : 1 }} title={full ? `Limite de ${MAX_ELEMENTS} elementos` : 'Duplicar'}><CopyIcon /></button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!window.confirm(`Remover "${el.name}"?`)) return
                      patch(`Remover ${el.name}`, (d) => ({ ...d, elements: d.elements.filter((x) => x.id !== el.id) }))
                      if (isActive) onSelectElement(null)
                    }}
                    style={miniBtn}
                    title="Remover camada"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {ordered.length > 0 && (
          <p style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 8, lineHeight: 1.5 }}>
            Arraste no canvas para mover · alças redimensionam e rotacionam.
            {full && <> Limite de {MAX_ELEMENTS} elementos atingido.</>}
          </p>
        )}
      </Section>

      {active && (
        <Section title={`Propriedades · ${active.name}`} open={openProps} onToggle={() => setOpenProps((v) => !v)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SliderRow
              label="Opacidade" value={Math.round(active.opacity * 100)} min={0} max={100} defaultValue={100}
              format={(v) => `${v}%`}
              onChange={(v) => patchEl('Opacidade do elemento', active.id, (x) => ({ ...x, opacity: v / 100 }), `el.${active.id}.opacity`)}
            />
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Mesclagem
              <select
                value={active.blendMode}
                onChange={(e) => patchEl('Mesclagem do elemento', active.id, (x) => ({ ...x, blendMode: e.target.value as BlendMode }))}
                style={{
                  fontSize: 12, padding: '5px 8px', borderRadius: 8,
                  border: '1px solid var(--color-input-border)', background: 'var(--color-input)',
                  color: 'var(--color-text-primary)', outline: 'none',
                }}
              >
                {BLEND_MODES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Categoria
              <select
                value={active.category}
                onChange={(e) => patchEl('Categoria do elemento', active.id, (x) => ({ ...x, category: e.target.value as ElementLayer['category'] }))}
                style={{
                  fontSize: 12, padding: '5px 8px', borderRadius: 8,
                  border: '1px solid var(--color-input-border)', background: 'var(--color-input)',
                  color: 'var(--color-text-primary)', outline: 'none',
                }}
              >
                {ELEMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <SliderRow
              label="Suavização" value={active.feather} min={0} max={120}
              format={(v) => `${v}`}
              title="Suaviza a borda da máscara do elemento"
              onChange={(v) => patchEl('Suavização da borda', active.id, (x) => ({ ...x, feather: v }), `el.${active.id}.feather`)}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Chip
                active={Boolean(active.colorMatch)}
                onClick={() => {
                  if (active.colorMatch) {
                    patchEl('Remover ajuste de cor do elemento', active.id, (x) => ({ ...x, colorMatch: null }))
                  } else {
                    onAutoColorMatch(active.id)
                  }
                }}
                title={active.colorMatch ? 'Remove a correspondência de cor com o fundo' : 'Aproxima a cor do elemento à da imagem base'}
              >
                {active.colorMatch ? 'Cor ajustada ✓' : 'Ajustar cor ao fundo'}
              </Chip>
              <Chip
                active={active.transform.flipH}
                onClick={() => patchEl('Espelhar horizontal', active.id, (x) => ({ ...x, transform: { ...x.transform, flipH: !x.transform.flipH } }))}
                title="Espelhar horizontalmente"
              >
                ⇋ Espelhar H
              </Chip>
              <Chip
                active={active.transform.flipV}
                onClick={() => patchEl('Espelhar vertical', active.id, (x) => ({ ...x, transform: { ...x.transform, flipV: !x.transform.flipV } }))}
                title="Espelhar verticalmente"
              >
                ⇵ Espelhar V
              </Chip>
              <Chip
                onClick={() => patchEl('Redefinir rotação', active.id, (x) => ({ ...x, transform: { ...x.transform, rotation: 0 } }))}
                disabled={active.transform.rotation === 0}
                title="Zera a rotação"
              >
                Rotação 0°
              </Chip>
            </div>
            {active.colorMatch && (
              <SliderRow
                label="Cor ao fundo" value={active.colorMatch.amount} min={0} max={100} defaultValue={70}
                format={(v) => `${v}%`}
                title="Intensidade da correspondência de cor com a base"
                onChange={(v) => patchEl('Intensidade da cor ao fundo', active.id, (x) => (x.colorMatch ? { ...x, colorMatch: { ...x.colorMatch, amount: v } } : x), `el.${active.id}.cmatch`)}
              />
            )}
          </div>
        </Section>
      )}

      {active && (
        <Section title="Máscara do elemento" open={openMask || elementMaskMode} onToggle={() => setOpenMask((v) => !v)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Seg
              options={[
                { id: 'transform', label: 'Transformar', title: 'Mover, redimensionar e rotacionar no canvas' },
                { id: 'paint', label: 'Pintar máscara', title: 'Revele ou oculte partes do elemento com o pincel' },
              ]}
              value={elementMaskMode ? 'paint' : 'transform'}
              onChange={(v) => onElementMaskMode(v === 'paint')}
            />
            {elementMaskMode && (
              <>
                <Seg
                  options={[
                    { id: 'paint', label: 'Revelar', title: 'Mostra o elemento na área pintada' },
                    { id: 'erase', label: 'Ocultar', title: 'Esconde o elemento na área pintada' },
                  ]}
                  value={brush.erase ? 'erase' : 'paint'}
                  onChange={(v) => onBrush({ ...brush, erase: v === 'erase' })}
                />
                <SliderRow label="Tamanho" value={brush.size} min={8} max={240} defaultValue={64}
                  format={(v) => `${v}`} onChange={(v) => onBrush({ ...brush, size: v })} />
                <SliderRow label="Dureza" value={Math.round(brush.hardness * 100)} min={0} max={100} defaultValue={50}
                  format={(v) => `${v}%`} onChange={(v) => onBrush({ ...brush, hardness: v / 100 })} />
              </>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Chip
                onClick={() => patchEl('Mostrar elemento inteiro', active.id, (x) => ({ ...x, maskFill: 'full', maskStrokes: [], maskUrl: null }))}
                title="Limpa a máscara — elemento todo visível"
              >
                Mostrar tudo
              </Chip>
              <Chip
                onClick={() => patchEl('Ocultar elemento inteiro', active.id, (x) => ({ ...x, maskFill: 'empty', maskStrokes: [], maskUrl: null }))}
                title="Oculta tudo — pinte para revelar só o que quiser"
              >
                Ocultar tudo
              </Chip>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

// ── mini componentes (compartilham o estilo do MasksPanel) ───────────────────

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
  width: 23, height: 23, borderRadius: 6, background: 'transparent',
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
const ChevronUp = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
)
const ChevronDown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
)
const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
)
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
)
