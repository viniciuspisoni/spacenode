'use client'

// ── GenBar — "Nova Evolução" CTA ──────────────────────────────────────────────

interface GenBarProps {
  onEvolve: () => void
}

export function GenBar({ onEvolve }: GenBarProps) {
  return (
    <div style={{
      background: '#111111',
      border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 24,
      marginBottom: 32,
      boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.04)',
    }}>
      <div>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: '#fafafa', letterSpacing: '-0.013em',
          marginBottom: 3,
        }}>
          Evoluir Space
        </div>
        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.38)',
          letterSpacing: '-0.005em',
        }}>
          Gere novas Vistas mantendo o DNA do projeto
        </div>
      </div>

      <button
        onClick={onEvolve}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 20px',
          background: 'linear-gradient(180deg, #30b46c 0%, #258d54 100%)',
          color: '#042818',
          border: 'none', borderRadius: 8,
          fontSize: 13, fontWeight: 600,
          fontFamily: 'inherit', cursor: 'pointer',
          letterSpacing: '-0.005em', flexShrink: 0,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 20px rgba(48,180,108,0.2)',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nova Evolução
      </button>
    </div>
  )
}
