'use client'

// Prompt Assistant do modo Editar.
//
// Substitui o textarea simples do step `editing`. Combina:
//   - Textarea principal (placeholder dinâmico por modo)
//   - Chips de instruções rápidas (manter geometria, manter iluminação, etc)
//   - Presets arquitetônicos categorizados (concreto, madeira, pisos, etc)
//
// Cada chip / preset clicado ANEXA seu snippet ao texto do usuário via
// appendToPrompt. O usuário pode editar livremente; o componente não mantém
// state separado de "chips ativos" — o que vai pro backend é exatamente o
// que está no textarea, sem mágica escondida.

import { useState } from 'react'
import { EDIT_MODE_LABELS, type EditMode } from '@/lib/spaces/engines'
import {
  QUICK_CHIPS,
  PRESETS_BY_MODE,
  appendToPrompt,
  type Preset,
} from '@/lib/spaces/edit-presets'

interface Props {
  mode:     EditMode
  value:    string
  onChange: (v: string) => void
  disabled?: boolean
}

export function PromptAssistant({ mode, value, onChange, disabled = false }: Props) {
  const [presetsOpen, setPresetsOpen] = useState(false)
  const meta       = EDIT_MODE_LABELS[mode]
  const isRemove   = mode === 'remove'
  const categories = PRESETS_BY_MODE[mode]

  function applySnippet(text: string) {
    if (disabled || isRemove) return
    onChange(appendToPrompt(value, text))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Textarea */}
      <div>
        <label style={{
          display: 'block', marginBottom: 6,
          fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)',
          letterSpacing: '-0.005em',
        }}>
          {isRemove
            ? 'Remover não precisa de descrição — o motor preenche com o entorno.'
            : 'O que deseja alterar?'
          }
        </label>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={isRemove
            ? 'Pinte a área e clique em gerar.'
            : meta.promptPlaceholder
          }
          rows={2}
          disabled={isRemove || disabled}
          style={{
            width: '100%', padding: '10px 14px',
            background: 'var(--color-bg)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 8, color: 'var(--color-text-primary)',
            fontSize: 13, letterSpacing: '-0.005em',
            fontFamily: 'inherit', resize: 'vertical', outline: 'none',
            opacity: isRemove ? 0.55 : 1,
            cursor: isRemove ? 'not-allowed' : 'text',
            minHeight: 60,
          }}
        />
      </div>

      {!isRemove && (
        <>
          {/* Chips rápidos */}
          <div>
            <PromptSectionLabel>Atalhos rápidos</PromptSectionLabel>
            <div className="spn-prompt-chips" style={{
              display: 'flex', gap: 6, marginTop: 8,
              flexWrap: 'wrap',
            }}>
              {QUICK_CHIPS.map(c => (
                <Chip key={c.id} onClick={() => applySnippet(c.text)} disabled={disabled}>
                  + {c.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Presets arquitetônicos */}
          {categories && categories.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setPresetsOpen(o => !o)}
                disabled={disabled}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-tertiary)',
                  background: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
                  padding: 0, marginBottom: presetsOpen ? 8 : 0,
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                <span>Presets arquitetônicos</span>
                <svg width="9" height="9" viewBox="0 0 12 12" style={{
                  transform: presetsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.18s',
                }} fill="currentColor">
                  <path d="M2 4l4 4 4-4z" />
                </svg>
              </button>
              {presetsOpen && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 10,
                  padding: 12, marginTop: 4,
                  background: 'var(--color-bg)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: 10,
                }}>
                  {categories.map(cat => (
                    <PresetCategoryRow
                      key={cat.id}
                      label={cat.label}
                      presets={cat.presets}
                      onPick={(p) => applySnippet(p.text)}
                      disabled={disabled}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Chip ────────────────────────────────────────────────────

function Chip({ children, onClick, disabled }: {
  children: React.ReactNode
  onClick:  () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="spn-pill"
      style={{
        padding: '5px 10px',
        background: 'var(--color-bg)',
        border: '0.5px solid var(--color-border-strong)',
        borderRadius: 14,
        color: 'var(--color-text-secondary)',
        fontSize: 11, letterSpacing: '-0.005em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

// ── Preset category row ─────────────────────────────────────

function PresetCategoryRow({ label, presets, onPick, disabled }: {
  label:    string
  presets:  Preset[]
  onPick:   (p: Preset) => void
  disabled: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--color-text-quaternary)',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {presets.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            disabled={disabled}
            className="spn-pill"
            style={{
              padding: '5px 9px',
              background: 'var(--color-bg-elevated)',
              border: '0.5px solid var(--color-border-strong)',
              borderRadius: 6,
              color: 'var(--color-text-secondary)',
              fontSize: 11, letterSpacing: '-0.005em',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
            title={p.text}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function PromptSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--color-text-tertiary)',
    }}>
      {children}
    </div>
  )
}
