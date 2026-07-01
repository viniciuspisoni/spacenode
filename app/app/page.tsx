import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getRenderTitle } from '@/lib/render-display'
import { getPlanById, type PlanId } from '@/lib/plans'
import {
  IconGenerate, IconSpaces, IconRetocar, IconEnhance,
  IconVideo, IconHumanizedPlan, IconHistory,
} from '@/components/app/sidebar-icons'

type RecentRender = {
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

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

const monthStart = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

const RECENT_LIMIT = 8

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

export default async function AppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firstName = (user.user_metadata.full_name ?? user.email ?? 'usuário').split(' ')[0]

  const [profileResult, balanceResult, recentResult, countResult, monthResult] = await Promise.all([
    supabase.from('profiles').select('plan').eq('id', user.id).single(),
    supabase.from('user_node_balance').select('plan_balance, lumen_balance').eq('user_id', user.id).single(),
    supabase.from('renders')
      .select('id, output_url, input_url, ambient, style, lighting, model, cost_credits, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
    supabase.from('renders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase.from('renders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart()),
  ])

  const planId       = (profileResult.data?.plan as PlanId | undefined) ?? 'free'
  const plan         = getPlanById(planId)
  const planName     = plan?.name ?? 'Beta'
  const planTotal    = plan?.nodes ?? 0
  const planBalance  = balanceResult.data?.plan_balance ?? 0
  const lumenBalance = balanceResult.data?.lumen_balance ?? 0
  const availableNodes = planBalance + lumenBalance

  const renders      = (recentResult.data ?? []) as RecentRender[]
  const totalRenders = countResult.count ?? 0
  const monthRenders = monthResult.count ?? 0

  const planUsed   = planTotal > 0 ? Math.max(0, planTotal - planBalance) : 0
  const usageRatio = planTotal > 0 ? Math.min(1, Math.max(0, planUsed / planTotal)) : 0
  const lowNodes   = availableNodes < 10

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '0 32px 88px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 36 }}>

        {/* ── 1 · Hero ──────────────────────────────────────────────────────── */}
        <div className="spn-dash-hero">
          <h1 className="spn-dash-hero-greeting">Olá, {firstName}</h1>
          <p className="spn-dash-hero-sub">
            Seu atelier de visualização arquitetônica.
          </p>
          <Link href="/app/generate" className="spn-dash-hero-cta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2.5"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Nova renderização
          </Link>
        </div>

        {/* ── 2 · Ferramentas ───────────────────────────────────────────────── */}
        <div className="spn-dash-tools">
          <ToolCard href="/app/generate"                     label="Renderizar" Icon={IconGenerate}     bg="var(--color-accent-green-bg)"   color="var(--color-accent-green)" />
          <ToolCard href="/app/spaces/new"                   label="Spaces"     Icon={IconSpaces}       bg="rgba(255,255,255,0.06)"          color="rgba(255,255,255,0.58)" />
          <ToolCard href="/app/editar"                       label="Editar"     Icon={IconRetocar}      bg="rgba(255,255,255,0.06)"          color="rgba(255,255,255,0.58)" />
          <ToolCard href="/app/upscale"                      label="Ampliar"    Icon={IconEnhance}      bg="rgba(255,255,255,0.06)"          color="rgba(255,255,255,0.58)" />
          <ToolCard href="/app/video"                        label="Animar"     Icon={IconVideo}        bg="rgba(255,255,255,0.06)"          color="rgba(255,255,255,0.58)" />
          <ToolCard href="/app/apresentar/planta-humanizada" label="Planta"     Icon={IconHumanizedPlan} bg="rgba(255,255,255,0.06)"          color="rgba(255,255,255,0.58)" />
          <ToolCard href="/app/history"                      label="Histórico"  Icon={IconHistory}      bg="rgba(255,255,255,0.04)"          color="rgba(255,255,255,0.30)" />
        </div>

        {/* ── 3 · Stats ─────────────────────────────────────────────────────── */}
        <div className="spn-dash-stats-row">
          <div className="spn-dash-stat" style={lowNodes ? { borderTop: `2px solid var(--color-error-border)` } : undefined}>
            <div className="spn-dash-stat-label">Nodes disponíveis</div>
            <div className="spn-dash-stat-value" style={lowNodes ? { color: 'var(--color-error)' } : undefined}>
              {availableNodes}
            </div>
            <div className="spn-dash-stat-sub">
              {lumenBalance > 0 ? `${planBalance} do plano · ${lumenBalance} avulsos` : 'para suas gerações'}
            </div>
          </div>

          <div className="spn-dash-stat">
            <div className="spn-dash-stat-label">Imagens geradas</div>
            <div className="spn-dash-stat-value">{totalRenders}</div>
            <div className="spn-dash-stat-sub">no total da conta</div>
          </div>

          <div className="spn-dash-stat">
            <div className="spn-dash-stat-label">Este mês</div>
            <div className="spn-dash-stat-value">{monthRenders}</div>
            <div className="spn-dash-stat-sub">criadas neste período</div>
          </div>

          <div className="spn-dash-stat">
            <div className="spn-dash-stat-label">Plano atual</div>
            <div className="spn-dash-stat-value" style={{ fontSize: 20, letterSpacing: '-0.02em', paddingTop: 3 }}>
              {planName}
            </div>
            {planTotal > 0 ? (
              <>
                <div className="spn-dash-usage-track">
                  <div className="spn-dash-usage-fill" style={{ width: `${Math.round(usageRatio * 100)}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span className="spn-dash-stat-sub" style={{ marginTop: 0 }}>{planUsed}/{planTotal} nodes</span>
                  <Link href="/app/billing" style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textDecoration: 'none', letterSpacing: '-0.01em' }}>
                    Gerenciar →
                  </Link>
                </div>
              </>
            ) : (
              <div style={{ marginTop: 6 }}>
                <Link href="/app/billing" style={{ fontSize: 11, color: 'var(--color-accent-green)', textDecoration: 'none', fontWeight: 500, letterSpacing: '-0.01em' }}>
                  Ver planos →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── 4 · Imagens recentes ──────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Recentes
            </div>
            {totalRenders > renders.length && (
              <Link href="/app/history" style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textDecoration: 'none', letterSpacing: '-0.01em' }}>
                Ver todos →
              </Link>
            )}
          </div>

          {renders.length === 0 ? (
            <div style={{
              padding: '72px 24px', textAlign: 'center',
              background: 'var(--color-bg-elevated)',
              border: '0.5px dashed var(--color-border-strong)',
              borderRadius: 'var(--radius-xl)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8, letterSpacing: '-0.015em' }}>
                Nenhuma renderização ainda.
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 24, letterSpacing: '-0.005em' }}>
                Envie uma referência e gere a primeira visualização do seu projeto.
              </div>
              <Link href="/app/generate" className="spn-btn-primary" style={{ borderRadius: 'var(--radius-full)' }}>
                Começar com uma renderização
              </Link>
            </div>
          ) : (
            <div className="spn-dash-recent-grid">
              {renders.map(r => <RecentCard key={r.id} render={r} />)}
            </div>
          )}
        </section>

      </div>
    </main>
  )
}

// ── Tool card ──────────────────────────────────────────────────────────────────

function ToolCard({ href, label, Icon, bg, color }: {
  href: string
  label: string
  Icon: (p: { size?: number }) => React.ReactElement
  bg: string
  color: string
}) {
  return (
    <Link href={href} className="spn-dash-tool">
      <div className="spn-dash-tool-icon" style={{ background: bg, color }}>
        <Icon size={24} />
      </div>
      <span className="spn-dash-tool-label">{label}</span>
    </Link>
  )
}

// ── Recent card ────────────────────────────────────────────────────────────────

function RecentCard({ render: r }: { render: RecentRender }) {
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
            <a className="spn-dash-recent-act spn-dash-recent-act--primary" href={display} target="_blank" rel="noopener noreferrer">
              Abrir
            </a>
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
    </div>
  )
}
