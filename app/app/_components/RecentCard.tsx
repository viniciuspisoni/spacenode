'use client'

// Card de "Recentes" do dashboard. Client component porque o "Ver detalhes"
// abre o painel lateral de detalhes da geração (o mesmo do Histórico) — antes
// o botão "Abrir" levava pra URL crua do CDN em nova aba, fora do site.

import { useState } from 'react'
import Link from 'next/link'
import { getRenderTitle } from '@/lib/render-display'
import { GenerationDetailDrawer } from '@/components/history/GenerationDetailDrawer'

export type RecentRender = {
  id: string
  output_url: string | null
  input_url: string | null
  ambient: string
  style: string
  lighting?: string | null
  model?: string | null
  cost_credits?: number | null
  status?: string | null
  created_at: string
}

function renderTool(r: RecentRender): 'Renderizar' | 'Ampliar' | 'Animar' {
  if (r.ambient === 'upscale') return 'Ampliar'
  if (r.ambient === 'video')   return 'Animar'
  return 'Renderizar'
}

function quality(nodes?: number | null): string | null {
  if (nodes === 4)  return 'HD'
  if (nodes === 8)  return '2K'
  if (nodes === 20) return '4K'
  return null
}

function buildFilename(r: RecentRender): string {
  const base = (r.ambient || r.style || 'render')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'render'
  const url = r.output_url ?? ''
  const ext = url.match(/\.(jpe?g|png|webp)(?:\?|$)/i)?.[1]?.toLowerCase() ?? 'jpg'
  return `spacenode-${base}.${ext}`
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

export function RecentCard({ render: r }: { render: RecentRender }) {
  const [detailOpen, setDetailOpen] = useState(false)

  const isVideo   = r.ambient === 'video'
  const isUpscale = r.ambient === 'upscale'
  const display   = isVideo ? (r.input_url ?? r.output_url) : (r.output_url ?? r.input_url)
  const tool      = renderTool(r)
  const q         = isUpscale || isVideo ? null : quality(r.cost_credits)
  const reusable  = !isVideo && !isUpscale && !!r.output_url
  const out       = r.output_url ?? ''

  return (
    <div className="spn-dash-recent-card">
      <div className="spn-dash-recent-thumb">
        {display && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={display} alt={getRenderTitle(r)} />
        )}
        <div className="spn-dash-recent-tags">
          <span className="spn-dash-recent-tag">{tool}</span>
          {q && <span className="spn-dash-recent-tag spn-dash-recent-tag--muted">{q}</span>}
        </div>
        {isVideo && (
          <div className="spn-dash-recent-play" aria-hidden>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 2 }}>
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
        )}
        {display && (
          <div className="spn-dash-recent-actions">
            <button
              type="button"
              className="spn-dash-recent-act spn-dash-recent-act--primary"
              style={{ font: 'inherit', cursor: 'pointer' }}
              onClick={() => setDetailOpen(true)}
            >
              Ver detalhes
            </button>
            {reusable && (
              <Link className="spn-dash-recent-act" href={`/app/generate?source=${encodeURIComponent(out)}`} title="Reutilizar">
                Reutilizar
              </Link>
            )}
            {reusable && (
              <Link className="spn-dash-recent-act" href={`/app/upscale?source=${encodeURIComponent(out)}`} title="Ampliar">
                Ampliar
              </Link>
            )}
            {r.output_url && (
              <a className="spn-dash-recent-act spn-dash-recent-act--icon" href={`/api/download?url=${encodeURIComponent(r.output_url)}&filename=${encodeURIComponent(buildFilename(r))}`} title="Baixar" aria-label="Baixar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
              </a>
            )}
          </div>
        )}
      </div>
      <div className="spn-dash-recent-meta">
        <div className="spn-dash-recent-title">{getRenderTitle(r)}</div>
        <div className="spn-dash-recent-date">{formatDate(r.created_at)}</div>
      </div>

      {detailOpen && (
        <GenerationDetailDrawer
          kind="render"
          id={r.id}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  )
}
