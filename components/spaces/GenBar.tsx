'use client'

// ── GenBar — CTAs primários do Space ─────────────────────────────────────────

interface GenBarProps {
  onEvolve:      () => void
  onUploadVista: () => void
}

export function GenBar({ onEvolve, onUploadVista }: GenBarProps) {
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
          Gere novas Vistas ou renderize novos ângulos com o DNA do projeto
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>

        {/* Upload de Ângulo — ação secundária */}
        <button
          onClick={onUploadVista}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '10px 16px',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.72)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            fontSize: 13, fontWeight: 500,
            fontFamily: 'inherit', cursor: 'pointer',
            letterSpacing: '-0.005em',
            transition: 'background 0.15s, border-color 0.15s',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Upload de Ângulo
        </button>

        {/* Nova Evolução — ação primária */}
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
    </div>
  )
}
