'use client'

import { useState } from 'react'
import type { Vista, VistaType } from '@/lib/spaces/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
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

const MODE_LABEL: Record<string, string> = {
  coerente: 'Coerente',
  explorar: 'Explorar',
}

// ── VistaCard ─────────────────────────────────────────────────────────────────

interface VistaCardProps {
  vista:    Vista
  onEvolve?: (vista: Vista) => void
  onClick?:  (vista: Vista) => void
}

export function VistaCard({ vista, onEvolve, onClick }: VistaCardProps) {
  const [hovered, setHovered] = useState(false)
  const [btnHovered, setBtnHovered] = useState(false)

  const typeLabel = VISTA_TYPE_LABEL[vista.vista_type] ?? vista.vista_type
  const modeLabel = MODE_LABEL[vista.generation_mode] ?? vista.generation_mode
  const isCoerente = vista.generation_mode === 'coerente'

  return (
    <div
      onClick={() => onClick?.(vista)}
      style={{
        background: '#111111',
        border: `0.5px solid ${hovered ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: hovered
          ? 'inset 0 0.5px 0 rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.4)'
          : 'inset 0 0.5px 0 rgba(255,255,255,0.04)',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div style={{ aspectRatio: '16/10', position: 'relative', overflow: 'hidden' }}>
        {vista.output_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vista.output_url}
            alt={vista.vista_label ?? typeLabel}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          /* Pending / no output */
          <div style={{
            width: '100%', height: '100%',
            background: '#181818',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="9"/>
                <polyline points="12 7 12 12 15 15"/>
              </svg>
            </div>
          </div>
        )}

        {/* Vista type badge — top-left */}
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(10px)',
          border: '0.5px solid rgba(255,255,255,0.15)',
          color: '#fff',
          fontSize: 9, fontWeight: 500,
          letterSpacing: '0.14em', textTransform: 'uppercase' as const,
          padding: '3px 8px',
          borderRadius: 4,
        }}>
          {typeLabel}
        </div>

        {/* Mode badge — top-right */}
        <div style={{
          position: 'absolute', top: 10, right: 10,
          background: isCoerente ? 'rgba(48,180,108,0.18)' : 'rgba(99,102,241,0.18)',
          border: `0.5px solid ${isCoerente ? 'rgba(48,180,108,0.3)' : 'rgba(99,102,241,0.3)'}`,
          color: isCoerente ? '#30b46c' : '#818cf8',
          fontSize: 9, fontWeight: 500,
          letterSpacing: '0.14em', textTransform: 'uppercase' as const,
          padding: '3px 8px',
          borderRadius: 4,
        }}>
          {modeLabel}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{
          fontSize: 12.5, fontWeight: 500,
          color: '#fafafa',
          marginBottom: 8,
          letterSpacing: '-0.013em',
          lineHeight: 1.35,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}>
          {vista.vista_label ?? typeLabel}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{
            fontSize: 10.5, color: 'rgba(255,255,255,0.32)',
            letterSpacing: '-0.005em',
          }}>
            {formatRelativeTime(vista.created_at)}
          </span>

          <button
            onClick={e => { e.stopPropagation(); onEvolve?.(vista) }}
            onMouseEnter={() => setBtnHovered(true)}
            onMouseLeave={() => setBtnHovered(false)}
            style={{
              fontSize: 10.5, fontWeight: 500,
              color: btnHovered ? '#fafafa' : 'rgba(255,255,255,0.52)',
              background: btnHovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: 5,
              padding: '4px 9px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '-0.005em',
              transition: 'all 0.15s',
            }}
          >
            Evoluir
          </button>
        </div>
      </div>
    </div>
  )
}
