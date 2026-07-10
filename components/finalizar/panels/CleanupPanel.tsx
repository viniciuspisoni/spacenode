'use client'

// CleanupPanel — remoção de objetos / correção por IA usando a infraestrutura
// de edição existente (/api/edits, modo remove/fix com máscara).
//
// ÚNICA parte do Finalizar que consome Nodes. O custo vem do servidor
// (POST /api/edits/preview, autoritativo) e é exibido ANTES de executar.
// A área afetada fica visível em vermelho no canvas antes da confirmação.

import type { MaskStroke } from '@/lib/finalizar/types'
import type { BrushSettings } from '../CanvasViewport'
import { Chip, Section, Seg, SliderRow } from '../ui'
import { useState } from 'react'

export interface CleanupPreview {
  cost: number
  isFree: boolean
  label: string
  explanation: string
}

export interface CleanupPanelProps {
  strokes: MaskStroke[]
  onClearStrokes: () => void
  brush: BrushSettings
  onBrush: (b: BrushSettings) => void
  mode: 'remove' | 'fix'
  onMode: (m: 'remove' | 'fix') => void
  prompt: string
  onPrompt: (p: string) => void
  preview: CleanupPreview | null
  previewLoading: boolean
  balance: number | null
  busy: boolean
  onExecute: () => void
  message: string | null
  messageKind: 'error' | 'info' | null
}

export function CleanupPanel(props: CleanupPanelProps) {
  const {
    strokes, onClearStrokes, brush, onBrush, mode, onMode, prompt, onPrompt,
    preview, previewLoading, balance, busy, onExecute, message, messageKind,
  } = props
  const [openArea, setOpenArea] = useState(true)
  const [openAction, setOpenAction] = useState(true)

  const hasMask = strokes.length > 0
  const needsPrompt = mode === 'fix'
  const insufficient = preview !== null && balance !== null && preview.cost > balance
  const canExecute = hasMask && !busy && !previewLoading
    && (!needsPrompt || prompt.trim().length > 0) && !insufficient && preview !== null

  return (
    <div>
      <Section title="Área afetada" open={openArea} onToggle={() => setOpenArea((v) => !v)}>
        <p style={{ fontSize: 11.5, color: 'var(--color-text-quaternary)', lineHeight: 1.55, marginBottom: 10 }}>
          Pinte sobre o que deseja remover ou corrigir. A área marcada aparece
          em vermelho no canvas — só ela será alterada.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Seg
            options={[
              { id: 'paint', label: 'Pintar', title: 'Marca a área a alterar' },
              { id: 'erase', label: 'Borracha', title: 'Desmarca' },
            ]}
            value={brush.erase ? 'erase' : 'paint'}
            onChange={(v) => onBrush({ ...brush, erase: v === 'erase' })}
          />
          <SliderRow label="Tamanho" value={brush.size} min={8} max={240} defaultValue={64}
            format={(v) => `${v}`} onChange={(v) => onBrush({ ...brush, size: v })} />
          <SliderRow label="Suavidade" value={Math.round((1 - brush.hardness) * 100)} min={0} max={100} defaultValue={50}
            format={(v) => `${v}%`}
            title="Borda mais suave ajuda a mesclar o resultado"
            onChange={(v) => onBrush({ ...brush, hardness: 1 - v / 100 })} />
          <div style={{ display: 'flex', gap: 6 }}>
            <Chip onClick={onClearStrokes} disabled={!hasMask} title="Limpa a área marcada">Limpar área</Chip>
          </div>
        </div>
      </Section>

      <Section title="Ação" open={openAction} onToggle={() => setOpenAction((v) => !v)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Seg
            options={[
              { id: 'remove', label: 'Remover', title: 'Remove o que está marcado e reconstrói o fundo' },
              { id: 'fix', label: 'Corrigir', title: 'Corrige a área marcada seguindo sua instrução' },
            ]}
            value={mode}
            onChange={onMode}
          />
          {mode === 'fix' && (
            <textarea
              value={prompt}
              onChange={(e) => onPrompt(e.target.value)}
              placeholder="O que corrigir nesta área? Ex.: “consertar o reflexo distorcido no vidro”"
              rows={3}
              style={{
                width: '100%', background: 'var(--color-input)',
                border: '1px solid var(--color-input-border)', borderRadius: 8,
                padding: '9px 11px', fontSize: 12, color: 'var(--color-text-primary)',
                resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
          )}

          {/* Custo — sempre informado antes da execução */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4, padding: '9px 11px',
            borderRadius: 9, border: '0.5px solid var(--color-border)', background: 'var(--color-surface-subtle)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>Custo</span>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {!hasMask
                  ? '—'
                  : previewLoading
                    ? 'Calculando…'
                    : preview
                      ? preview.isFree ? 'Grátis' : `${preview.cost} node${preview.cost === 1 ? '' : 's'}`
                      : '—'}
              </span>
            </div>
            {balance !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                <span style={{ color: 'var(--color-text-quaternary)' }}>Saldo</span>
                <span style={{ color: insufficient ? 'var(--color-error)' : 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                  {balance} nodes
                </span>
              </div>
            )}
            {preview?.explanation && hasMask && (
              <div style={{ fontSize: 10.5, color: 'var(--color-text-quaternary)', lineHeight: 1.45 }}>
                {preview.explanation}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onExecute}
            disabled={!canExecute}
            style={{
              width: '100%', padding: '11px 16px', borderRadius: 9, border: 'none',
              background: canExecute ? 'var(--color-inverse)' : 'var(--color-surface)',
              color: canExecute ? 'var(--color-inverse-foreground)' : 'var(--color-text-tertiary)',
              fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.01em',
              cursor: canExecute ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {busy
              ? 'Processando…'
              : !hasMask
                ? 'Pinte a área primeiro'
                : insufficient
                  ? 'Saldo insuficiente'
                  : preview?.label ?? (mode === 'remove' ? 'Remover' : 'Corrigir')}
          </button>

          {message && (
            <p style={{
              fontSize: 11.5, lineHeight: 1.5, margin: 0,
              color: messageKind === 'error' ? 'var(--color-error)' : 'var(--color-text-tertiary)',
            }}>
              {message}
            </p>
          )}
          <p style={{ fontSize: 10.5, color: 'var(--color-text-quaternary)', lineHeight: 1.5, margin: 0 }}>
            O restante da imagem é preservado pixel a pixel. Se o resultado for
            rejeitado pelo controle de qualidade, os Nodes são devolvidos.
          </p>
        </div>
      </Section>
    </div>
  )
}
