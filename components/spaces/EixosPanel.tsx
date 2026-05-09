'use client'

// Painel de Eixos — abas (4) + cards do eixo ativo + quality + action bar.
//
// Sprint 2 entrega Iluminação completo (6 cards). Os outros 3 eixos
// existem como aba mas com tooltip "em breve".

import { useMemo, useState } from 'react'
import {
  AXIS_OPTIONS, AXIS_LABEL, isAxisAvailable, type AxisOption,
} from '@/lib/spaces/axes'
import { ENGINES, type EngineId, type Resolution } from '@/lib/engines'
import { getVistaGenerationCost, getAvailableQualities } from '@/lib/spaces/economy'
import type { Axis, Quality } from '@/lib/spaces/types'
import type { PlanId } from '@/lib/plans'
import { InsufficientBalancePanel } from './InsufficientBalancePanel'

interface Props {
  engine:    EngineId
  defaultQuality?: Quality
  balance:   number
  planId:    PlanId
  disabled?: boolean
  onGenerate: (axis: Axis, axisValues: string[], quality: Quality) => Promise<void>
}

const AXIS_ORDER: Axis[] = ['iluminacao', 'angulo', 'horario', 'detalhe']

export function EixosPanel({ engine, defaultQuality, balance, planId, disabled, onGenerate }: Props) {
  const [axis, setAxis]         = useState<Axis>('iluminacao')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const availableQualities      = getAvailableQualities(engine)
  const initialQuality          = defaultQuality && availableQualities.includes(defaultQuality)
                                  ? defaultQuality
                                  : availableQualities[0]
  const [quality, setQuality]   = useState<Resolution>(initialQuality)
  const [submitting, setSubmitting] = useState(false)

  const options: AxisOption[]   = AXIS_OPTIONS[axis]
  const costPer  = useMemo(() => getVistaGenerationCost(engine, quality), [engine, quality])
  const total    = costPer * selected.size
  const insufficient = total > balance

  function toggle(value: string) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(value)) next.delete(value); else next.add(value)
      return next
    })
  }

  async function handleGenerate() {
    if (selected.size === 0 || submitting || disabled) return
    setSubmitting(true)
    try {
      await onGenerate(axis, Array.from(selected), quality)
      setSelected(new Set())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section style={{
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 14, padding: 24,
    }}>
      {/* Tabs dos 4 eixos */}
      <div style={{
        display: 'flex', gap: 4, padding: 4,
        background: 'var(--color-surface)', borderRadius: 10,
        marginBottom: 24,
      }}>
        {AXIS_ORDER.map(a => {
          const avail = isAxisAvailable(a)
          const active = a === axis
          return (
            <button
              key={a}
              onClick={() => avail && setAxis(a)}
              disabled={!avail}
              title={avail ? '' : 'Em breve'}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 7,
                background: active ? 'var(--color-bg-elevated)' : 'transparent',
                color: active
                  ? 'var(--color-text-primary)'
                  : avail ? 'var(--color-text-secondary)' : 'var(--color-text-quaternary)',
                fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em',
                cursor: avail ? 'pointer' : 'not-allowed',
                boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {AXIS_LABEL[a]}
              {!avail && (
                <span style={{
                  marginLeft: 6, fontSize: 9,
                  color: 'var(--color-text-quaternary)',
                  letterSpacing: '0.05em',
                }}>
                  em breve
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Cards do eixo ativo */}
      {options.length > 0 ? (
        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          marginBottom: 24,
        }}>
          {options.map(opt => {
            const isSelected = selected.has(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggle(opt.value)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  background: isSelected
                    ? 'rgba(255,255,255,0.03)'
                    : 'var(--color-bg)',
                  border: isSelected
                    ? '1.5px solid var(--color-text-primary)'
                    : '0.5px solid var(--color-border-strong)',
                  borderRadius: 10,
                  display: 'flex', flexDirection: 'column', gap: 10,
                  cursor: 'pointer', position: 'relative',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <span style={{
                  width: 36, height: 24, borderRadius: 5,
                  background: opt.color, flexShrink: 0,
                }} />
                <div>
                  <div style={{
                    fontSize: 13, fontWeight: 500,
                    color: 'var(--color-text-primary)',
                    letterSpacing: '-0.01em',
                  }}>
                    {opt.label}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--color-text-tertiary)',
                    marginTop: 4, lineHeight: 1.45,
                  }}>
                    {opt.description}
                  </div>
                </div>
                {isSelected && (
                  <span style={{
                    position: 'absolute', top: 10, right: 10,
                    width: 20, height: 20, borderRadius: 999,
                    background: 'var(--color-text-primary)', color: 'var(--color-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          color: 'var(--color-text-tertiary)', fontSize: 13,
          background: 'var(--color-bg)',
          border: '0.5px dashed var(--color-border-strong)',
          borderRadius: 10, marginBottom: 24,
        }}>
          Disponível em sprint futuro.
        </div>
      )}

      {/* Quality picker (sempre visível) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        paddingTop: 20, borderTop: '0.5px solid var(--color-border)',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
        }}>
          Qualidade
        </span>
        <div style={{
          display: 'flex', gap: 4, padding: 3,
          background: 'var(--color-surface)', borderRadius: 8,
        }}>
          {(['hd', '2k', '4k'] as Resolution[]).map(q => {
            const supported = availableQualities.includes(q)
            const active = quality === q && supported
            const cost = supported ? getVistaGenerationCost(engine, q) : null
            return (
              <button
                key={q}
                onClick={() => supported && setQuality(q)}
                disabled={!supported}
                title={supported ? `${cost} nodes/vista` : `Não disponível em ${ENGINES[engine].name}`}
                style={{
                  padding: '6px 12px', borderRadius: 6,
                  background: active ? 'var(--color-bg-elevated)' : 'transparent',
                  color: active
                    ? 'var(--color-text-primary)'
                    : supported ? 'var(--color-text-secondary)' : 'var(--color-text-quaternary)',
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.02em',
                  cursor: supported ? 'pointer' : 'not-allowed',
                  boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
                }}
              >
                {q.toUpperCase()}
              </button>
            )
          })}
        </div>
      </div>

      {/* Action area — substitui pelo painel de saldo insuficiente quando aplicável */}
      <div style={{ marginTop: 16 }}>
        {insufficient && selected.size > 0 ? (
          <InsufficientBalancePanel
            count={selected.size}
            costPer={costPer}
            total={total}
            available={balance}
            currentPlan={planId}
            onReduceTo={(n) => {
              const arr = Array.from(selected).slice(0, n)
              setSelected(new Set(arr))
            }}
          />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 14, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {selected.size > 0
                ? <>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{selected.size} variaç{selected.size === 1 ? 'ão' : 'ões'}</span>
                    <span style={{ marginLeft: 8 }}>· {costPer} nodes cada</span>
                  </>
                : 'selecione variações pra gerar'}
            </div>
            <button
              onClick={handleGenerate}
              disabled={selected.size === 0 || submitting || disabled}
              className="spn-action"
              style={{
                width: 'auto', minWidth: 200, padding: '12px 22px',
                background: '#1D9E75', color: '#042818',
                border: '0.5px solid rgba(0,0,0,0.18)',
                opacity: selected.size === 0 ? 0.5 : 1,
                boxShadow: selected.size > 0
                  ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(29,158,117,0.18)'
                  : 'none',
              }}
            >
              {submitting ? 'Gerando…' : `Gerar · ${total} nodes →`}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
