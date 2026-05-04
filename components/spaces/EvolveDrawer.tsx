'use client'

import { useState, useEffect }  from 'react'
import { useRouter }             from 'next/navigation'
import type { Vista, VistaType, Space, GenerationMode, DnaOverrides, DnaTrait, Suggestion } from '@/lib/spaces/types'
import { getDefaultDnaOverrides, getModePreset, applyModeUnlocks } from '@/lib/spaces/dna'
import { DnaStack }        from './DnaStack'
import { ModeToggle }      from './ModeToggle'
import { SuggestionsList } from './SuggestionsList'

// ── Types ─────────────────────────────────────────────────────────────────────

type EvolvableVistaType = Exclude<VistaType, 'mestre'>

interface EvolveDrawerProps {
  isOpen:        boolean
  onClose:       () => void
  space:         Space
  anchor:        Vista | null          // Vista Mestre (anchor)
  allVistas:     Vista[]               // non-mestre completed vistas
  initialParent: Vista | null          // which vista triggered the drawer
  spaceId:       string
}

// ── Vista type options ────────────────────────────────────────────────────────

const VISTA_OPTIONS: { type: EvolvableVistaType; label: string }[] = [
  { type: 'iluminacao', label: 'Iluminação' },
  { type: 'material',   label: 'Material'   },
  { type: 'angulo',     label: 'Ângulo'     },
  { type: 'detalhe',    label: 'Detalhe'    },
  { type: 'interior',   label: 'Interior'   },
]

// ── Contextual hint ───────────────────────────────────────────────────────────

const TRAIT_LABELS: Record<DnaTrait, string> = {
  style:     'Estilo',
  materials: 'Materiais',
  palette:   'Paleta',
  context:   'Contexto',
  lighting:  'Iluminação',
}

const ALL_TRAITS: DnaTrait[] = ['style', 'materials', 'palette', 'context', 'lighting']

function buildHint(
  vistaType:  EvolvableVistaType,
  overrides:  DnaOverrides,
  mode:       GenerationMode,
): string | null {
  const unlocked = ALL_TRAITS.filter(t => !overrides[t].locked).map(t => TRAIT_LABELS[t])
  if (unlocked.length === 0) return null

  if (mode === 'explorar') {
    return `${unlocked.join(' e ')} liberados para maior variação criativa.`
  }

  const hints: Record<EvolvableVistaType, string | null> = {
    iluminacao: 'Iluminação liberada porque esta evolução altera a atmosfera da cena.',
    material:   'Materiais liberados para explorar novos acabamentos e texturas.',
    angulo:     'Iluminação liberada para adaptar a atmosfera ao novo ponto de vista.',
    detalhe:    null,
    interior:   'Contexto e Iluminação liberados para adaptar o ambiente interior.',
  }

  return hints[vistaType] ?? `${unlocked.join(', ')} liberados.`
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      margin: '16px 0',
    }}>
      <span style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.07)' }} />
      <span style={{
        fontSize: 9.5, color: 'rgba(255,255,255,0.25)',
        letterSpacing: '0.04em', whiteSpace: 'nowrap' as const,
      }}>
        {label}
      </span>
      <span style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.07)' }} />
    </div>
  )
}

// ── EvolveDrawer ──────────────────────────────────────────────────────────────

