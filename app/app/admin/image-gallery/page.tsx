'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface GalleryItem {
  id: string
  type: 'render' | 'vista'
  image_url: string | null
  input_url?: string | null
  provider: string
  model: string
  latency: number | null
  created_at: string
  nodes?: number
  status?: string
}

export default function ImageGalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'render' | 'vista'>('all')
  const [statusFilter, setStatusFilter] = useState<'completed' | 'failed' | 'all'>('completed')
  const [daysFilter, setDaysFilter] = useState<number>(30)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        setLoading(true)
        const res = await fetch(
          `/api/admin/image-gallery?type=${filter}&status=${statusFilter}&days=${daysFilter}&limit=500`
        )
        if (!res.ok) {
          if (res.status === 403) {
            setError('Acesso restrito. Apenas administradores podem ver esta página.')
          } else {
            setError('Erro ao buscar galeria')
          }
          return
        }
        const data = await res.json()
        setItems(data.items || [])
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }
    fetchGallery()
  }, [filter, statusFilter, daysFilter])

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const providerBg = (provider: string) => {
    if (provider.includes('gcp') || provider.includes('gemini')) return '#d4edda'
    if (provider.includes('fal')) return '#cfe2ff'
    return '#e7e7e7'
  }

  const providerColor = (provider: string) => {
    if (provider.includes('gcp') || provider.includes('gemini')) return '#155724'
    if (provider.includes('fal')) return '#004085'
    return '#383d41'
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h1>Erro</h1>
        <p style={{ color: 'red' }}>{error}</p>
        <Link href="/app" style={{ color: 'blue', textDecoration: 'underline' }}>
          ← Voltar
        </Link>
      </div>
    )
  }

  return (
    <div style={{ padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', maxWidth: 1400 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: 28 }}>Galeria de Imagens</h1>
          <p style={{ margin: 0, color: '#666', fontSize: 13 }}>
            Renderizar + Spaces — Últimas gerações com GCP/FAL
          </p>
        </div>
        <Link
          href="/app"
          style={{
            padding: '8px 16px',
            background: '#f0f0f0',
            border: '1px solid #ccc',
            borderRadius: 6,
            textDecoration: 'none',
            color: '#333',
            fontSize: 13,
          }}
        >
          ← Voltar
        </Link>
      </div>

      <div style={{ marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['all', 'render', 'vista'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '8px 14px',
                border: '1px solid #ccc',
                borderRadius: 6,
                background: filter === f ? '#333' : '#f0f0f0',
                color: filter === f ? '#fff' : '#333',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {f === 'all' ? 'Todas' : f === 'render' ? 'Renderizar' : 'Spaces'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {(['completed', 'failed', 'all'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '8px 14px',
                border: '1px solid #ccc',
                borderRadius: 6,
                background: statusFilter === s ? '#0066cc' : '#f0f0f0',
                color: statusFilter === s ? '#fff' : '#333',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {s === 'completed' ? '✓ Sucesso' : s === 'failed' ? '✗ Falhas' : 'Todos'}
            </button>
          ))}
        </div>

        <select
          value={daysFilter}
          onChange={e => setDaysFilter(Number(e.target.value))}
          style={{
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: 6,
            background: '#f0f0f0',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={365}>Todos (1 ano)</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          Carregando galeria…
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          Nenhuma imagem encontrada
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16, fontSize: 12, color: '#666' }}>
            {items.length} imagem{items.length !== 1 ? 's' : ''} encontrada{items.length !== 1 ? 's' : ''}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 14,
            }}
          >
            {items.map(item => (
              <a
                key={item.id}
                href={item.image_url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: '#fff',
                  border: '1px solid #e0e0e0',
                  borderRadius: 8,
                  overflow: 'hidden',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'block',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  cursor: item.image_url ? 'pointer' : 'default',
                }}
                onMouseEnter={e => {
                  if (item.image_url) {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)'
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {/* Image */}
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '4/3',
                    background: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.type}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <span style={{ color: '#ccc' }}>Sem imagem</span>
                  )}
                  {/* Badge de tipo */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      background: item.type === 'render' ? '#007bff' : '#28a745',
                      color: '#fff',
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {item.type === 'render' ? 'Renderizar' : 'Spaces'}
                  </div>

                  {/* Badge de status */}
                  {item.status && item.status !== 'completed' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        background: item.status === 'failed' ? '#dc3545' : '#ffc107',
                        color: item.status === 'failed' ? '#fff' : '#000',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      {item.status === 'failed' ? '✗ Erro' : '⏳ Processando'}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: 12 }}>
                  {/* Provider badge */}
                  <div style={{ marginBottom: 8 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        background: providerBg(item.provider),
                        color: providerColor(item.provider),
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.3,
                      }}
                    >
                      {item.provider.includes('gcp') || item.provider.includes('gemini')
                        ? '🔵 GCP'
                        : item.provider.includes('fal')
                          ? '🟦 FAL'
                          : item.provider}
                    </span>
                  </div>

                  {/* Model */}
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#333', wordBreak: 'break-word' }}>
                    {item.model.split('/').pop() || item.model}
                  </div>

                  {/* Meta */}
                  <div style={{ fontSize: 11, color: '#999', lineHeight: 1.6 }}>
                    <div>{formatDate(item.created_at)}</div>
                    {item.latency && <div>{item.latency}ms</div>}
                    {item.nodes !== undefined && item.nodes > 0 && <div>{item.nodes} nodes</div>}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
