import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  APRESENTAR_TOOLS,
  APRESENTAR_TOOL_ORDER,
  type ApresentarTool,
  type ApresentarStatus,
} from '@/lib/apresentar/config'

export const metadata = {
  title: 'Apresentar — Spacenode',
}

const STATUS_TONE: Record<ApresentarStatus, { label: string; color: string; bg: string; border: string }> = {
  'novo':     { label: 'Novo',     color: '#30b46c',                  bg: 'rgba(48,180,108,0.14)',  border: 'rgba(48,180,108,0.28)' },
  'beta':     { label: 'Beta',     color: '#f5a524',                  bg: 'rgba(245,165,36,0.14)',  border: 'rgba(245,165,36,0.28)' },
  'em-breve': { label: 'Em breve', color: 'var(--color-text-tertiary)', bg: 'rgba(255,255,255,0.05)', border: 'var(--color-border-strong)' },
}

function ToolIcon({ id }: { id: ApresentarTool['id'] }) {
  if (id === 'humanized_plan') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="1.5"/>
        <path d="M3 11h7M14 11h7M10 3v8M10 15v6"/>
        <circle cx="16.5" cy="16.5" r="1.5"/>
      </svg>
    )
  }
  if (id === 'isometric') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z"/>
        <path d="M3 7l9 5 9-5M12 12v10"/>
      </svg>
    )
  }
  if (id === 'moodboard') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <circle cx="12" cy="6.5" r="1.6" fill="currentColor" stroke="none"/>
        <circle cx="17" cy="10" r="1.6" fill="currentColor" stroke="none"/>
        <circle cx="16" cy="15.5" r="1.6" fill="currentColor" stroke="none"/>
        <circle cx="8" cy="15.5" r="1.6" fill="currentColor" stroke="none"/>
        <circle cx="7" cy="10" r="1.6" fill="currentColor" stroke="none"/>
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="1.5"/>
      <rect x="6" y="6" width="6" height="5" rx="0.8"/>
      <rect x="14" y="6" width="4" height="5" rx="0.8"/>
      <path d="M6 14h12M6 17h8"/>
    </svg>
  )
}

export default async function ApresentarHubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const tools = APRESENTAR_TOOL_ORDER.map((id) => APRESENTAR_TOOLS[id])

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '52px 48px 80px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>

        {/* Hero */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <h1 style={{
              fontSize: 34, fontWeight: 500, color: 'var(--color-text-primary)',
              letterSpacing: '-0.04em', lineHeight: 1.15, margin: 0,
            }}>
              Apresentar
            </h1>
            <span style={{
              fontSize: 11, fontWeight: 500, color: '#30b46c',
              background: 'rgba(48,180,108,0.12)',
              padding: '4px 10px', borderRadius: 999,
              letterSpacing: '-0.01em', lineHeight: 1, flexShrink: 0,
            }}>
              Novo módulo
            </span>
          </div>
          <p style={{
            fontSize: 14, color: 'var(--color-text-tertiary)',
            letterSpacing: '-0.01em', lineHeight: 1.5, maxWidth: 580,
          }}>
            Transforme seus projetos em materiais visuais prontos para apresentar ao cliente —
            plantas humanizadas, isométricas premium e pranchas automáticas.
          </p>
        </section>

        {/* Cards */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </section>

        {/* Fidelity note */}
        <section style={{
          padding: '18px 22px',
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border-strong)',
          borderRadius: 12,
          display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: 'rgba(48,180,108,0.10)',
            color: '#30b46c',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L3 7l9 5 9-5-9-5z"/>
              <path d="M3 17l9 5 9-5M3 12l9 5 9-5"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em', marginBottom: 4,
            }}>
              Fidelidade ao projeto original
            </div>
            <div style={{
              fontSize: 12, color: 'var(--color-text-tertiary)',
              letterSpacing: '-0.005em', lineHeight: 1.5,
            }}>
              O Spacenode preserva paredes, aberturas, layout e proporções da sua planta ou modelo.
              A IA atua na humanização, materialidade, ambientação e apresentação — não inventa alterações estruturais.
            </div>
          </div>
        </section>

      </div>
    </main>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: ApresentarTool }) {
  const href      = `/app/apresentar/${tool.slug}`
  const statusTone = STATUS_TONE[tool.status]

  const body = (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      padding: '22px 22px 18px',
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border-strong)',
      borderRadius: 14,
      transition: 'border-color 180ms ease, transform 180ms ease',
      cursor: tool.available ? 'pointer' : 'default',
      opacity: tool.available ? 1 : 0.85,
    }}
      className="apresentar-card">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: 'rgba(255,255,255,0.04)',
          border: '0.5px solid var(--color-border-strong)',
          color: 'var(--color-text-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ToolIcon id={tool.id} />
        </div>
        <span style={{
          fontSize: 10, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          color: statusTone.color,
          background: statusTone.bg,
          border: `0.5px solid ${statusTone.border}`,
          padding: '4px 9px', borderRadius: 999,
          flexShrink: 0, lineHeight: 1,
        }}>
          {statusTone.label}
        </span>
      </div>

      {/* Title + desc */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.02em', marginBottom: 6,
        }}>
          {tool.name}
        </div>
        <div style={{
          fontSize: 12, color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.005em', lineHeight: 1.55,
        }}>
          {tool.shortDesc}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 18, paddingTop: 14,
        borderTop: '0.5px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
          {tool.nodes !== null ? (
            <><span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{tool.nodes}</span> nodes</>
          ) : (
            <span>sem custo definido</span>
          )}
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 500,
          color: tool.available ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
          letterSpacing: '-0.01em',
        }}>
          {tool.available ? 'Abrir ferramenta' : 'Saber mais'}
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h6M6 3l3 3-3 3"/>
          </svg>
        </span>
      </div>
    </div>
  )

  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      {body}
      <style>{`
        .apresentar-card:hover { border-color: var(--color-text-quaternary); transform: translateY(-1px); }
      `}</style>
    </Link>
  )
}
