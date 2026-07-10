'use client'

// components/finalizar/panels/HistoryPanel.tsx — histórico da sessão (undo/redo
// navegável) + versões salvas no projeto. Nenhuma operação aqui consome Nodes.

import { useEffect, useRef, useState } from 'react'
import type { ProjectVersion } from '@/lib/finalizar/types'
import { Section } from '@/components/finalizar/ui'

export interface HistoryPanelProps {
  steps: { label: string; at: number; current: boolean }[]
  onJump: (index: number) => void
  versions: ProjectVersion[]
}

function ExternalLinkIcon() {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--color-text-quaternary)', flexShrink: 0 }}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

export function HistoryPanel(props: HistoryPanelProps): React.ReactElement {
  const { steps, onJump, versions } = props
  const [historyOpen, setHistoryOpen] = useState(true)
  const [versionsOpen, setVersionsOpen] = useState(true)
  const currentStepRef = useRef<HTMLButtonElement | null>(null)

  const currentIndex = steps.findIndex((s) => s.current)

  useEffect(() => {
    currentStepRef.current?.scrollIntoView({ block: 'nearest' })
  }, [steps])

  return (
    <div>
      <Section title="Histórico da sessão" open={historyOpen} onToggle={() => setHistoryOpen((v) => !v)}>
        {steps.length <= 1 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
            As alterações da sessão aparecem aqui.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', lineHeight: 1.5, marginBottom: 8 }}>
              Clique em um passo para voltar a ele.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 280, overflowY: 'auto' }}>
              {steps.map((step, i) => {
                const isCurrent = i === currentIndex
                const isRedoable = i > currentIndex
                return (
                  <button
                    key={`${step.at}-${i}`}
                    type="button"
                    ref={isCurrent ? currentStepRef : undefined}
                    onClick={() => onJump(i)}
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 8,
                      fontSize: 12.5, textAlign: 'left', fontFamily: 'inherit',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      border: 'none', cursor: 'pointer',
                      background: isCurrent ? 'var(--color-surface)' : 'transparent',
                      boxShadow: isCurrent ? 'inset 3px 0 0 0 var(--color-accent-green)' : 'none',
                      fontWeight: isCurrent ? 500 : 400,
                      color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      opacity: isRedoable ? 0.45 : 1,
                      transition: 'background var(--duration-fast), opacity var(--duration-fast)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {step.label}
                    </span>
                    <span style={{
                      fontSize: 11, color: 'var(--color-text-quaternary)',
                      fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8,
                    }}>
                      {new Date(step.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </Section>

      <Section title="Versões salvas" open={versionsOpen} onToggle={() => setVersionsOpen((v) => !v)}>
        {versions.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
            Exporte com &lsquo;Salvar como versão no projeto&rsquo; para registrar versões aqui.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[...versions].reverse().map((v, i) => {
              const created = new Date(v.createdAt)
              return (
                <button
                  key={`${v.url}-${i}`}
                  type="button"
                  title={v.summary}
                  onClick={() => window.open(v.url, '_blank', 'noopener')}
                  style={{
                    display: 'flex', gap: 8, alignItems: 'center',
                    padding: '7px 8px', borderRadius: 8, textAlign: 'left', width: '100%',
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background var(--duration-fast)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v.url}
                    alt={v.name}
                    width={40}
                    height={30}
                    style={{
                      width: 40, height: 30, objectFit: 'cover', borderRadius: 6,
                      border: '0.5px solid var(--color-border)', flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, color: 'var(--color-text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {v.name}
                    </div>
                    <div style={{
                      fontSize: 11, color: 'var(--color-text-quaternary)',
                      fontVariantNumeric: 'tabular-nums',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {created.toLocaleDateString('pt-BR')}
                      {' · '}
                      {created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      {v.width}×{v.height}
                    </div>
                  </div>
                  <ExternalLinkIcon />
                </button>
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}
