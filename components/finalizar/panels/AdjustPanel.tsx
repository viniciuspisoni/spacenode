'use client'

// components/finalizar/panels/AdjustPanel.tsx — painel de ajustes globais
// (lado direito do Finalizar): histograma, predefinições, luz, cor,
// presença e efeitos. Todos os controles gravam via patch() com coalesceKey
// estável por controle, para arrastos virarem um único passo do histórico.

import { useEffect, useMemo, useState } from 'react'
import type { Adjustments, FinalizeDoc, Vignette } from '@/lib/finalizar/types'
import {
  BUILTIN_PRESETS,
  loadUserPresets,
  saveUserPreset,
  deleteUserPreset,
  materializePreset,
  type AdjustPreset,
} from '@/lib/finalizar/presets'
import { makeId } from '@/lib/finalizar/composition'
import { Chip, Section, SliderRow } from '@/components/finalizar/ui'

/** Correções de um clique orientadas a arquitetura (o editor executa). */
export type QuickFix =
  | 'janelas' | 'interior-exterior' | 'estouradas' | 'materiais' | 'luz-artificial'

export interface AdjustPanelProps {
  doc: FinalizeDoc
  patch: (label: string, updater: (d: FinalizeDoc) => FinalizeDoc, coalesceKey?: string) => void
  histogram: { luma: Uint32Array; max: number } | null
  wbPicking: boolean
  onToggleWbPick: () => void
  onQuickFix: (kind: QuickFix) => void
  quickFixDisabled: boolean
}

const column: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 7 }