export function EvolveDrawer({
  isOpen,
  onClose,
  space,
  anchor,
  allVistas,
  initialParent,
  spaceId,
}: EvolveDrawerProps) {
  const router = useRouter()

  // ── Core state ─────────────────────────────────────────────────────────────
  const [selectedType, setSelectedType]       = useState<EvolvableVistaType>('iluminacao')
  const [generationMode, setGenerationMode]   = useState<GenerationMode>('coerente')
  const [geometryLock, setGeometryLock]       = useState(getModePreset('coerente').geometryLock)
  const [overrides, setOverrides]             = useState<DnaOverrides>(() =>
    applyModeUnlocks(getDefaultDnaOverrides('iluminacao'), 'coerente')
  )
  const [vistaLabel, setVistaLabel]           = useState<string | null>(null)
  // effectiveParent: resolved from suggestion.parent_id or initialParent
  const [effectiveParent, setEffectiveParent] = useState<Vista | null>(initialParent)

  // ── Suggestions state ──────────────────────────────────────────────────────
  const [suggestions, setSuggestions]         = useState<Suggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number | null>(null)

  // ── Fetch suggestions on mount ────────────────────────────────────────────
  // Component unmounts on close (due to `if (!isOpen) return null`) so this
  // runs fresh each time the drawer opens.
  useEffect(() => {
    // setSuggestionsLoading is already true from useState(true) — component
    // remounts on each open (returns null when closed), so no need to reset here.
    fetch(`/api/spaces/${spaceId}/suggestions`)
      .then(r => r.json())
      .then(d => setSuggestions(d.suggestions ?? []))
      .catch(() => { /* non-critical */ })
      .finally(() => setSuggestionsLoading(false))
  }, [spaceId])

  // ── Generate state ─────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // ── Interaction handlers ───────────────────────────────────────────────────

  function handleTypeChange(newType: EvolvableVistaType) {
    setSelectedType(newType)
    setOverrides(applyModeUnlocks(getDefaultDnaOverrides(newType), generationMode))
    setVistaLabel(null)
    setSelectedSuggestionIdx(null)
  }

  function handleModeChange(newMode: GenerationMode) {
    setGenerationMode(newMode)
    const preset = getModePreset(newMode)
    setGeometryLock(preset.geometryLock)
    setOverrides(applyModeUnlocks(getDefaultDnaOverrides(selectedType), newMode))
    setSelectedSuggestionIdx(null)
  }

  function handleOverridesChange(next: DnaOverrides) {
    setOverrides(next)
    setSelectedSuggestionIdx(null)
  }

  function handleSuggestionSelect(s: Suggestion, idx: number) {
    const newType = s.vista_type as EvolvableVistaType
    setSelectedType(newType)
    setVistaLabel(s.label)
    setSelectedSuggestionIdx(idx)

    // Resolve parent: suggestion's parent_id → allVistas or anchor; else keep initialParent
    if (s.parent_id) {
      const found = allVistas.find(v => v.id === s.parent_id)
        ?? (anchor?.id === s.parent_id ? anchor : null)
        ?? initialParent
      setEffectiveParent(found)
    } else {
      setEffectiveParent(initialParent)
    }

    // Recalculate overrides for new type + current mode
    setOverrides(applyModeUnlocks(getDefaultDnaOverrides(newType), generationMode))
  }

  async function handleEvolve() {
    if (!effectiveParent) {
      setError('Nenhuma Vista pai selecionada.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/spaces/${spaceId}/evolve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          parent_render_id: effectiveParent.id,
          vista_type:       selectedType,
          generation_mode:  generationMode,
          dna_overrides:    overrides,
          geometry_lock:    geometryLock,
          vista_label:      vistaLabel ?? undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Erro ao gerar Vista')
        return
      }

      onClose()
      router.refresh()

    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // ── Early return ───────────────────────────────────────────────────────────
  if (!isOpen) return null

  // ── Derived ───────────────────────────────────────────────────────────────
  const isExplorar   = generationMode === 'explorar'
  const accentColor  = isExplorar ? '#f59e0b' : '#30b46c'
  const accentBg     = isExplorar ? 'rgba(245,158,11,0.06)' : 'rgba(48,180,108,0.06)'
  const accentBorder = isExplorar ? 'rgba(245,158,11,0.18)' : 'rgba(48,180,108,0.18)'
  const hint         = buildHint(selectedType, overrides, generationMode)

  const parentLabel = effectiveParent
    ? (effectiveParent.vista_type === 'mestre'
        ? 'Vista Mestre'
        : (effectiveParent.vista_label ?? effectiveParent.vista_type))
    : '—'

  const hasSuggestions = suggestionsLoading || suggestions.length > 0

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(2px)',
          zIndex: 40,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 420,
        background: '#111111',
        borderLeft: `0.5px solid ${isExplorar ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.1)'}`,
        zIndex: 50,
        display: 'flex', flexDirection: 'column',
        boxShadow: isExplorar
          ? '-24px 0 80px rgba(245,158,11,0.06), -24px 0 40px rgba(0,0,0,0.4)'
          : '-24px 0 80px rgba(0,0,0,0.5)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '24px 24px 20px',
          borderBottom: '0.5px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontSize: 15, fontWeight: 600,
              color: '#fafafa', letterSpacing: '-0.02em', marginBottom: 4,
            }}>
              Nova Evolução
            </div>
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.38)',
              letterSpacing: '-0.005em',
            }}>
              A partir de: <span style={{ color: 'rgba(255,255,255,0.55)' }}>{parentLabel}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
              padding: 4, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Mode toggle */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 9, fontWeight: 500,
              letterSpacing: '0.2em', textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.28)', marginBottom: 10,
            }}>
              Modo
            </div>
            <ModeToggle value={generationMode} onChange={handleModeChange} />

            <div style={{
              marginTop: 8,
              background: accentBg, border: `0.5px solid ${accentBorder}`,
              borderRadius: 7, padding: '8px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: accentColor, flexShrink: 0,
              }} />
              <div style={{
                fontSize: 10.5, color: accentColor, letterSpacing: '-0.005em',
              }}>
                {isExplorar
                  ? `Explorar — geometry lock ${geometryLock} · Materiais e Iluminação liberados`
                  : `Coerente — geometry lock ${geometryLock} · DNA preservado`
                }
              </div>
            </div>
          </div>

          {/* Suggestions section */}
          {hasSuggestions && (
            <>
              <div style={{ marginBottom: 8 }}>
                <div style={{
                  fontSize: 9, fontWeight: 500,
                  letterSpacing: '0.2em', textTransform: 'uppercase' as const,
                  color: 'rgba(255,255,255,0.28)', marginBottom: 6,
                }}>
                  Sugestões
                </div>
                <p style={{
                  margin: '0 0 10px',
                  fontSize: 10, color: 'rgba(255,255,255,0.25)',
                  letterSpacing: '-0.003em', lineHeight: 1.5,
                }}>
                  Baseadas nas Vistas já criadas neste Space.
                </p>
                <SuggestionsList
                  suggestions={suggestions}
                  selectedIndex={selectedSuggestionIdx}
                  onSelect={handleSuggestionSelect}
                  loading={suggestionsLoading}
                />
              </div>

              <Divider label="ou comece do zero" />
            </>
          )}

          {/* Vista type selector */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 9, fontWeight: 500,
              letterSpacing: '0.2em', textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.28)', marginBottom: 10,
            }}>
              Tipo de Vista
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
              {VISTA_OPTIONS.map(opt => {
                const isSelected = opt.type === selectedType
                return (
                  <button
                    key={opt.type}
                    onClick={() => handleTypeChange(opt.type)}
                    style={{
                      background:   isSelected ? accentBg : 'rgba(255,255,255,0.03)',
                      border:       `0.5px solid ${isSelected ? accentBorder : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 6, padding: '6px 12px',
                      color:        isSelected ? accentColor : 'rgba(255,255,255,0.5)',
                      fontSize:     11.5, fontWeight: isSelected ? 500 : 400,
                      fontFamily:   'inherit', cursor: 'pointer',
                      letterSpacing: '-0.005em', transition: 'all 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Vista label input */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 9, fontWeight: 500,
              letterSpacing: '0.2em', textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.28)', marginBottom: 8,
            }}>
              Nome da Vista <span style={{ color: 'rgba(255,255,255,0.18)', fontWeight: 400 }}>(opcional)</span>
            </div>
            <input
              type="text"
              value={vistaLabel ?? ''}
              onChange={e => setVistaLabel(e.target.value || null)}
              placeholder={`Ex: ${selectedType === 'iluminacao' ? 'Golden Hour' : selectedType === 'material' ? 'Concreto + Madeira' : selectedType === 'angulo' ? 'Vista aérea drone' : selectedType === 'detalhe' ? 'Close janela' : 'Sala de estar'}`}
              style={{
                width:        '100%',
                padding:      '8px 12px',
                background:   'rgba(255,255,255,0.04)',
                border:       `0.5px solid ${vistaLabel ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 7,
                color:        '#fafafa',
                fontSize:     12,
                fontFamily:   'inherit',
                letterSpacing: '-0.01em',
                outline:      'none',
                boxSizing:    'border-box' as const,
                transition:   'border-color 0.15s',
              }}
            />
          </div>

          {/* DNA Stack */}
          <DnaStack
            dna={space.project_dna}
            overrides={overrides}
            onChange={handleOverridesChange}
          />

          {/* Contextual hint */}
          {hint && (
            <div style={{
              marginTop: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '0.5px solid rgba(255,255,255,0.07)',
              borderRadius: 7, padding: '8px 12px',
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"
                style={{ marginTop: 1, flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4"/>
                <path d="M12 8h.01"/>
              </svg>
              <span style={{
                fontSize: 10.5, color: 'rgba(255,255,255,0.35)',
                lineHeight: 1.5, letterSpacing: '-0.005em',
              }}>
                {hint}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 16,
              background: 'rgba(239,68,68,0.08)',
              border: '0.5px solid rgba(239,68,68,0.2)',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 11.5, color: 'rgba(239,68,68,0.9)',
              letterSpacing: '-0.005em',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '16px 24px 24px',
          borderTop: '0.5px solid rgba(255,255,255,0.07)',
        }}>
          <button
            onClick={handleEvolve}
            disabled={loading || !effectiveParent}
            style={{
              width: '100%', padding: '12px 20px',
              background: loading
                ? `${accentColor}44`
                : isExplorar
                  ? 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)'
                  : 'linear-gradient(180deg, #30b46c 0%, #258d54 100%)',
              color:       loading ? 'rgba(0,0,0,0.4)' : isExplorar ? '#451a03' : '#042818',
              border:      'none', borderRadius: 8,
              fontSize:    13.5, fontWeight: 600,
              fontFamily:  'inherit',
              cursor:      (loading || !effectiveParent) ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.005em',
              boxShadow:   loading ? 'none' : isExplorar
                ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 20px rgba(245,158,11,0.2)'
                : 'inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 20px rgba(48,180,108,0.2)',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ animation: 'evolve-spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
                Gerando Vista…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Gerar Vista
              </>
            )}
          </button>

          <div style={{
            marginTop: 8, textAlign: 'center' as const,
            fontSize: 10, color: 'rgba(255,255,255,0.2)',
            letterSpacing: '-0.005em',
          }}>
            4 créditos
          </div>
        </div>
      </div>

      <style>{`
        @keyframes evolve-spin {
          from { transform: rotate(0deg) }
          to   { transform: rotate(360deg) }
        }
      `}</style>
    </>
  )
}
