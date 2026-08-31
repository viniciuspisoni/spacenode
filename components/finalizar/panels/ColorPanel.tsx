'use client'

// components/finalizar/panels/ColorPanel.tsx — painel avançado de cor do
// Finalizar: curva de luminosidade, ajuste por faixa de cor (HSL), color
// grading por zonas tonais e correspondência de cor por referência.
// Nenhuma operação aqui consome Nodes — tudo roda localmente.

import { useRef, useState } from 'react'
import type {
  ColorGrading,
  CurvePoint,
  FinalizeDoc,
  GradeWheel,
  HslAdjust,
  HslBand,
  HslMap,
} from '@/lib/finalizar/types'
import { HSL_BANDS, HSL_BAND_META } from '@/lib/finalizar/types'
import { CurveEditor } from '@/components/finalizar/CurveEditor'
import { Chip, Section, SliderRow, sectionLabel } from '@/components/finalizar/ui'

export interface ColorPanelProps {
  doc: FinalizeDoc
  patch: (label: string, updater: (d: FinalizeDoc) => FinalizeDoc, coalesceKey?: string) => void
  histogram: { luma: Uint32Array; max: number } | null
  onMatchReference: (file: File) => Promise<void>
  matchBusy: boolean
  /** Copiar/colar o tratamento completo entre projetos (consistência entre vistas). */
  onCopyTreatment: () => void
  onPasteTreatment: () => void
  pasteAvailable: boolean
}

type SectionKey = 'treatment' | 'curve' | 'hsl' | 'grading' | 'match'
type GradeZone = 'shadows' | 'midtones' | 'highlights'

const GRADE_ZONES: { id: GradeZone; label: string; hueDefault: number }[] = [
  { id: 'shadows', label: 'Sombras', hueDefault: 220 },
  { id: 'midtones', label: 'Meios-tons', hueDefault: 0 },
  { id: 'highlights', label: 'Realces', hueDefault: 45 },
]

function withHslBand(map: HslMap, band: HslBand, partial: Partial<HslAdjust>): HslMap {
  const next = { ...map }
  next[band] = { ...next[band], ...partial }
  return next
}

function withGradeWheel(grading: ColorGrading, zone: GradeZone, partial: Partial<GradeWheel>): ColorGrading {
  const next = { ...grading }
  next[zone] = { ...next[zone], ...partial }
  return next
}

