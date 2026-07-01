'use client'

// Painel de Eixos — abas do MVP (Luz · Câmera · Detalhe) + body trocado por mode.
//
// Luz (iluminacao) e Detalhe usam modo parametric (cards selecionáveis).
// Câmera (angulo) usa modo sketch_guided (upload de prints + lista editável).
// Clima (horario) fica fora das abas no MVP.

import { useMemo, useState } from 'react'
import {
  AXIS_OPTIONS, AXIS_LABEL, AXIS_CONFIG, isAxisAvailable, getAxisMode,
  detalheOptionsForContext, type DetalheContext,
  type AxisOption,
} from '@/lib/spaces/axes'
import { ENGINES, type EngineId, type Resolution } from '@/lib/engines'
import { getVistaGenerationCost, getAvailableQualities } from '@/lib/spaces/economy'
import type { Axis, Quality } from '@/lib/spaces/types'
import type { PlanId } from '@/lib/plans'
import { spacesPreserveV2Enabled } from '@/lib/spaces/preserve-flags'
import { InsufficientBalancePanel } from './InsufficientBalancePanel'
import { SketchGuidedEixoBody, type SketchPayload } from './SketchGuidedEixoBody'
import { DetailIcon } from './DetailIcons'

// Labels/descrições arquitetônicos (Preserve V2). Deixam claro que cada eixo é
// uma VARIAÇÃO CONTROLADA do projeto, não geração livre. Só usados com a flag.
const PRESERVE_AXIS_LABEL: Record<Axis, string> = {
  iluminacao: 'Luz',
  angulo:     'Câmera',
  horario:    'Clima',
  detalhe:    'Detalhe',
}
const PRESERVE_AXIS_DESC: Record<Axis, string> = {
  iluminacao: 'Altera iluminação e atmosfera mantendo câmera, geometria e arquitetura.',
  angulo:     'Explora novos enquadramentos mantendo geometria, materiais e DNA do projeto.',
  horario:    'Altera céu, luz e atmosfera sem mudar fachada, volumetria ou implantação.',
  detalhe:    'Gera recortes aproximados do projeto preservando materiais, estilo, paleta e linguagem da vista mestre.',
}

// Substantivo da seleção por eixo paramétrico — o texto auxiliar muda conforme o
// módulo (Luz fala em "variações", Detalhe em "recortes").
const SELECTION_NOUN: Partial<Record<Axis, { one: string; many: string; prompt: string }>> = {
  iluminacao: { one: 'variação', many: 'variações', prompt: 'selecione variações pra gerar' },
  detalhe:    { one: 'recorte',  many: 'recortes',  prompt: 'selecione um recorte pra gerar' },
}
function selectionNoun(axis: Axis) {
  return SELECTION_NOUN[axis] ?? SELECTION_NOUN.iluminacao!
}

interface Props {
  engine:    EngineId
  defaultQuality?: Quality
  balance:   number
  planId:    PlanId
  spaceId:   string
  detalheContext: DetalheContext
  disabled?: boolean
  onGenerate:             (axis: Axis, axisValues: string[], quality: Quality) => Promise<void>
  onGenerateFromSketches: (sketches: SketchPayload[], quality: Quality) => Promise<void>
}

// MVP: só Luz, Câmera e Detalhe aparecem como módulos principais. Clima (horario)
// fica fora das abas — condições como Nublado/Blue hour vivem dentro de Luz.
const AXIS_ORDER: Axis[] = ['iluminacao', 'angulo', 'detalhe']

