'use client'

// ExportDialog — exportação do Finalizar v2 (formato, qualidade, resolução,
// proporção, nome do arquivo e versão no projeto). Tudo 100% no navegador;
// nenhuma exportação consome Nodes.

import { useEffect, useState } from 'react'
import type { ExportFormat } from '@/lib/finalizar/types'
import { ASPECT_PRESETS } from '@/lib/finalizar/types'
import type { ExportScale } from '@/lib/finalizar/export'
import { EXPORT_SCALES, slugify } from '@/lib/finalizar/export'
import { Label, SliderRow, Chip } from '@/components/finalizar/ui'

export interface ExportOptions {
  format: ExportFormat
  /** 0..1 */
  quality: number
  scale: ExportScale
  /** null = mantém o corte do documento. */
  aspectRatio: number | null
  /** Sem extensão. */
  fileName: string
  saveToProject: boolean
}

export interface ExportDialogProps {
  open: boolean
  onClose: () => void
  defaultName: string
  /** Dimensões APÓS o corte do documento (fonte do preview de resolução). */
  imageWidth: number
  imageHeight: number
  canSaveToProject: boolean
  onExport: (opts: ExportOptions) => Promise<void>
}

const FORMAT_OPTIONS: { id: ExportFormat; label: string; sub: string }[] = [
  { id: 'png', label: 'PNG', sub: 'sem perda' },
  { id: 'jpg', label: 'JPG', sub: 'menor arquivo' },
  { id: 'webp', label: 'WebP', sub: 'web moderno' },
]

const ASPECT_OPTIONS = ASPECT_PRESETS.filter((p) => p.id !== 'free' && p.id !== 'original')

/** Dimensões finais do arquivo: corte central por proporção + redimensão. */
function finalDims(
  imageWidth: number,
  imageHeight: number,
  aspectRatio: number | null,
  scale: ExportScale,
): { w: number; h: number; upscaled: boolean } {
  let w = Math.max(1, Math.round(imageWidth))
  let h = Math.max(1, Math.round(imageHeight))
  if (aspectRatio && aspectRatio > 0) {
    const cur = w / h
    if (cur > aspectRatio) w = Math.round(h * aspectRatio)
    else h = Math.round(w / aspectRatio)
  }
  let upscaled = false
  const scaleDef = EXPORT_SCALES.find((s) => s.id === scale)
  if (scaleDef?.longSide) {
    const k = scaleDef.longSide / Math.max(w, h)
    upscaled = k > 1
    w = Math.round(w * k)
    h = Math.round(h * k)
  }
  return { w, h, upscaled }
}

export function ExportDialog({
  open,
  onClose,
  defaultName,
  imageWidth,
  imageHeight,
  canSaveToProject,
  onExport,
}: ExportDialogProps): React.ReactElement | null {
  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState(92)
  const [scale, setScale] = useState<ExportScale>('original')
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)
  const [fileName, setFileName] = useState('')
  const [saveChecked, setSaveChecked] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill do nome sempre que o diálogo abre.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset deliberado a cada abertura do diálogo
      setFileName(slugify(defaultName))
      setError(null)
    }
  }, [open, defaultName])

  // ESC fecha (enquanto não estiver exportando).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const dims = finalDims(imageWidth, imageHeight, aspectRatio, scale)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      await onExport({
        format,
        quality: quality / 100,
        scale,
        aspectRatio,
        fileName: fileName.trim() || slugify(defaultName) || 'composicao',
        saveToProject: canSaveToProject && saveChecked,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível exportar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={() => { if (!busy) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 95, background: 'var(--color-scrim)',
        display: 'grid', placeItems: 'center', padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)', background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border-strong)', borderRadius: 16, overflow: 'hidden',
        }}
      >
        <div style={{ padding: '15px 18px', borderBottom: '0.5px solid var(--color-border)', fontSize: 15, fontWeight: 600 }}>
          Exportar imagem
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Formato */}
          <div>
            <Label>Formato</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              {FORMAT_OPTIONS.map((o) => {
                const active = format === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setFormat(o.id)}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                      border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                      background: active ? 'var(--color-surface-hover)' : 'transparent',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background var(--duration-fast), border-color var(--duration-fast)',
                    }}
                  >
                    {o.label}
                    <span style={{ display: 'block', fontSize: 10.5, fontWeight: 400, color: 'var(--color-text-quaternary)', marginTop: 2 }}>
                      {o.sub}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Qualidade (só formatos com compressão) */}
          {(format === 'jpg' || format === 'webp') && (
            <SliderRow
              label="Qualidade"
              value={quality}
              min={50}
              max={100}
              onChange={setQuality}
              defaultValue={92}
              format={(v) => `${v}%`}
            />
          )}

          {/* Resolução */}
          <div>
            <Label>Resolução</Label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EXPORT_SCALES.map((s) => (
                <Chip key={s.id} active={scale === s.id} onClick={() => setScale(s.id)}>
                  {s.label}
                </Chip>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
              {dims.w} × {dims.h} px{dims.upscaled ? ' · ampliada' : ''}
            </div>
          </div>

          {/* Proporção */}
          <div>
            <Label>Proporção</Label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Chip active={aspectRatio === null} onClick={() => setAspectRatio(null)} title="Mantém o corte do documento">
                Corte atual
              </Chip>
              {ASPECT_OPTIONS.map((p) => (
                <Chip
                  key={p.id}
                  active={aspectRatio === p.ratio}
                  onClick={() => setAspectRatio(p.ratio)}
                  title={p.hint}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Nome do arquivo */}
          <div>
            <Label>Nome do arquivo</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                disabled={busy}
                style={{
                  flex: 1, minWidth: 0, padding: '8px 10px',
                  background: 'var(--color-input)', border: '1px solid var(--color-input-border)',
                  borderRadius: 8, fontSize: 12.5, color: 'var(--color-text-primary)',
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--color-text-quaternary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                .{format}
              </span>
            </div>
          </div>

          {/* Salvar como versão no projeto */}
          {canSaveToProject && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={saveChecked}
                onChange={(e) => setSaveChecked(e.target.checked)}
                disabled={busy}
                style={{ accentColor: 'var(--color-accent-green)', marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--color-text-primary)' }}>
                  Salvar como versão no projeto
                </span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 2 }}>
                  A versão aparece no histórico do projeto com data e ajustes.
                </span>
              </span>
            </label>
          )}

          {error && (
            <div style={{ fontSize: 12.5, color: 'var(--color-error)' }}>{error}</div>
          )}

          {/* Rodapé */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" className="spn-action spn-action--ghost" onClick={onClose} disabled={busy} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="button" className="spn-action spn-action--primary" onClick={run} disabled={busy} style={{ flex: 1 }}>
              {busy ? 'Exportando…' : 'Exportar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
