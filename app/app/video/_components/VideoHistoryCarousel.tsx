'use client'

// Carrossel horizontal compacto que mostra os últimos vídeos do usuário.
// Aparece no rodapé do canvas, sem roubar atenção da criação.
// Cada card é hoverable, autoplay no hover, e clicável para reutilizar
// a configuração (modelo + duração + movimento).

import { useEffect, useState } from 'react'
import { getVideoModel } from '@/lib/video/models'
import { getCameraMotion } from '@/lib/video/cameraPresets'

export interface VideoHistoryItem {
  id:            string
  input_url:     string
  output_url:    string | null
  style:         string       // engineId
  lighting:      string       // '5s' / '8s'
  cost_credits:  number
  status:        string
  created_at:    string
}

interface Props {
  onReuse: (item: VideoHistoryItem) => void
}

export default function VideoHistoryCarousel({ onReuse }: Props) {
  const [items, setItems] = useState<VideoHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/video/history?limit=18')
      .then(r => r.ok ? r.json() : { videos: [] })
      .then((data: { videos?: VideoHistoryItem[] }) => {
        if (!cancelled) setItems(data.videos ?? [])
      })
      .catch(() => { /* silencioso — carrossel é opcional */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) return null
  if (items.length === 0) return null

  return (
    <div style={{
      borderTop:  '0.5px solid var(--color-border)',
      padding:    '14px 28px 16px',
      flexShrink: 0,
    }}>
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   10,
      }}>
        <div style={{
          fontSize:      10,
          fontWeight:    600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          color:         'var(--color-text-tertiary)',
        }}>
          Seus últimos vídeos
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
          Clique para reutilizar a configuração
        </div>
      </div>

      <div style={{
        display:        'flex',
        gap:            10,
        overflowX:      'auto',
        overflowY:      'hidden',
        paddingBottom:  4,
      }}>
        {items.map(item => (
          <HistoryCard
            key={item.id}
            item={item}
            hovered={hoveredId === item.id}
            onHover={() => setHoveredId(item.id)}
            onLeave={() => setHoveredId(prev => prev === item.id ? null : prev)}
            onClick={() => onReuse(item)}
          />
        ))}
      </div>
    </div>
  )
}

function HistoryCard({
  item, hovered, onHover, onLeave, onClick,
}: {
  item:    VideoHistoryItem
  hovered: boolean
  onHover: () => void
  onLeave: () => void
  onClick: () => void
}) {
  const model    = getVideoModel(item.style)
  const motionId = undefined // motion não está persistido hoje (legado)
  const motion   = motionId ? getCameraMotion(motionId) : undefined
  const failed   = item.status === 'failed' || !item.output_url

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{
        flexShrink:    0,
        width:         190,
        background:    'transparent',
        border:        'none',
        padding:       0,
        cursor:        'pointer',
        textAlign:     'left',
        display:       'flex',
        flexDirection: 'column',
        gap:           6,
      }}
    >
      <div style={{
        position:     'relative',
        width:        '100%',
        height:       106,
        borderRadius: 8,
        overflow:     'hidden',
        background:   'var(--color-preview-bg)',
        border:       `1px solid ${hovered ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
        transition:   'border-color 0.15s',
      }}>
        {item.output_url && !failed ? (
          <video
            src={item.output_url}
            muted
            loop
            playsInline
            preload="metadata"
            autoPlay={hovered}
            style={{
              width:  '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              filter: hovered ? 'none' : 'brightness(0.85)',
              transition: 'filter 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.currentTime = 0; e.currentTarget.play().catch(()=>{}) }}
            onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-tertiary)',
            fontSize: 10,
          }}>
            {failed ? 'Falhou' : 'Sem vídeo'}
          </div>
        )}
        <div style={{
          position: 'absolute', top: 6, right: 6,
          padding: '2px 6px', borderRadius: 4,
          background: 'var(--color-scrim)',
          color: 'rgba(255,255,255,0.85)',
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '0.04em',
          backdropFilter: 'blur(4px)',
        }}>
          {item.lighting}
        </div>
      </div>

      <div style={{
        fontSize:      11,
        color:         'var(--color-text-secondary)',
        letterSpacing: '-0.01em',
        whiteSpace:    'nowrap',
        overflow:      'hidden',
        textOverflow:  'ellipsis',
      }}>
        {model?.label ?? 'Animação'}
        {motion ? ` · ${motion.label}` : ''}
      </div>
      <div style={{
        fontSize:      10,
        color:         'var(--color-text-tertiary)',
        letterSpacing: '0.02em',
      }}>
        {item.cost_credits} nodes · {formatRelative(item.created_at)}
      </div>
    </button>
  )
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  const diffMs = Date.now() - t
  const m = Math.floor(diffMs / 60_000)
  if (m < 1)   return 'agora'
  if (m < 60)  return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24)  return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)   return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