export function EixosPanel({
  engine, defaultQuality, balance, planId, spaceId, detalheContext, disabled,
  onGenerate, onGenerateFromSketches,
}: Props) {
  const [axis, setAxis]         = useState<Axis>('iluminacao')
  const availableQualities      = getAvailableQualities(engine)
  const initialQuality          = defaultQuality && availableQualities.includes(defaultQuality)
                                  ? defaultQuality
                                  : availableQualities[0]
  const [quality, setQuality]   = useState<Resolution>(initialQuality)

  const mode       = getAxisMode(axis)
  const preserveV2 = spacesPreserveV2Enabled()

  return (
    <section style={{
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 14, padding: 24,
    }}>
      {/* Tabs dos módulos (MVP: Luz · Câmera · Detalhe) */}
      <div style={{
        display: 'flex', gap: 4, padding: 4,
        background: 'var(--color-surface)', borderRadius: 10,
        marginBottom: 24,
      }}>
        {AXIS_ORDER.map(a => {
          // Detalhe depende do prompt builder do Preserve V2 (crop preservado).
          // Sem a flag, o eixo fica "em breve" em vez de cair no prompt legado.
          const avail = isAxisAvailable(a) && (a !== 'detalhe' || preserveV2)
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
              {preserveV2 ? PRESERVE_AXIS_LABEL[a] : AXIS_LABEL[a]}
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

      {/* Descrição arquitetônica do eixo ativo (Preserve V2) */}
      {preserveV2 && (
        <p style={{
          fontSize: 12, color: 'var(--color-text-tertiary)',
          lineHeight: 1.5, margin: '0 0 20px', letterSpacing: '-0.005em',
        }}>
          {PRESERVE_AXIS_DESC[axis]}
        </p>
      )}

      {/* Body conforme mode */}
      {mode === 'parametric' && (
        <ParametricEixoBody
          axis={axis}
          options={axis === 'detalhe' ? detalheOptionsForContext(detalheContext) : AXIS_OPTIONS[axis]}
          engine={engine}
          quality={quality}
          setQuality={setQuality}
          availableQualities={availableQualities}
          balance={balance}
          planId={planId}
          disabled={disabled}
          onGenerate={onGenerate}
        />
      )}

      {mode === 'sketch_guided' && (
        <SketchGuidedEixoBody
          axis={axis}
          spaceId={spaceId}
          engine={engine}
          quality={quality}
          setQuality={setQuality}
          availableQualities={availableQualities}
          balance={balance}
          planId={planId}
          disabled={disabled}
          onGenerate={onGenerateFromSketches}
          labelSuggestions={AXIS_CONFIG[axis].labelSuggestions ?? []}
        />
      )}

      {/* Microcopy de preservação (Preserve V2) */}
      {preserveV2 && (
        <p style={{
          marginTop: 18, paddingTop: 16,
          borderTop: '0.5px solid var(--color-border)',
          fontSize: 11, color: 'var(--color-text-quaternary)',
          lineHeight: 1.5, letterSpacing: '-0.005em',
        }}>
          O Spaces preserva o projeto original. Para mudanças estruturais, use uma
          ferramenta de edição específica.
        </p>
      )}
    </section>
  )
}

// ── Body: parametric (Iluminação) ─────────────────────────────

function ParametricEixoBody({
  axis, options, engine, quality, setQuality, availableQualities, balance, planId, disabled, onGenerate,
}: {
  axis:               Axis
  options:            AxisOption[]
  engine:             EngineId
  quality:            Resolution
  setQuality:         (q: Resolution) => void
  availableQualities: Quality[]
  balance:            number
  planId:             PlanId
  disabled?:          boolean
  onGenerate:         (axis: Axis, axisValues: string[], quality: Quality) => Promise<void>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const noun     = selectionNoun(axis)
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
    <>
      {/* Cards do eixo */}
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
                  background: isSelected ? 'var(--color-accent-green-bg)' : 'var(--color-bg)',
                  border: isSelected
                    ? '1.5px solid var(--color-accent-green)'
                    : '0.5px solid var(--color-border-strong)',
                  borderRadius: 10,
                  display: 'flex', flexDirection: 'column', gap: 10,
                  cursor: 'pointer', position: 'relative',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                {opt.icon ? (
                  <span style={{
                    width: 36, height: 24, borderRadius: 5, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    color: isSelected ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
                  }}>
                    <DetailIcon name={opt.icon} />
                  </span>
                ) : (
                  <span style={{
                    width: 36, height: 24, borderRadius: 5,
                    background: opt.color, flexShrink: 0,
                  }} />
                )}
                <div>
                  <div style={{
                    fontSize: 13, fontWeight: 500,
                    color: 'var(--color-text-primary)', letterSpacing: '-0.01em',
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
                    background: 'var(--color-accent-green)', color: 'var(--color-bg)',
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

      {/* Quality picker */}
      <QualityPicker engine={engine} quality={quality} setQuality={setQuality} availableQualities={availableQualities} />

      {/* Action / Insufficient */}
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
                    <span style={{ color: 'var(--color-text-secondary)' }}>{selected.size} {selected.size === 1 ? noun.one : noun.many}</span>
                    <span style={{ marginLeft: 8 }}>· {costPer} nodes cada</span>
                  </>
                : noun.prompt}
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
    </>
  )
}

// ── Sub-componentes compartilhados ────────────────────────────

export function QualityPicker({ engine, quality, setQuality, availableQualities }: {
  engine:             EngineId
  quality:            Resolution
  setQuality:         (q: Resolution) => void
  availableQualities: Quality[]
}) {
  return (
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
  )
}
