'use client'

import type { Vista, VistaType, GenerationMode, DnaTrait, DnaOverrides } from '@/lib/spaces/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)  return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days  = Math.floor(hours / 24)
  return `há ${days}d`
}

const VISTA_TYPE_LABEL: Record<VistaType, string> = {
  mestre:     'Vista Mestre',
  iluminacao: 'Iluminação',
  material:   'Material',
  angulo:     'Ângulo',
  detalhe:    'Detalhe',
  interior:   'Interior',
}

const MODE_LABEL: Record<GenerationMode, string> = {
  coerente: 'Coerente',
  explorar: 'Explorar',
}

const ALL_TRAITS: DnaTrait[] = ['style', 'materials', 'palette', 'context', 'lighting']

function safeCountLocked(overrides: DnaOverrides | null | undefined): { locked: number; unlocked: number } {
  if (!overrides) return { locked: 5, unlocked: 0 }
  const locked = ALL_TRAITS.filter(t => overrides[t]?.locked ?? true).length
  return { locked, unlocked: 5 - locked }
}

// ── LineageNode ───────────────────────────────────────────────────────────────

interface LineageNodeProps {
  vista:     Vista | null
  label:     string
  isCurrent: boolean
  isLast:    boolean
}

function LineageNode({ vista, label, isCurrent, isLast }: LineageNodeProps) {
  const isCoerente = vista?.generation_mode === 'coerente'
  const modeColor  = isCoerente ? '#30b46c' : '#f59e0b'

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {/* Track column */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        {/* Node dot */}
        <div style={{
          width:        isCurrent ? 10 : 8,
          height:       isCurrent ? 10 : 8,
          borderRadius: '50%',
          background:   isCurrent ? '#fafafa' : 'rgba(255,255,255,0.25)',
          border:       isCurrent ? 'none' : '0.5px solid rgba(255,255,255,0.2)',
          flexShrink:   0,
          marginTop:    2,
          boxShadow:    isCurrent ? '0 0 6px rgba(255,255,255,0.3)' : 'none',
        }} />
        {/* Connector line */}
        {!isLast && (
          <div style={{
            width:      '0.5px',
            flex:       1,
            minHeight:  20,
            background: 'rgba(255,255,255,0.1)',
            margin:     '4px 0',
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{
        paddingBottom: isLast ? 0 : 12,
        display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
      }}>
        {/* Thumbnail */}
        {vista?.output_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vista.output_url}
            alt={label}
            style={{
              width: 36, height: 22, borderRadius: 4, objectFit: 'cover',
              border: isCurrent ? '0.5px solid rgba(255,255,255,0.3)' : '0.5px solid rgba(255,255,255,0.1)',
              flexShrink: 0,
            }}
          />
        ) : (
          <div style={{
            width: 36, height: 22, borderRadius: 4, flexShrink: 0,
            background: 'rgba(255,255,255,0.06)',
            border: '0.5px solid rgba(255,255,255,0.08)',
          }} />
        )}

        {/* Label + badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' as const,
          }}>
            <span style={{
              fontSize:     11,
              fontWeight:   isCurrent ? 500 : 400,
              color:        isCurrent ? '#fafafa' : 'rgba(255,255,255,0.52)',
              letterSpacing: '-0.01em',
              overflow:     'hidden',
              whiteSpace:   'nowrap' as const,
              textOverflow: 'ellipsis',
              maxWidth:     120,
            }}>
              {label}
            </span>

            {isCurrent && (
              <span style={{
                fontSize: 8, fontWeight: 500,
                color: 'rgba(255,255,255,0.8)',
                background: 'rgba(255,255,255,0.1)',
                border: '0.5px solid rgba(255,255,255,0.2)',
                borderRadius: 3, padding: '1px 5px',
                letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                flexShrink: 0,
              }}>
                atual
              </span>
            )}

            {vista && vista.vista_type !== 'mestre' && !isCurrent && (
              <span style={{
                fontSize: 8, color: modeColor,
                background: isCoerente ? 'rgba(48,180,108,0.1)' : 'rgba(245,158,11,0.1)',
                border: `0.5px solid ${isCoerente ? 'rgba(48,180,108,0.2)' : 'rgba(245,158,11,0.2)'}`,
                borderRadius: 3, padding: '1px 5px',
                letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                flexShrink: 0,
              }}>
                {MODE_LABEL[vista.generation_mode]}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MetaRow ───────────────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      gap: 12,
    }}>
      <span style={{
        fontSize: 10.5, color: 'rgba(255,255,255,0.3)',
        letterSpacing: '-0.005em', flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 10.5, color: 'rgba(255,255,255,0.7)',
        letterSpacing: '-0.005em', textAlign: 'right' as const,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </div>
  )
}

// ── LineagePanel ──────────────────────────────────────────────────────────────

interface LineagePanelProps {
  vista:     Vista           // the vista being inspected
  anchor:    Vista | null    // Vista Mestre
  allVistas: Vista[]         // non-mestre completed vistas
  onClose:   () => void
  onEvolve:  (vista: Vista) => void
}

export function LineagePanel({
  vista,
  anchor,
  allVistas,
  onClose,
  onEvolve,
}: LineagePanelProps) {

  // ── Derived ────────────────────────────────────────────────────────────────
  const typeLabel    = VISTA_TYPE_LABEL[vista.vista_type] ?? vista.vista_type
  const displayLabel = vista.vista_label ?? typeLabel
  const isCoerente   = vista.generation_mode === 'coerente'
  const modeColor    = isCoerente ? '#30b46c' : '#f59e0b'
  const modeBg       = isCoerente ? 'rgba(48,180,108,0.12)' : 'rgba(245,158,11,0.12)'
  const modeBorder   = isCoerente ? 'rgba(48,180,108,0.25)' : 'rgba(245,158,11,0.25)'
  const geometryLock = isCoerente ? 90 : 50
  const dnaCount     = safeCountLocked(vista.dna_overrides)
  const children     = allVistas.filter(v => v.parent_render_id === vista.id)

  // ── Lineage chain ──────────────────────────────────────────────────────────
  // Build chain: [anchor?, intermediateParent?, currentVista] + children
  type ChainNode = { vista: Vista | null; label: string; isCurrent: boolean }
  const chain: ChainNode[] = []

  // Always show anchor at top if we have it
  if (anchor) {
    chain.push({
      vista:     anchor,
      label:     'Vista Mestre',
      isCurrent: false,
    })
  }

  // If current vista's parent is not the anchor (intermediate parent)
  if (vista.parent_render_id && vista.parent_render_id !== anchor?.id) {
    const intermediateParent = allVistas.find(v => v.id === vista.parent_render_id)
    if (intermediateParent) {
      chain.push({
        vista:     intermediateParent,
        label:     intermediateParent.vista_label ?? VISTA_TYPE_LABEL[intermediateParent.vista_type],
        isCurrent: false,
      })
    }
  }

  // Current vista
  chain.push({ vista, label: displayLabel, isCurrent: true })

  // Children
  for (const child of children) {
    chain.push({
      vista:     child,
      label:     child.vista_label ?? VISTA_TYPE_LABEL[child.vista_type],
      isCurrent: false,
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(2px)',
          zIndex: 40,
        }}
      />

      {/* Panel */}
      <div style={{
        position:  'fixed', top: 0, right: 0, bottom: 0,
        width:     420,
        background: '#111111',
        borderLeft: '0.5px solid rgba(255,255,255,0.1)',
        zIndex:    50,
        display:   'flex', flexDirection: 'column',
        boxShadow: '-24px 0 80px rgba(0,0,0,0.5)',
        overflowY: 'auto',
      }}>

        {/* ── Image ── */}
        <div style={{ aspectRatio: '16/9', position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
          {vista.output_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vista.output_url}
              alt={displayLabel}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: '#181818',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9"/>
                  <polyline points="12 7 12 12 15 15"/>
                </svg>
              </div>
            </div>
          )}

          {/* Close button overlay */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 12, right: 12,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(8px)',
              border: '0.5px solid rgba(255,255,255,0.15)',
              borderRadius: 6, padding: 6,
              color: 'rgba(255,255,255,0.8)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, padding: '20px 24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Vista identity */}
          <div>
            <div style={{
              fontSize: 16, fontWeight: 600,
              color: '#fafafa', letterSpacing: '-0.025em',
              marginBottom: 8, lineHeight: 1.3,
            }}>
              {displayLabel}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
              {/* Type badge */}
              <span style={{
                fontSize: 9, fontWeight: 500,
                color: 'rgba(255,255,255,0.6)',
                background: 'rgba(255,255,255,0.07)',
                border: '0.5px solid rgba(255,255,255,0.12)',
                borderRadius: 4, padding: '3px 8px',
                letterSpacing: '0.12em', textTransform: 'uppercase' as const,
              }}>
                {typeLabel}
              </span>
              {/* Mode badge */}
              <span style={{
                fontSize: 9, fontWeight: 500,
                color: modeColor,
                background: modeBg,
                border: `0.5px solid ${modeBorder}`,
                borderRadius: 4, padding: '3px 8px',
                letterSpacing: '0.12em', textTransform: 'uppercase' as const,
              }}>
                {MODE_LABEL[vista.generation_mode]}
              </span>
              {/* Date */}
              <span style={{
                fontSize: 10, color: 'rgba(255,255,255,0.28)',
                letterSpacing: '-0.005em',
              }}>
                {formatRelativeTime(vista.created_at)}
              </span>
            </div>
          </div>

          {/* Lineage mini-tree */}
          <div>
            <div style={{
              fontSize: 9, fontWeight: 500,
              letterSpacing: '0.2em', textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.28)', marginBottom: 14,
            }}>
              Linhagem
            </div>
            <div style={{ paddingLeft: 2 }}>
              {chain.map((node, i) => (
                <LineageNode
                  key={node.vista?.id ?? `node-${i}`}
                  vista={node.vista}
                  label={node.label}
                  isCurrent={node.isCurrent}
                  isLast={i === chain.length - 1}
                />
              ))}
            </div>
          </div>

          {/* Meta rows */}
          <div>
            <div style={{
              fontSize: 9, fontWeight: 500,
              letterSpacing: '0.2em', textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.28)', marginBottom: 12,
            }}>
              Detalhes
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.025)',
              border: '0.5px solid rgba(255,255,255,0.07)',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <MetaRow label="Tipo"          value={typeLabel} />
              <MetaRow label="Modo"          value={MODE_LABEL[vista.generation_mode]} />
              <MetaRow label="Geometry lock" value={`${geometryLock}%`} />
              <MetaRow
                label="DNA"
                value={`${dnaCount.locked} trav. / ${dnaCount.unlocked} livre${dnaCount.unlocked !== 1 ? 's' : ''}`}
              />
              <MetaRow label="Filhos"        value={children.length} />
              <MetaRow label="Motor"         value="Vega (nano-banana-pro)" />
              <MetaRow
                label="Status"
                value={
                  <span style={{
                    color: vista.status === 'completed'
                      ? '#30b46c'
                      : vista.status === 'failed'
                        ? '#ef4444'
                        : 'rgba(255,255,255,0.5)',
                  }}>
                    {vista.status === 'completed' ? 'Concluído'
                      : vista.status === 'failed'  ? 'Falhou'
                      : vista.status === 'processing' ? 'Processando'
                      : 'Pendente'}
                  </span>
                }
              />
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={() => onEvolve(vista)}
            style={{
              width: '100%', padding: '12px 20px',
              background: 'linear-gradient(180deg, #30b46c 0%, #258d54 100%)',
              color: '#042818',
              border: 'none', borderRadius: 8,
              fontSize: 13.5, fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: '-0.005em',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 20px rgba(48,180,108,0.2)',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Evoluir esta Vista
          </button>
        </div>
      </div>
    </>
  )
}