export function AdjustPanel({ doc, patch, histogram, wbPicking, onToggleWbPick, onQuickFix, quickFixDisabled }: AdjustPanelProps): React.ReactElement {
  const [open, setOpen] = useState({
    rapidas: true,
    presets: false,
    luz: true,
    cor: true,
    presenca: false,
    efeitos: false,
  })
  const toggle = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  // Predefinições do usuário — carregadas no cliente (localStorage; SSR-safe).
  const [userPresets, setUserPresets] = useState<AdjustPreset[]>([])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage só existe no cliente (evita mismatch de hidratação)
    setUserPresets(loadUserPresets())
  }, [])

  const setAdj = (key: keyof Adjustments, label: string) => (v: number) =>
    patch(label, (d) => ({ ...d, adjust: { ...d.adjust, [key]: v } }), `adjust.${key}`)

  const setVig = (key: keyof Vignette, label: string) => (v: number) =>
    patch(label, (d) => ({ ...d, vignette: { ...d.vignette, [key]: v } }), `vignette.${key}`)

  const applyPreset = (p: AdjustPreset) => {
    const m = materializePreset(p)
    patch('Predefinição: ' + p.name, (d) => ({
      ...d,
      adjust: m.adjust,
      vignette: m.vignette,
      curve: m.curve,
      hsl: m.hsl,
      grading: m.grading,
    }))
  }

  const savePresetFromCurrent = () => {
    const name = window.prompt('Nome da predefinição')
    if (!name || !name.trim()) return
    setUserPresets(
      saveUserPreset({
        id: makeId('p'),
        name: name.trim(),
        adjust: doc.adjust,
        vignette: doc.vignette,
        curve: doc.curve,
        hsl: doc.hsl,
        grading: doc.grading,
      })
    )
  }

  const removePreset = (p: AdjustPreset) => {
    if (!window.confirm(`Excluir a predefinição “${p.name}”?`)) return
    setUserPresets(deleteUserPreset(p.id))
  }

  // Silhueta do histograma (256 faixas de luminosidade → path SVG).
  const histPath = useMemo(() => {
    if (!histogram || histogram.max <= 0) return null
    const H = 64
    const n = histogram.luma.length
    if (n < 2) return null
    let d = `M 0 ${H}`
    for (let i = 0; i < n; i++) {
      const h = ((histogram.luma[i] ?? 0) / histogram.max) * (H - 2)
      d += ` L ${i} ${(H - h).toFixed(2)}`
    }
    d += ` L ${n - 1} ${H} Z`
    return d
  }, [histogram])

  const adj = doc.adjust
  const vig = doc.vignette

  return (
    <div>
      {histPath && histogram && (
        <div style={{ padding: 14 }}>
          <svg
            width="100%"
            height={64}
            viewBox={`0 0 ${histogram.luma.length} 64`}
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{
              display: 'block',
              background: 'var(--color-surface-subtle)',
              borderRadius: 8,
              color: 'var(--color-text-quaternary)',
            }}
          >
            <path d={histPath} fill="currentColor" opacity={0.55} />
          </svg>
        </div>
      )}

      <Section title="Correções rápidas" open={open.rapidas} onToggle={() => toggle('rapidas')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Chip onClick={() => onQuickFix('janelas')} disabled={quickFixDisabled} title="Cria uma máscara das áreas mais claras e recupera janelas estouradas">
            Recuperar janelas
          </Chip>
          <Chip onClick={() => onQuickFix('interior-exterior')} disabled={quickFixDisabled} title="Abre as sombras internas e segura os realces externos com duas máscaras de luminosidade">
            Equilibrar interior/exterior
          </Chip>
          <Chip onClick={() => onQuickFix('estouradas')} title="Reduz realces e brancos globalmente">
            Reduzir estouradas
          </Chip>
          <Chip onClick={() => onQuickFix('materiais')} title="Realça materiais e texturas (clareza + nitidez)">
            Realçar materiais
          </Chip>
          <Chip onClick={() => onQuickFix('luz-artificial')} title="Suaviza o brilho quente de luz artificial">
            Suavizar luz artificial
          </Chip>
          <Chip active={wbPicking} onClick={onToggleWbPick} title="Clique em um ponto neutro (cinza/branco) da imagem">
            Corrigir dominante
          </Chip>
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 8, lineHeight: 1.5 }}>
          Pontos de partida ajustáveis — tudo continua editável nas seções abaixo e em Máscaras.
        </p>
      </Section>

      <Section title="Predefinições" open={open.presets} onToggle={() => toggle('presets')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BUILTIN_PRESETS.map((p) => (
            <Chip key={p.id} onClick={() => applyPreset(p)} title={`Aplicar “${p.name}”`}>
              {p.name}
            </Chip>
          ))}
          {userPresets.map((p) => (
            <Chip key={p.id} onClick={() => applyPreset(p)} title={`Aplicar “${p.name}”`}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {p.name}
                <span
                  role="button"
                  title="Excluir predefinição"
                  onClick={(e) => {
                    e.stopPropagation()
                    removePreset(p)
                  }}
                  style={{
                    color: 'var(--color-text-quaternary)',
                    fontSize: 13,
                    lineHeight: 1,
                    cursor: 'pointer',
                  }}
                >
                  ×
                </span>
              </span>
            </Chip>
          ))}
          <Chip onClick={savePresetFromCurrent} title="Salvar os ajustes atuais como predefinição">
            Salvar atuais…
          </Chip>
        </div>
      </Section>

      <Section title="Luz" open={open.luz} onToggle={() => toggle('luz')}>
        <div style={column}>
          <SliderRow label="Exposição" value={adj.exposure} min={-100} max={100} onChange={setAdj('exposure', 'Exposição')} />
          <SliderRow label="Contraste" value={adj.contrast} min={-100} max={100} onChange={setAdj('contrast', 'Contraste')} />
          <SliderRow label="Realces" value={adj.highlights} min={-100} max={100} onChange={setAdj('highlights', 'Realces')} />
          <SliderRow label="Sombras" value={adj.shadows} min={-100} max={100} onChange={setAdj('shadows', 'Sombras')} />
          <SliderRow label="Brancos" value={adj.whites} min={-100} max={100} onChange={setAdj('whites', 'Brancos')} />
          <SliderRow label="Pretos" value={adj.blacks} min={-100} max={100} onChange={setAdj('blacks', 'Pretos')} />
        </div>
      </Section>

      <Section title="Cor" open={open.cor} onToggle={() => toggle('cor')}>
        <div style={column}>
          <div style={{ marginBottom: 2 }}>
            <Chip
              active={wbPicking}
              onClick={onToggleWbPick}
              title="Clique em um ponto neutro (cinza/branco) da imagem"
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m2 22 1-1h3l9-9" />
                  <path d="M3 21v-3l9-9" />
                  <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
                </svg>
                Corrigir dominante
              </span>
            </Chip>
          </div>
          <SliderRow label="Temperatura" value={adj.temperature} min={-100} max={100} onChange={setAdj('temperature', 'Temperatura')} />
          <SliderRow label="Matiz" value={adj.tint} min={-100} max={100} onChange={setAdj('tint', 'Matiz')} />
          <SliderRow label="Vibração" value={adj.vibrance} min={-100} max={100} onChange={setAdj('vibrance', 'Vibração')} />
          <SliderRow label="Saturação" value={adj.saturation} min={-100} max={100} onChange={setAdj('saturation', 'Saturação')} />
        </div>
      </Section>

      <Section title="Presença" open={open.presenca} onToggle={() => toggle('presenca')}>
        <div style={column}>
          <SliderRow
            label="Clareza"
            value={adj.clarity}
            min={-100}
            max={100}
            onChange={setAdj('clarity', 'Clareza')}
            title="Realça materiais e texturas"
          />
          <SliderRow label="Nitidez" value={adj.sharpen} min={0} max={100} onChange={setAdj('sharpen', 'Nitidez')} />
          <SliderRow label="Redução de ruído" value={adj.noiseReduction} min={0} max={100} onChange={setAdj('noiseReduction', 'Redução de ruído')} />
        </div>
      </Section>

      <Section title="Efeitos" open={open.efeitos} onToggle={() => toggle('efeitos')}>
        <div style={column}>
          <SliderRow label="Vinheta" value={vig.amount} min={-100} max={100} onChange={setVig('amount', 'Vinheta')} />
          {vig.amount !== 0 && (
            <>
              <SliderRow label="Tamanho" value={vig.size} min={0} max={100} defaultValue={50} onChange={setVig('size', 'Tamanho')} />
              <SliderRow label="Suavidade" value={vig.feather} min={0} max={100} defaultValue={60} onChange={setVig('feather', 'Suavidade')} />
            </>
          )}
        </div>
      </Section>
    </div>
  )
}
