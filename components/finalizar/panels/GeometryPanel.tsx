'use client'

// components/finalizar/panels/GeometryPanel.tsx — painel de geometria do
// Finalizar: corte (proporções predefinidas), perspectiva/nivelamento e lente.
// Tudo não destrutivo: só grava valores em doc.geometry via patch().

import { useState } from 'react'
import type { FinalizeDoc, CropRect } from '@/lib/finalizar/types'
import { ASPECT_PRESETS } from '@/lib/finalizar/types'
import { defaultGeometry } from '@/lib/finalizar/composition'
import { Chip, Section, SliderRow } from '@/components/finalizar/ui'

export interface GeometryPanelProps {
  doc: FinalizeDoc
  patch: (label: string, updater: (d: FinalizeDoc) => FinalizeDoc, coalesceKey?: string) => void
}

const helperText: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.5,
  color: 'var(--color-text-quaternary)',
}

type AspectPreset = (typeof ASPECT_PRESETS)[number]

export function GeometryPanel({ doc, patch }: GeometryPanelProps): React.ReactElement {
  const [corteOpen, setCorteOpen] = useState(true)
  const [perspOpen, setPerspOpen] = useState(true)

  const g = doc.geometry
  const geometryIsDefault =
    g.rotate === 0 && g.perspV === 0 && g.perspH === 0 && g.lens === 0 && g.crop === null

  function applyAspect(p: AspectPreset) {
    patch('Proporção do corte', (d) => {
      // 'Livre' (ratio null): mantém o corte atual, só destrava a proporção.
      if (p.ratio === null) {
        return { ...d, geometry: { ...d.geometry, aspect: null } }
      }
      const imgRatio = d.width / d.height
      const ratio = p.ratio === 0 ? imgRatio : p.ratio
      let w: number
      let h: number
      if (ratio >= imgRatio) {
        w = 1
        h = imgRatio / ratio
      } else {
        h = 1
        w = ratio / imgRatio
      }
      const crop: CropRect = { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
      return { ...d, geometry: { ...d.geometry, aspect: p.id, crop } }
    })
  }

  function setGeometryValue(label: string, key: 'rotate' | 'perspV' | 'perspH' | 'lens', value: number) {
    patch(label, (d) => ({ ...d, geometry: { ...d.geometry, [key]: value } }), `geo.${key}`)
  }

  return (
    <div>
      <Section title="Corte" open={corteOpen} onToggle={() => setCorteOpen((v) => !v)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ASPECT_PRESETS.map((p) => (
            <Chip
              key={p.id}
              active={doc.geometry.aspect === p.id}
              title={p.hint}
              onClick={() => applyAspect(p)}
            >
              {p.label}
            </Chip>
          ))}
        </div>
        <div style={{ ...helperText, marginTop: 10 }}>
          Arraste as bordas no canvas para refinar o corte.
        </div>
        <div style={{ marginTop: 10 }}>
          <Chip
            disabled={doc.geometry.crop === null}
            onClick={() =>
              patch('Remover corte', (d) => ({
                ...d,
                geometry: { ...d.geometry, crop: null, aspect: null },
              }))
            }
          >
            Remover corte
          </Chip>
        </div>
      </Section>

      <Section title="Perspectiva" open={perspOpen} onToggle={() => setPerspOpen((v) => !v)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SliderRow
            label="Vertical"
            value={g.perspV}
            min={-100}
            max={100}
            title="Endireita linhas verticais (prumo)"
            onChange={(v) => setGeometryValue('Perspectiva vertical', 'perspV', v)}
          />
          <SliderRow
            label="Horizontal"
            value={g.perspH}
            min={-100}
            max={100}
            title="Endireita linhas horizontais"
            onChange={(v) => setGeometryValue('Perspectiva horizontal', 'perspH', v)}
          />
          <SliderRow
            label="Nivelar"
            value={g.rotate}
            min={-45}
            max={45}
            step={0.5}
            format={(v) => v.toFixed(1) + '°'}
            title="Rotação fina para nivelar o horizonte"
            onChange={(v) => setGeometryValue('Nivelamento', 'rotate', v)}
          />
          <SliderRow
            label="Lente"
            value={g.lens}
            min={-100}
            max={100}
            title="Corrige distorção de barril/almofada"
            onChange={(v) => setGeometryValue('Correção de lente', 'lens', v)}
          />
        </div>
        <div style={{ ...helperText, marginTop: 10 }}>
          A imagem é reenquadrada automaticamente para cobrir o quadro.
        </div>
      </Section>

      <div style={{ padding: 14 }}>
        <Chip
          disabled={geometryIsDefault}
          title="Volta corte, perspectiva e lente ao estado original"
          onClick={() =>
            patch('Redefinir geometria', (d) => ({ ...d, geometry: defaultGeometry() }))
          }
        >
          Redefinir geometria
        </Chip>
      </div>
    </div>
  )
}
