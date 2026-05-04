import type { Vista } from '@/lib/spaces/types'

// ── AnchorCard ─────────────────────────────────────────────────────────────────

interface AnchorCardProps {
  anchor: Vista | null
  spaceName: string
}

export function AnchorCard({ anchor, spaceName }: AnchorCardProps) {
  return (
    <div style={{
      background: '#111111',
      border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.04)',
    }}>
      {/* Image area */}
      <div style={{ aspectRatio: '16/9', position: 'relative', overflow: 'hidden' }}>
        {anchor?.output_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={anchor.output_url}
            alt={`Vista Mestre — ${spaceName}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(160deg, #2c3a4c 0%, #1a2330 40%, #0e1218 70%, #1c1810 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontSize: 10, color: 'rgba(255,255,255,0.18)',
              letterSpacing: '0.15em', textTransform: 'uppercase',
            }}>
              sem anchor
            </span>
          </div>
        )}

        {/* Vista Mestre badge */}
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(12px) saturate(180%)',
          WebkitBackdropFilter: 'blur(12px) saturate(180%)',
          border: '0.5px solid rgba(255,255,255,0.18)',
          color: '#fff',
          fontSize: 9, fontWeight: 500,
          letterSpacing: '0.16em', textTransform: 'uppercase' as const,
          padding: '4px 9px 4px 8px',
          borderRadius: 5,
          display: 'flex', alignItems: 'center', gap: 7,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: '#30b46c',
            boxShadow: '0 0 0 2.5px rgba(48,180,108,0.25)',
            flexShrink: 0,
          }} />
          Vista Mestre
        </div>
      </div>

      {/* Label strip */}
      <div style={{
        padding: '12px 16px',
        borderTop: '0.5px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.3)',
          letterSpacing: '-0.005em',
        }}>
          Anchor — referência visual do projeto
        </div>
      </div>
    </div>
  )
}
