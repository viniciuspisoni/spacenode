import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

type RecentRender = {
  id: string
  output_url: string
  ambient: string
  style: string
  created_at: string
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

const monthStart = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

export default async function AppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firstName = (user.user_metadata.full_name ?? user.email ?? 'usuário').split(' ')[0]

  const [profileResult, recentResult, countResult, monthResult] = await Promise.all([
    supabase.from('profiles').select('credits').eq('id', user.id).single(),
    supabase.from('renders')
      .select('id, output_url, ambient, style, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase.from('renders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase.from('renders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart()),
  ])

  const credits      = profileResult.data?.credits ?? 0
  const renders      = (recentResult.data ?? []) as RecentRender[]
  const totalRenders = countResult.count ?? 0
  const monthRenders = monthResult.count ?? 0

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '44px 40px 64px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>

        {/* ── 1 · Hero ────────────────────────────────────────────────────────── */}
        <section style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', marginBottom: 6, lineHeight: 1.2 }}>
              Olá, {firstName}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', letterSpacing: '-0.01em' }}>
              O que vamos renderizar hoje?
            </p>
          </div>
          <Link
            href="/app/generate"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 20px',
              background: 'var(--color-text-primary)',
              color: 'var(--color-bg)',
              borderRadius: 10, fontSize: 13, fontWeight: 500,
              textDecoration: 'none', letterSpacing: '-0.01em', flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Novo Render
          </Link>
        </section>

        {/* ── 2 · Stats ───────────────────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>

            <StatCard
              label="Nodes disponíveis"
              value={String(credits)}
              sub="para suas gerações"
              accent={credits < 4}
            />
            <StatCard
              label="Renders totais"
              value={String(totalRenders)}
              sub="gerados na plataforma"
            />
            <StatCard
              label="Este mês"
              value={String(monthRenders)}
              sub="renders no período"
            />
            <StatCard
              label="Plano atual"
              value="Beta"
              sub="acesso antecipado"
              green
            />

          </div>
        </section>

        {/* ── 3 · Quick actions ───────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Ações rápidas</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <QuickAction href="/app/generate" primary>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Novo Render
            </QuickAction>
            <QuickAction href="/app/history">Histórico</QuickAction>
            <QuickAction href="/app/billing">Comprar Nodes</QuickAction>
            <QuickAction href="/app/plans">Planos</QuickAction>
          </div>
        </section>

        {/* ── 4 · Recent renders ──────────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <SectionLabel>Renders recentes</SectionLabel>
            {totalRenders > 4 && (
              <Link href="/app/history" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textDecoration: 'none' }}>
                Ver todos →
              </Link>
            )}
          </div>

          {renders.length === 0 ? (
            <div style={{
              padding: '48px 20px', textAlign: 'center',
              background: 'var(--color-bg-elevated)',
              border: '0.5px dashed var(--color-border-strong)',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>Nenhum render gerado ainda.</div>
              <Link href="/app/generate" style={{ display: 'inline-block', fontSize: 12, color: 'var(--color-accent-green)', textDecoration: 'none' }}>
                Criar primeiro render →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {renders.map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px',
                  background: 'var(--color-bg-elevated)',
                  border: '0.5px solid var(--color-border-strong)',
                  borderRadius: 10,
                  transition: 'border-color 0.15s',
                }}>
                  <div style={{ width: 64, height: 44, borderRadius: 7, overflow: 'hidden', flexShrink: 0, background: 'var(--color-surface)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.output_url} alt={r.ambient} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, letterSpacing: '-0.01em' }}>
                      {r.ambient || r.style || 'Render'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
                      {formatDate(r.created_at)}
                    </div>
                  </div>
                  <Link href="/app/history" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textDecoration: 'none', flexShrink: 0, padding: '4px 8px', border: '0.5px solid var(--color-border-strong)', borderRadius: 6 }}>
                    ver →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 5 · Insight card ────────────────────────────────────────────────── */}
        <section>
          <div style={{
            display: 'flex', gap: 16, alignItems: 'flex-start',
            padding: '20px 22px',
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 12,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: 'rgba(48,180,108,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-accent-green)',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 6, letterSpacing: '-0.01em' }}>
                Dica para melhores resultados
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.7 }}>
                Use imagens de SketchUp com iluminação neutra e sem sombras pesadas. <strong style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>Vega</strong> preserva a geometria com alta fidelidade; <strong style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>Quasar</strong> entrega mais realismo fotográfico.
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '-0.005em' }}>
      {children}
    </div>
  )
}

function StatCard({ label, value, sub, accent = false, green = false }: {
  label: string; value: string; sub: string; accent?: boolean; green?: boolean
}) {
  return (
    <div style={{
      padding: '18px 20px',
      background: 'var(--color-bg-elevated)',
      border: `0.5px solid ${accent ? 'rgba(192,57,43,0.25)' : 'var(--color-border-strong)'}`,
      borderRadius: 12,
    }}>
      <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 500, color: green ? 'var(--color-accent-green)' : accent ? '#c0392b' : 'var(--color-text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function QuickAction({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px',
        background: primary ? 'var(--color-text-primary)' : 'var(--color-bg-elevated)',
        color: primary ? 'var(--color-bg)' : 'var(--color-text-secondary)',
        border: primary ? 'none' : '0.5px solid var(--color-border-strong)',
        borderRadius: 8, fontSize: 12, fontWeight: primary ? 500 : 400,
        textDecoration: 'none', letterSpacing: '-0.01em',
      }}
    >
      {children}
    </Link>
  )
}
