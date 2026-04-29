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

export default async function AppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firstName = (user.user_metadata.full_name ?? user.email ?? 'usuário').split(' ')[0]

  const [profileResult, recentResult, countResult] = await Promise.all([
    supabase.from('profiles').select('credits').eq('id', user.id).single(),
    supabase.from('renders')
      .select('id, output_url, ambient, style, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase.from('renders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  const credits      = profileResult.data?.credits ?? 0
  const renders      = (recentResult.data ?? []) as RecentRender[]
  const totalRenders = countResult.count ?? 0

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '44px 40px 64px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 44 }}>

        {/* ── 1 · Hero ────────────────────────────────────────────────────────── */}
        <section style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', marginBottom: 6 }}>
              Olá, {firstName}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>
              O que vamos renderizar hoje?
            </p>
          </div>
          <Link
            href="/app/generate"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px',
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>

            <div style={{ padding: '18px 20px', background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
                Nodes disponíveis
              </div>
              <div style={{ fontSize: 30, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {credits}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>Nodes disponíveis</div>
            </div>

            <div style={{ padding: '18px 20px', background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
                Plano atual
              </div>
              <div style={{ fontSize: 30, fontWeight: 500, color: 'var(--color-accent-green)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                Beta
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>acesso antecipado</div>
            </div>

            <div style={{ padding: '18px 20px', background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
                Total de renders
              </div>
              <div style={{ fontSize: 30, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {totalRenders}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>gerados no total</div>
            </div>

          </div>
        </section>

        {/* ── 3 · Recent renders ──────────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '-0.01em' }}>
              Renders recentes
            </div>
            {totalRenders > 0 && (
              <Link href="/app/history" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textDecoration: 'none' }}>
                Ver todos →
              </Link>
            )}
          </div>

          {renders.length === 0 ? (
            <div style={{
              padding: '40px 20px', textAlign: 'center',
              background: 'var(--color-bg-elevated)',
              border: '0.5px dashed var(--color-border-strong)',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Nenhum render gerado ainda.</div>
              <Link href="/app/generate" style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: 'var(--color-accent-green)', textDecoration: 'none' }}>
                Criar primeiro render →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {renders.map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px',
                  background: 'var(--color-bg-elevated)',
                  border: '0.5px solid var(--color-border-strong)',
                  borderRadius: 10,
                }}>
                  <div style={{ width: 56, height: 38, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--color-surface)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.output_url} alt={r.ambient} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {r.ambient || r.style || 'Render'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      {formatDate(r.created_at)}
                    </div>
                  </div>
                  <Link href="/app/history" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textDecoration: 'none', flexShrink: 0 }}>
                    ver →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 4 · Tip ─────────────────────────────────────────────────────────── */}
        <section>
          <div style={{
            display: 'flex', gap: 14, alignItems: 'flex-start',
            padding: '18px 20px',
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'var(--color-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-accent-green)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 5 }}>
                Dica para melhores resultados
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.65 }}>
                Use imagens de SketchUp com iluminação neutra e sem sombras pesadas. Vega (Nano Banana Pro) preserva a geometria com alta fidelidade; Quasar (GPT Image 2) entrega mais realismo fotográfico.
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  )
}
