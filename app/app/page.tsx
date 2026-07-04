import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signRows } from '@/lib/storage/signed'
import { getRenderTitle } from '@/lib/render-display'
import { getPlanById, type PlanId } from '@/lib/plans'
import {
  IconGenerate, IconSpaces, IconRetocar, IconEnhance,
  IconVideo, IconFinalizar, IconHumanizedPlan, IconIsometric, IconBoard, IconMoodboard,
} from '@/components/app/sidebar-icons'
import { getEnabledModules, type SidebarModule } from '@/lib/nav/modules-config'

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

type RecentSpace = {
  id: string
  name: string
  category: string
  vista_mestre_url: string | null
  vista_count: number
  updated_at: string
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

const monthStart = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

const RECENT_LIMIT = 8
const PROJECT_LIMIT = 3

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

const CATEGORY_LABEL: Record<string, string> = {
  residencial: 'Residencial',
  comercial:   'Comercial',
  conceito:    'Conceito',
}

// Módulos do atelier. Verde funcional só no Renderizar (CTA de geração);
// os demais ficam neutros para não virar rainbow palette.
// Lista de módulos vem de lib/nav/modules-config — a mesma fonte que a sidebar,
// então desativar um módulo lá some com ele daqui também.
const MODULE_ICON: Record<SidebarModule['iconKey'], (p: { size?: number }) => React.ReactElement> = {
  generate:      IconGenerate,
  spaces:        IconSpaces,
  retocar:       IconRetocar,
  enhance:       IconEnhance,
  video:         IconVideo,
  finalizar:     IconFinalizar,
  humanizedPlan: IconHumanizedPlan,
  isometric:     IconIsometric,
  board:         IconBoard,
  moodboard:     IconMoodboard,
}

const MODULE_DESC: Record<string, string> = {
  renderizar:        'Imagem fotorrealista a partir da sua referência.',
  spaces:            'Novas vistas mantendo o DNA do projeto.',
  editar:            'Ajuste áreas específicas sem perder a geometria.',
  ampliar:           'Aumente resolução e acabamento.',
  animar:            'Vídeos de apresentação do projeto.',
  finalizar:         'Camadas, ajustes finais e exportação.',
  planta_humanizada: 'Humanize plantas com materiais reais.',
  isometricas:       'Vistas isométricas premium do projeto.',
  prancha_ia:        'Monte carrosséis e pranchas automaticamente.',
  moodboard:         'Atmosfera, paleta e referências em um só lugar.',
}

const MODULES: {
  href: string
  label: string
  desc: string
  Icon: (p: { size?: number }) => React.ReactElement
  green?: boolean
}[] = getEnabledModules('criar').map((m) => ({
  href: m.href,
  label: m.label,
  desc: MODULE_DESC[m.id] ?? '',
  Icon: MODULE_ICON[m.iconKey],
  green: m.id === 'renderizar',
}))

export default async function AppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firstName = (user.user_metadata.full_name ?? user.email ?? 'usuário').split(' ')[0]

  const [profileResult, balanceResult, recentResult, countResult, monthResult, spacesResult] = await Promise.all([
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
    supabase.from('spaces_with_counts')
      .select('id, name, category, vista_mestre_url, vista_count, updated_at', { count: 'exact' })
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(PROJECT_LIMIT),
  ])

  const planId       = (profileResult.data?.plan as PlanId | undefined) ?? 'free'
  const plan         = getPlanById(planId)
  const planName     = plan?.name ?? 'Beta'
  const planTotal    = plan?.nodes ?? 0
  const planBalance  = balanceResult.data?.plan_balance ?? 0
  const lumenBalance = balanceResult.data?.lumen_balance ?? 0
  const availableNodes = planBalance + lumenBalance

  // Assina URLs de Storage (space-mestres) antes de passar pro client (bucket
  // privado após o flip). Renders são FAL hoje → no-op, mas embrulhamos igual.
  const admin        = createAdminClient()
  const renders      = (await signRows(admin, recentResult.data ?? [], ['output_url', 'input_url'])) as RecentRender[]
  const totalRenders = countResult.count ?? 0
  const monthRenders = monthResult.count ?? 0
  const spaces       = (await signRows(admin, spacesResult.data ?? [], ['vista_mestre_url'])) as RecentSpace[]
  const totalSpaces  = spacesResult.count ?? spaces.length

  const planUsed   = planTotal > 0 ? Math.max(0, planTotal - planBalance) : 0
  const usageRatio = planTotal > 0 ? Math.min(1, Math.max(0, planUsed / planTotal)) : 0
  const lowNodes   = availableNodes < 10

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '0 32px 88px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 34 }}>

        {/* ── 1 · Topo: saudação + CTA principal ───────────────────────────── */}
        <header className="spn-dash-head">
          <div>
            <h1 className="spn-dash-head-greeting">Olá, {firstName}</h1>
            <p className="spn-dash-head-sub">Seu atelier de visualização arquitetônica.</p>
          </div>
          <div className="spn-dash-head-actions">
            <Link href="/app/spaces/new" className="spn-dash-cta">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Novo projeto
            </Link>
          </div>
        </header>

        {/* ── 2 · Projetos: continuidade ou primeiro passo ──────────────────── */}
        {spaces.length === 0 ? (
          <StartBlock />
        ) : (
          <section>
            <div className="spn-dash-section-head">
              <div className="spn-dash-section-label">Continuar de onde parou</div>
              <Link href="/app/spaces" className="spn-dash-section-link">Todos os projetos →</Link>
            </div>
            <div className="spn-dash-projects">
              {spaces.map(s => <ProjectCard key={s.id} space={s} />)}
              <Link href="/app/spaces/new" className="spn-dash-project-new">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span>Novo projeto</span>
              </Link>
            </div>
          </section>
        )}

        {/* ── 3 · Métricas discretas ────────────────────────────────────────── */}
        <div className="spn-dash-stats-row">
          <div className="spn-dash-stat" style={lowNodes ? { boxShadow: 'inset 0 2px 0 var(--color-error-border)' } : undefined}>
            <div className="spn-dash-stat-label">Nodes disponíveis</div>
            <div className="spn-dash-stat-value" style={lowNodes ? { color: 'var(--color-error)' } : undefined}>
              {availableNodes}
            </div>
            <div className="spn-dash-stat-sub">
              {lumenBalance > 0 ? `${planBalance} do plano · ${lumenBalance} avulsos` : 'para suas gerações'}
            </div>
          </div>

          <div className="spn-dash-stat">
            <div className="spn-dash-stat-label">Projetos ativos</div>
            <div className="spn-dash-stat-value">{totalSpaces}</div>
            <div className="spn-dash-stat-sub">no seu atelier</div>
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

          <div className="spn-dash-stat spn-dash-stat--plan">
            <div className="spn-dash-stat-label">Plano atual</div>
            <div className="spn-dash-stat-value" style={{ fontSize: 18, letterSpacing: '-0.02em', paddingTop: 3 }}>
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

        {/* ── 4 · Módulos do atelier ────────────────────────────────────────── */}
        <section>
          <div className="spn-dash-section-head">
            <div className="spn-dash-section-label">Ferramentas</div>
          </div>
          <div className="spn-dash-modules">
            {MODULES.map(m => (
              <Link key={m.href} href={m.href} className="spn-dash-module">
                <div
                  className="spn-dash-module-icon"
                  style={m.green
                    ? { background: 'var(--color-accent-green-bg)', color: 'var(--color-accent-green)' }
                    : { background: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
                >
                  <m.Icon size={19} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="spn-dash-module-name">{m.label}</div>
                  <div className="spn-dash-module-desc">{m.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 5 · Imagens recentes ──────────────────────────────────────────── */}
        <section>
          <div className="spn-dash-section-head">
            <div className="spn-dash-section-label">Recentes</div>
            {totalRenders > 0 && (
              <Link href="/app/history" className="spn-dash-section-link">
                {totalRenders > renders.length ? 'Ver todas →' : 'Histórico →'}
              </Link>
            )}
          </div>

          {renders.length === 0 ? (
            <div className="spn-dash-recent-empty">
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '-0.01em' }}>
                  Nenhuma imagem gerada ainda.
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4, letterSpacing: '-0.005em' }}>
                  Crie um projeto ou envie uma referência para gerar a primeira visualização.
                </div>
              </div>
              <Link href="/app/generate" className="spn-btn-ghost" style={{ flexShrink: 0, borderRadius: 'var(--radius-full)' }}>
                Criar primeira visualização
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

// ── Empty state de projetos — primeiro passo do atelier ───────────────────────

function StartBlock() {
  return (
    <section className="spn-dash-start">
      <h2 className="spn-dash-start-title">Comece seu primeiro projeto</h2>
      <p className="spn-dash-start-sub">
        Envie um print, modelo, planta ou referência para gerar a primeira visualização.
      </p>
      <div className="spn-dash-start-actions">
        <Link href="/app/spaces/new" className="spn-dash-cta">Criar novo projeto</Link>
        <Link href="/app/generate" className="spn-btn-ghost" style={{ borderRadius: 'var(--radius-full)' }}>
          Renderizar imagem avulsa
        </Link>
      </div>
      <div className="spn-dash-steps">
        <div className="spn-dash-step">
          <div className="spn-dash-step-num">01</div>
          <div className="spn-dash-step-title">Envie a referência</div>
          <div className="spn-dash-step-desc">Print, modelo 3D, planta ou foto do espaço.</div>
        </div>
        <div className="spn-dash-step">
          <div className="spn-dash-step-num">02</div>
          <div className="spn-dash-step-title">Escolha o tipo de visualização</div>
          <div className="spn-dash-step-desc">Ambiente, estilo e enquadramento sob seu controle.</div>
        </div>
        <div className="spn-dash-step">
          <div className="spn-dash-step-num">03</div>
          <div className="spn-dash-step-title">Gere variações coerentes</div>
          <div className="spn-dash-step-desc">Toda vista preserva o DNA do projeto.</div>
        </div>
      </div>
    </section>
  )
}

// ── Project card ───────────────────────────────────────────────────────────────

function ProjectCard({ space: s }: { space: RecentSpace }) {
  const vistas = s.vista_count
  return (
    <Link href={`/app/spaces/${s.id}`} className="spn-dash-project">
      <div className="spn-dash-project-thumb">
        {s.vista_mestre_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.vista_mestre_url} alt={s.name} />
        ) : (
          <div className="spn-dash-project-thumb-empty" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2.5"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
        )}
        <div className="spn-dash-project-open" aria-hidden>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="7" y1="17" x2="17" y2="7"/>
            <polyline points="7 7 17 7 17 17"/>
          </svg>
        </div>
      </div>
      <div className="spn-dash-project-body">
        <div className="spn-dash-project-name">{s.name}</div>
        <div className="spn-dash-project-meta">
          <span>{CATEGORY_LABEL[s.category] ?? s.category}</span>
          <span aria-hidden style={{ opacity: 0.5 }}>·</span>
          <span>{vistas} {vistas === 1 ? 'vista' : 'vistas'}</span>
          <span aria-hidden style={{ opacity: 0.5 }}>·</span>
          <span>atualizado {formatDate(s.updated_at)}</span>
        </div>
      </div>
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
