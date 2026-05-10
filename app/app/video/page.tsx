import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function VideoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '52px 48px 80px' }}>
      <div style={{ maxWidth: 520, margin: '96px auto 0', textAlign: 'center' }}>
        <div style={{
          width: 60, height: 60, borderRadius: 14,
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border-strong)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-text-tertiary)',
          marginBottom: 28,
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7"/>
            <rect x="1" y="5" width="15" height="14" rx="2"/>
          </svg>
        </div>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 20,
          background: 'rgba(255,255,255,0.05)',
          border: '0.5px solid var(--color-border-strong)',
          fontSize: 10, fontWeight: 500, letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          color: 'var(--color-text-tertiary)',
          marginBottom: 18,
        }}>
          Em breve
        </div>

        <h1 style={{
          fontSize: 30, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.04em', marginBottom: 14, lineHeight: 1.15,
        }}>
          Animar está chegando
        </h1>

        <p style={{
          fontSize: 14, color: 'var(--color-text-tertiary)',
          lineHeight: 1.65, letterSpacing: '-0.005em',
          marginBottom: 36,
        }}>
          Estamos refinando a versão beta para entregar movimento de câmera
          cinematográfico com a mesma fidelidade dos seus renders. Avisaremos
          assim que estiver disponível.
        </p>

        <Link
          href="/app"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 18px',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-secondary)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 8, fontSize: 12.5, fontWeight: 400,
            textDecoration: 'none', letterSpacing: '-0.01em',
          }}
        >
          ← Voltar ao dashboard
        </Link>
      </div>
    </main>
  )
}
