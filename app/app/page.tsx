import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getRenderTitle } from '@/lib/render-display'
import { getPlanById, type PlanId } from '@/lib/plans'

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

// Ferramenta que originou a render — vira o chip do card.
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
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '40px 40px 88px' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 38 }}>

        {/* ── 1 · Header ──────────────────────────────────────────────────────── */}
        <section style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <h1 style={{ fontSize: 34, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.04em', lineHeight: 1.1, margin: 0 }}>
                Olá, {firstName}
              </h1>
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--color-accent-green)',
                background: 'rgba(48,209,88,0.10)',
                border: '0.5px solid rgba(48,209,88,0.20)',
                padding: '3px 8px', borderRadius: 999,
                letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1, flexShrink: 0,
              }}>
                Beta
              </span>
            </div>
            <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', letterSpacing: '-0.015em', lineHeight: 1.5, maxWidth: 460 }}>
              Transforme seus projetos em imagens de apresentação.
            </p>
          </div>
          <Link href="/app/generate" className="spn-dash-cta">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Criar imagem
          </Link>
        </section>

        {/* ── 2 · Criar nova visualização ─────────────────────────────────────── */}
        <section>
          <SectionLabel>Criar nova visualização</SectionLabel>
          <div className="spn-dash-create-grid" style={{ marginTop: 14 }}>

            {/* Card primário — Renderizar */}
            <Link href="/app/generate" className="spn-dash-create-primary">
              <div className="spn-dash-create-primary-glow" />
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', gap: 18 }}>
                <div className="spn-dash-create-icon spn-dash-create-icon--accent">
                  <IconRender size={22} />
                </div>
                <div style={{ marginTop: 'auto' }}>
                  <div style={{ fontSize: 19, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', marginBottom: 6 }}>
                    Renderizar
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.55, maxWidth: 260 }}>
                    Envie um croqui, modelo 3D ou foto e gere uma imagem fotorrealista.
                  </div>
                </div>
                <div className="spn-dash-create-uploadhint">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/>
                  </svg>
                  Arraste uma imagem ou comece agora
                  <span className="spn-dash-create-arrow" aria-hidden>→</span>
                </div>
              </div>
            </Link>

            {/* Tiles secundários */}
            <CreateTile href="/app/spaces/new" title="Spaces" desc="Múltiplas vistas do mesmo projeto" Icon={IconSpaces} />
            <CreateTile href="/app/editar"     title="Editar"  desc="Ajustes e correções localizadas"   Icon={IconEdit} />
            <CreateTile href="/app/upscale"    title="Ampliar" desc="Aumente a resolução até 4K"          Icon={IconUpscale} />
            <CreateTile href="/app/video"      title="Animar"  desc="Transforme a imagem em vídeo"        Icon={IconVideo} />
          </div>
        </section>

        {/* ── 3 · Métricas ────────────────────────────────────────────────────── */}
        <section>
          <div className="spn-dash-metrics-grid">
            <StatCard
              label="Nodes disponíveis"
              value={String(availableNodes)}
              sub={lumenBalance > 0 ? `${planBalance} do plano · ${lumenBalance} avulsos` : 'para suas gerações'}
              tone={lowNodes ? 'low' : 'accent'}
            />
            <StatCard
              label="Imagens geradas"
              value={String(totalRenders)}
              sub="no total da sua conta"
            />
            <StatCard
              label="Este mês"
              value={String(monthRenders)}
              sub="criadas neste período"
            />
            <PlanCard
              planName={planName}
              isPaid={planTotal > 0}
              used={planUsed}
              total={planTotal}
              ratio={usageRatio}
            />
          </div>
        </section>

        {/* ── 4 · Imagens recentes ────────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <SectionLabel>Imagens recentes</SectionLabel>
            {totalRenders > renders.length && (
              <Link href="/app/history" style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textDecoration: 'none', letterSpacing: '-0.01em' }}>
                Ver todos →
              </Link>
            )}
          </div>

          {renders.length === 0 ? (
            <div style={{
              padding: '64px 24px', textAlign: 'center',
              background: 'var(--color-bg-elevated)',
              border: '0.5px dashed var(--color-border-strong)',
              borderRadius: 16,
            }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 12, letterSpacing: '-0.01em' }}>
                Nenhuma imagem criada ainda.
              </div>
              <Link href="/app/generate" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 10,
                background: 'var(--color-text-primary)', color: 'var(--color-bg)',
                fontSize: 13, fontWeight: 500, textDecoration: 'none', letterSpacing: '-0.01em',
              }}>
                Criar primeira imagem →
              </Link>
            </div>
          ) : (
            <div className="spn-dash-recent-grid">
              {renders.map(r => (
                <RecentCard key={r.id} render={r} />
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
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

        {/* chip ferramenta + qualidade */}
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

        {/* overlay de ações (revelado no hover via CSS) */}
        {display && (
          <div className="spn-dash-recent-actions">
            <a className="spn-dash-recent-act spn-dash-recent-act--primary" href={display} target="_blank" rel="noopener noreferrer">
              Abrir
            </a>
            {reusable && (
              <Link className="spn-dash-recent-act" href={`/app/generate?source=${encodeURIComponent(out)}`} title="Reutilizar em uma nova geração">
                Reutilizar
              </Link>
            )}
            {reusable && (
              <Link className="spn-dash-recent-act" href={`/app/upscale?source=${encodeURIComponent(out)}`} title="Ampliar a resolução">
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

function CreateTile({ href, title, desc, Icon }: {
  href: string; title: string; desc: string; Icon: (p: { size?: number }) => React.ReactElement
}) {
  return (
    <Link href={href} className="spn-dash-create-tile">
      <div className="spn-dash-create-icon">
        <Icon size={18} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: 3 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.45 }}>
          {desc}
        </div>
      </div>
    </Link>
  )
}

function StatCard({ label, value, sub, tone = 'default' }: {
  label: string; value: string; sub?: string; tone?: 'default' | 'accent' | 'low'
}) {
  const valueColor =
    tone === 'low'    ? '#e0584a'
    : tone === 'accent' ? 'var(--color-text-primary)'
    : 'var(--color-text-primary)'
  return (
    <div className="spn-dash-stat" style={{
      borderTop: tone === 'accent' ? '2px solid var(--color-accent-green)'
               : tone === 'low'    ? '2px solid rgba(224,88,74,0.55)'
               : undefined,
    }}>
      <div className="spn-dash-stat-label">{label}</div>
      <div className="spn-dash-stat-value" style={{ color: valueColor }}>{value}</div>
      {sub && <div className="spn-dash-stat-sub">{sub}</div>}
    </div>
  )
}

function PlanCard({ planName, isPaid, used, total, ratio }: {
  planName: string; isPaid: boolean; used: number; total: number; ratio: number
}) {
  return (
    <div className="spn-dash-stat">
      <div className="spn-dash-stat-label">Plano atual</div>
      <div className="spn-dash-stat-value">{planName}</div>
      {isPaid ? (
        <div style={{ marginTop: 10 }}>
          <div className="spn-dash-usage-track">
            <div className="spn-dash-usage-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span className="spn-dash-stat-sub" style={{ marginTop: 0 }}>{used} de {total} nodes</span>
            <Link href="/app/billing" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textDecoration: 'none' }}>
              Gerenciar →
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span className="spn-dash-stat-sub" style={{ marginTop: 0 }}>acesso antecipado</span>
          <Link href="/app/billing" style={{ fontSize: 11, color: 'var(--color-accent-green)', textDecoration: 'none', fontWeight: 500 }}>
            Ver planos →
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconRender({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  )
}
function IconSpaces({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>
    </svg>
  )
}
function IconEdit({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  )
}
function IconUpscale({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.88 5.47L19 10l-5.12 1.53L12 17l-1.88-5.47L5 10l5.12-1.53L12 3z"/>
      <path d="M5 3l.94 2.06L8 6l-2.06.94L5 9l-.94-2.06L2 6l2.06-.94L5 3z"/>
      <path d="M19 13l.94 2.06L22 16l-2.06.94L19 19l-.94-2.06L16 16l2.06-.94L19 13z"/>
    </svg>
  )
}
function IconVideo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  )
}
