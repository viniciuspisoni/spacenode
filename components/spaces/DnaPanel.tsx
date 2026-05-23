// Painel que exibe o DNA estruturado.
// Variantes:
//   - 'reveal'  → grid 2x2 grande, usado na tela Reveal (Sprint 1)
//   - 'strip'   → 4 cards horizontais compact, usado em Space em uso (Sprint 2+)

import type { ProjectDNA } from '@/lib/spaces/types'

interface DnaPanelProps {
  dna:      ProjectDNA
  variant?: 'reveal' | 'strip'
}

export function DnaPanel({ dna, variant = 'reveal' }: DnaPanelProps) {
  if (variant === 'strip') return <DnaStrip dna={dna} />
  return <DnaReveal dna={dna} />
}

// ── Variante Reveal (grid 2x2) ─────────────────────────────────
function DnaReveal({ dna }: { dna: ProjectDNA }) {
  return (
    <div style={{
      display: 'grid', gap: 16,
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    }}>
      <DnaCardEstilo dna={dna} />
      <DnaCardMateriais dna={dna} />
      <DnaCardPaleta dna={dna} />
      <DnaCardContexto dna={dna} />
    </div>
  )
}

// ── Variante Strip (4 cards compactos horizontais) ─────────────
function DnaStrip({ dna }: { dna: ProjectDNA }) {
  const items = [
    { label: 'Estilo',    value: dna.estilo.nome },
    { label: 'Materiais', value: `${dna.materiais.length} detectados` },
    { label: 'Paleta',    value: `${dna.paleta.length} cores` },
    { label: 'Contexto',  value: dna.contexto.slice(0, 2).join(' · ') },
  ]
  return (
    <div style={{
      display: 'grid', gap: 8,
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    }}>
      {items.map(it => (
        <div key={it.label} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px',
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 10,
        }}>
          <CheckIcon />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--color-text-tertiary)', marginBottom: 3,
            }}>
              {it.label}
            </div>
            <div style={{
              fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {it.value || '—'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Cards individuais (variante reveal) ────────────────────────
function CardShell({ title, children, badge }: {
  title:    string
  children: React.ReactNode
  badge?:   string
}) {
  return (
    <div style={{
      padding: '20px 22px',
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 12,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
        }}>
          {title}
        </h3>
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.02em',
            color: '#46d191', background: 'rgba(29,158,117,0.14)',
            padding: '3px 8px', borderRadius: 4,
          }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function DnaCardEstilo({ dna }: { dna: ProjectDNA }) {
  const conf = Math.round(dna.estilo.confianca * 100)
  return (
    <CardShell title="Estilo" badge={`${conf}% confiança`}>
      <div style={{
        fontSize: 19, fontWeight: 500, color: 'var(--color-text-primary)',
        letterSpacing: '-0.025em', lineHeight: 1.25,
      }}>
        {dna.estilo.nome}
      </div>
    </CardShell>
  )
}

function DnaCardMateriais({ dna }: { dna: ProjectDNA }) {
  return (
    <CardShell title="Materiais" badge={`${dna.materiais.length}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dna.materiais.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
              background: m.hex,
              border: '0.5px solid rgba(255,255,255,0.12)',
              boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.2)',
            }} />
            <span style={{
              fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500,
              letterSpacing: '-0.01em',
            }}>
              {m.nome}
            </span>
            <span style={{
              fontSize: 11, color: 'var(--color-text-quaternary)',
              fontFamily: 'ui-monospace,Menlo,monospace', marginLeft: 'auto',
            }}>
              {m.hex.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </CardShell>
  )
}

function DnaCardPaleta({ dna }: { dna: ProjectDNA }) {
  return (
    <CardShell title="Paleta" badge={`${dna.paleta.length} cores`}>
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: `repeat(${Math.min(dna.paleta.length, 6)}, 1fr)`,
      }}>
        {dna.paleta.map((c, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
            <div style={{
              width: '100%', aspectRatio: '1', borderRadius: 999,
              background: c,
              border: '0.5px solid rgba(255,255,255,0.12)',
              boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.2)',
            }} />
            <span style={{
              fontSize: 9, color: 'var(--color-text-quaternary)',
              fontFamily: 'ui-monospace,Menlo,monospace',
            }}>
              {c.toUpperCase().slice(1)}
            </span>
          </div>
        ))}
      </div>
    </CardShell>
  )
}

function DnaCardContexto({ dna }: { dna: ProjectDNA }) {
  return (
    <CardShell title="Contexto">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {dna.contexto.map((t, i) => (
          <span key={i} style={{
            fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)',
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border-strong)',
            padding: '6px 12px', borderRadius: 999,
            letterSpacing: '-0.005em',
          }}>
            {t}
          </span>
        ))}
        {dna.contexto.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--color-text-quaternary)' }}>—</span>
        )}
      </div>
    </CardShell>
  )
}

function CheckIcon() {
  return (
    <span style={{
      width: 18, height: 18, flexShrink: 0,
      borderRadius: 999,
      background: 'rgba(29,158,117,0.16)',
      color: '#46d191',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </span>
  )
}
