'use client'

import Link from 'next/link'
import type { Vista } from '@/lib/spaces/types'
import { findAxisOption } from '@/lib/spaces/axes'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1)  return 'agora'
  if (min < 60) return `${min}min`
  const hr = Math.floor(min / 60)
  if (hr < 24)  return `${hr}h`
  const d = Math.floor(hr / 24)
  return `${d}d`
}

export function VistaCard({ vista }: { vista: Vista }) {
  const opt = vista.axis && vista.axis_value ? findAxisOption(vista.axis, vista.axis_value) : null
  const isProcessing = vista.status === 'processing' || vista.status === 'pending'
  const isFailed     = vista.status === 'failed'

  return (
    <Link
      href={`/app/spaces/${vista.space_id}/vistas/${vista.id}`}
      style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg-elevated)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 12, overflow: 'hidden',
        textDecoration: 'none', color: 'inherit',
        transition: 'border-color 0.2s, transform 0.2s',
        position: 'relative',
      }}
    >
      {/* Image */}
      <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface)', position: 'relative' }}>
        {vista.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vista.image_url} alt={vista.axis_label ?? ''}
               style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-quaternary)', fontSize: 11,
          }}>
            {isProcessing ? 'Gerando…' : isFailed ? 'Falhou' : '—'}
          </div>
        )}

        {/* Color badge (axis) */}
        {opt && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 5,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: opt.color }} />
            <span style={{ fontSize: 10, color: '#fff', letterSpacing: '0.02em' }}>
              {opt.label}
            </span>
          </div>
        )}

        {vista.is_favorited && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            width: 24, height: 24, borderRadius: 999,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFD25E',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.39 7.34H22l-6.18 4.49 2.39 7.34L12 16.69 5.79 21.17l2.39-7.34L2 9.34h7.61z"/></svg>
          </div>
        )}

        {vista.dna_verified === false && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 7px', borderRadius: 4,
            background: 'rgba(186,117,23,0.85)', color: '#fff',
            fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            DNA divergente
          </div>
        )}

        {(vista.is_edited || vista.dna) && (
          <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 4 }}>
            {/* Multi-DNA: vista com DNA próprio extraído (referência selecionável) */}
            {vista.dna && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 7px', borderRadius: 4,
                background: 'rgba(29,158,117,0.85)', color: '#fff',
                fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                ◈ referência
              </div>
            )}
            {vista.is_edited && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 7px', borderRadius: 4,
                background: 'rgba(70,209,145,0.85)', color: '#042818',
                fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                ✎ editada
              </div>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {vista.axis_label ?? 'Vista'}
        </div>
        <div style={{
          fontSize: 10, color: 'var(--color-text-quaternary)',
          letterSpacing: '0.02em', flexShrink: 0,
        }}>
          {timeAgo(vista.created_at)} · {vista.quality.toUpperCase()}
        </div>
      </div>
    </Link>
  )
}
