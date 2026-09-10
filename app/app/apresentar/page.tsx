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

// Status é ESTADO, não ação: vira um ponto colorido num chip neutro, e não um
// bloco de cor por cartão. Verde continua reservado a estado (ver o contrato
// em docs/VIDRO-NO-APP.md, §2.3).
const STATUS_TONE: Record<ApresentarStatus, { label: string; dot: string }> = {
  'novo':     { label: 'Novo',     dot: 'var(--color-accent-green)' },
  'beta':     { label: 'Beta',     dot: 'var(--color-warning)' },
  'em-breve': { label: 'Em breve', dot: 'var(--color-text-quaternary)' },
}

function ToolIcon({ id }: { id: ApresentarTool['id'] }) {
  if (id === 'humanized_plan') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="1.5"/>
        <path d="M3 11h7M14 11h7M10 3v8M10 15v6"/>
        <circle cx="16.5" cy="16.5" r="1.5"/>
      </svg>
    )
  }
  if (id === 'isometric') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z"/>
        <path d="M3 7l9 5 9-5M12 12v10"/>
      </svg>
    )
  }
  if (id === 'moodboard') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
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
    // Sem fundo chapado: quem pinta é o <Ambient/> do layout — sobre cor
    // chapada o vidro dos cartões viraria cinza.
    <main style={{ flex: 1, overflowY: 'auto', padding: '44px 40px 72px' }}>
      {/* Hover do cartão: o único jeito num server component, e local demais
          para virar classe global. */}
      <style>{`
        .apresentar-card { transition: transform 220ms var(--ease), box-shadow 220ms var(--ease); }
        .apresentar-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-float); }
      `}</style>

      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 30 }}>

        <section>
          <h1 style={{
            fontSize: 30, fontWeight: 500, color: 'var(--color-text-primary)',
            letterSpacing: '-0.04em', lineHeight: 1.15,
          }}>
            Apresentar
          </h1>
          <p style={{
            fontSize: 13.5, color: 'var(--color-text-tertiary)',
            letterSpacing: '-0.01em', lineHeight: 1.5, maxWidth: 560, marginTop: 8,
          }}>
            Do projeto ao material que vai para o cliente: plantas humanizadas, isométricas,
            moodboards e carrosséis prontos para postar.
          </p>
        </section>

        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
        }}>
          {tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
        </section>

        <section className="spn-glass" style={{
          borderRadius: 'var(--r-card)', padding: '16px 20px',
          display: 'flex', alignItems: 'flex-start', gap: 13,
        }}>
          <span style={{ color: 'var(--color-text-secondary)', flexShrink: 0, display: 'flex', marginTop: 1 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L3 7l9 5 9-5-9-5z"/>
              <path d="M3 17l9 5 9-5M3 12l9 5 9-5"/>
            </svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 560, color: 'var(--color-text-primary)' }}>
              Fidelidade ao projeto original
            </div>
            <p className="spn-hint" style={{ marginTop: 4 }}>
              Paredes, aberturas, layout e proporções são preservados. A IA atua na humanização,
              na materialidade e na apresentação — ela não inventa alterações estruturais.
            </p>
          </div>
        </section>

      </div>
    </main>
  )
}

// ── Cartão de ferramenta ────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: ApresentarTool }) {
  const tone = STATUS_TONE[tool.status]

  return (
    <Link
      href={`/app/apresentar/${tool.slug}`}
      className="apresentar-card spn-glass"
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        padding: '18px 18px 15px',
        borderRadius: 'var(--r-card)',
        textDecoration: 'none',
        opacity: tool.available ? 1 : 0.7,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 13 }}>
        <span className="spn-glass spn-glass--raised" style={{
          width: 38, height: 38, borderRadius: 'var(--r-inner)', flexShrink: 0,
          color: 'var(--color-text-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ToolIcon id={tool.id} />
        </span>
        <span className="spn-balance spn-glass spn-glass--raised" style={{ flexShrink: 0 }}>
          <span className="spn-balance-dot" style={{ background: tone.dot, boxShadow: 'none' }} />
          {tone.label}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 560, color: 'var(--color-text-primary)',
          letterSpacing: '-0.02em', marginBottom: 5,
        }}>
          {tool.name}
        </div>
        <p className="spn-hint" style={{ marginTop: 0 }}>{tool.shortDesc}</p>
      </div>

      <div style={{
        marginTop: 16, paddingTop: 12,
        borderTop: '0.5px solid var(--glass-line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {tool.nodes !== null
            ? <><span style={{ color: 'var(--color-text-secondary)', fontWeight: 560 }}>{tool.nodes}</span> nodes</>
            : 'sem custo definido'}
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 500, letterSpacing: '-0.01em',
          color: tool.available ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
        }}>
          {tool.available ? 'Abrir' : 'Saber mais'}
          <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke="currentColor"
               strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1l6 6-6 6"/>
          </svg>
        </span>
      </div>
    </Link>
  )
}