export function ColorPanel(props: ColorPanelProps): React.ReactElement {
  const {
    doc, patch, histogram, onMatchReference, matchBusy,
    onCopyTreatment, onPasteTreatment, pasteAvailable,
  } = props

  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    treatment: true,
    curve: true,
    hsl: false,
    grading: false,
    match: false,
  })
  const [band, setBand] = useState<HslBand>('blue')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const toggle = (key: SectionKey) => setOpen((o) => ({ ...o, [key]: !o[key] }))

  const bandMeta = HSL_BAND_META[band]
  const bandAdjust = doc.hsl[band]

  const openFilePicker = () => fileRef.current?.click()

  return (
    <div>
      {/* ── 0. Tratamento (intensidade global + consistência entre vistas) ── */}
      <Section title="Tratamento" open={open.treatment} onToggle={() => toggle('treatment')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SliderRow
            label="Intensidade" value={doc.treatmentAmount} min={0} max={100} defaultValue={100}
            format={(v) => `${v}%`}
            title="Esvanece todo o tratamento tonal em direção à imagem original"
            onChange={(v) => patch('Intensidade do tratamento', (d) => ({ ...d, treatmentAmount: v }), 'treatment.amount')}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip onClick={onCopyTreatment} title="Copia luz, cor, curva, HSL, grading e vinheta para usar em outra imagem">
              Copiar tratamento
            </Chip>
            <Chip onClick={onPasteTreatment} disabled={!pasteAvailable} title={pasteAvailable ? 'Aplica o tratamento copiado nesta imagem' : 'Copie um tratamento em outra imagem primeiro'}>
              Colar tratamento
            </Chip>
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-quaternary)', lineHeight: 1.5, margin: 0 }}>
            Use copiar/colar para manter a mesma atmosfera entre as imagens do projeto.
          </p>
        </div>
      </Section>

      {/* ── 1. Curva de luminosidade ─────────────────────────────────────── */}
      <Section title="Curva de luminosidade" open={open.curve} onToggle={() => toggle('curve')}>
        <CurveEditor
          points={doc.curve}
          histogram={histogram}
          onChange={(pts: CurvePoint[]) =>
            patch('Curva', (d) => ({ ...d, curve: pts }), 'curve')
          }
        />
      </Section>

      {/* ── 2. Cores (HSL) ───────────────────────────────────────────────── */}
      <Section title="Cores (HSL)" open={open.hsl} onToggle={() => toggle('hsl')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {HSL_BANDS.map((b) => {
            const meta = HSL_BAND_META[b]
            const active = b === band
            return (
              <button
                key={b}
                type="button"
                title={meta.label}
                onClick={() => setBand(b)}
                style={{
                  width: 18,
                  height: 18,
                  padding: 0,
                  borderRadius: 999,
                  flexShrink: 0,
                  // Única exceção de cor literal permitida: as faixas
                  // representam os matizes reais que serão ajustados.
                  background: meta.css,
                  border: '0.5px solid var(--color-border)',
                  boxShadow: active ? '0 0 0 2px var(--color-border-focus)' : 'none',
                  cursor: 'pointer',
                  transition: 'box-shadow var(--duration-fast)',
                }}
              />
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginBottom: 8 }}>
          {bandMeta.label}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SliderRow
            label="Matiz"
            value={bandAdjust.hue}
            min={-100}
            max={100}
            onChange={(v) =>
              patch(
                `HSL ${bandMeta.label} — Matiz`,
                (d) => ({ ...d, hsl: withHslBand(d.hsl, band, { hue: v }) }),
                `hsl.${band}.hue`,
              )
            }
          />
          <SliderRow
            label="Saturação"
            value={bandAdjust.sat}
            min={-100}
            max={100}
            onChange={(v) =>
              patch(
                `HSL ${bandMeta.label} — Saturação`,
                (d) => ({ ...d, hsl: withHslBand(d.hsl, band, { sat: v }) }),
                `hsl.${band}.sat`,
              )
            }
          />
          <SliderRow
            label="Luminosidade"
            value={bandAdjust.lum}
            min={-100}
            max={100}
            onChange={(v) =>
              patch(
                `HSL ${bandMeta.label} — Luminosidade`,
                (d) => ({ ...d, hsl: withHslBand(d.hsl, band, { lum: v }) }),
                `hsl.${band}.lum`,
              )
            }
          />
        </div>
      </Section>

      {/* ── 3. Color grading ─────────────────────────────────────────────── */}
      <Section title="Color grading" open={open.grading} onToggle={() => toggle('grading')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {GRADE_ZONES.map((zone) => {
            const wheel = doc.grading[zone.id]
            return (
              <div key={zone.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <span style={sectionLabel}>{zone.label}</span>
                  <span
                    aria-hidden
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 999,
                      flexShrink: 0,
                      // Mostra o matiz escolhido na roda — cor literal permitida.
                      background: `hsl(${wheel.hue}, 70%, 55%)`,
                      opacity: wheel.sat === 0 ? 0.3 : 1,
                      transition: 'opacity var(--duration-fast)',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SliderRow
                    label="Tom"
                    value={wheel.hue}
                    min={0}
                    max={360}
                    defaultValue={zone.hueDefault}
                    format={(v) => `${v}°`}
                    onChange={(v) =>
                      patch(
                        `${zone.label} — Tom`,
                        (d) => ({ ...d, grading: withGradeWheel(d.grading, zone.id, { hue: v }) }),
                        `grade.${zone.id}.hue`,
                      )
                    }
                  />
                  <SliderRow
                    label="Intensidade"
                    value={wheel.sat}
                    min={0}
                    max={100}
                    onChange={(v) =>
                      patch(
                        `${zone.label} — Intensidade`,
                        (d) => ({ ...d, grading: withGradeWheel(d.grading, zone.id, { sat: v }) }),
                        `grade.${zone.id}.sat`,
                      )
                    }
                  />
                  <SliderRow
                    label="Luz"
                    value={wheel.lum}
                    min={-100}
                    max={100}
                    onChange={(v) =>
                      patch(
                        `${zone.label} — Luz`,
                        (d) => ({ ...d, grading: withGradeWheel(d.grading, zone.id, { lum: v }) }),
                        `grade.${zone.id}.lum`,
                      )
                    }
                  />
                </div>
              </div>
            )
          })}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SliderRow
              label="Mistura"
              value={doc.grading.blending}
              min={0}
              max={100}
              defaultValue={50}
              onChange={(v) =>
                patch(
                  'Grading — Mistura',
                  (d) => ({ ...d, grading: { ...d.grading, blending: v } }),
                  'grade.blending',
                )
              }
            />
            <SliderRow
              label="Equilíbrio"
              value={doc.grading.balance}
              min={-100}
              max={100}
              onChange={(v) =>
                patch(
                  'Grading — Equilíbrio',
                  (d) => ({ ...d, grading: { ...d.grading, balance: v } }),
                  'grade.balance',
                )
              }
            />
          </div>
        </div>
      </Section>

      {/* ── 4. Correspondência de cor ────────────────────────────────────── */}
      <Section title="Correspondência de cor" open={open.match} onToggle={() => toggle('match')}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]
            if (file) void onMatchReference(file)
            e.currentTarget.value = ''
          }}
        />
        {doc.colorMatch === null ? (
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5, marginBottom: 10 }}>
              Aplique o clima de cor de outra imagem — escolha uma referência.
            </div>
            <Chip disabled={matchBusy} onClick={openFilePicker}>
              {matchBusy ? 'Analisando…' : 'Escolher referência…'}
            </Chip>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {doc.colorMatch.refThumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={doc.colorMatch.refThumbUrl}
                  alt="Referência de cor"
                  width={48}
                  height={36}
                  style={{
                    width: 48,
                    height: 36,
                    objectFit: 'cover',
                    borderRadius: 'var(--radius-xs)',
                    border: '0.5px solid var(--color-border)',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 36,
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', lineHeight: 1.4 }}>
                Referência aplicada
              </div>
            </div>
            <SliderRow
              label="Intensidade"
              value={doc.colorMatch.amount}
              min={0}
              max={100}
              defaultValue={60}
              onChange={(v) =>
                patch(
                  'Correspondência — intensidade',
                  (d) => (d.colorMatch ? { ...d, colorMatch: { ...d.colorMatch, amount: v } } : d),
                  'match.amount',
                )
              }
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <Chip disabled={matchBusy} onClick={openFilePicker}>
                {matchBusy ? 'Analisando…' : 'Trocar…'}
              </Chip>
              <Chip
                disabled={matchBusy}
                onClick={() => patch('Remover correspondência', (d) => ({ ...d, colorMatch: null }))}
              >
                Remover
              </Chip>
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}
