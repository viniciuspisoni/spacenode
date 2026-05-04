import type { ProjectDNA } from '@/lib/spaces/types'

// ── Lock icon ──────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="rgba(48,180,108,0.65)" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

// ── Single DNA row ────────────────────────────────────────────────────────────

interface DnaRowProps {
  label: string
  value: string | string[]
  isLast?: boolean
}

function DnaRow({ label, value, isLast }: DnaRowProps) {
  const isEmpty = !value ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'string' && !value.trim())

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      paddingBottom: isLast ? 4 : 12,
      borderBottom: isLast ? 'none' : '0.5px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 9, fontWeight: 500,
          letterSpacing: '0.2em', textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.28)',
        }}>
          {label}
        </span>
        <LockIcon />
      </div>

      {isEmpty ? (
        <span style={{
          fontSize: 11.5, color: 'rgba(255,255,255,0.2)',
          fontStyle: 'italic', letterSpacing: '-0.005em',
        }}>
          não definido
        </span>
      ) : Array.isArray(value) ? (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
          {value.map((hex, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid rgba(255,255,255,0.08)',
              borderRadius: 5, padding: '3px 8px 3px 5px',
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: 3,
                background: hex,
                border: '0.5px solid rgba(255,255,255,0.15)',
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 10.5,
                color: 'rgba(255,255,255,0.52)',
                fontFamily: 'monospace',
                letterSpacing: '0.02em',
              }}>
                {hex}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <span style={{
          fontSize: 12, color: 'rgba(255,255,255,0.65)',
          lineHeight: 1.5, letterSpacing: '-0.005em',
        }}>
          {value}
        </span>
      )}
    </div>
  )
}

// ── DnaCard ───────────────────────────────────────────────────────────────────

interface DnaCardProps {
  dna: ProjectDNA
}

export function DnaCard({ dna }: DnaCardProps) {
  return (
    <div style={{
      background: '#111111',
      border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      padding: '20px 20px 8px',
      boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.04)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 18,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 500,
          letterSpacing: '0.24em', textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.32)',
        }}>
          Project DNA
        </span>
        <span style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
        <span style={{
          fontSize: 9, color: 'rgba(48,180,108,0.65)',
          letterSpacing: '-0.005em',
        }}>
          5/5 travados
        </span>
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DnaRow label="Estilo"      value={dna.style} />
        <DnaRow label="Materiais"   value={dna.materials} />
        <DnaRow label="Paleta"      value={dna.palette} />
        <DnaRow label="Contexto"    value={dna.context} />
        <DnaRow label="Iluminação"  value={dna.lighting} isLast />
      </div>
    </div>
  )
}
