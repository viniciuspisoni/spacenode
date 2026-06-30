// /app/spaces — listagem dos Spaces do usuário.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SpaceCard } from '@/components/spaces/SpaceCard'
import type { SpaceWithCounts } from '@/lib/spaces/types'

export default async function SpacesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await supabase
    .from('spaces_with_counts')
    .select('*')
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })

  const spaces = (rows ?? []) as SpaceWithCounts[]

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '40px 48px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontSize: 12, color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.005em', marginBottom: 36,
        }}>
          <span>Workspace</span>
          <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>Spaces</span>
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          marginBottom: 32, gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h1 style={{
              fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)',
              letterSpacing: '-0.03em', lineHeight: 1.1,
            }}>
              Seus Spaces
            </h1>
            <p style={{
              fontSize: 13, color: 'var(--color-text-tertiary)',
              lineHeight: 1.6, maxWidth: 540, letterSpacing: '-0.005em',
            }}>
              Cada projeto, um Space. A Vista Mestre define o DNA visual e toda
              variação nasce com a memória do projeto preservada.
            </p>
          </div>

          <Link href="/app/spaces/new" className="spn-btn-primary" style={{ flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Novo Space
          </Link>
        </div>

        {/* Grid / empty */}
        {spaces.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{
            display: 'grid', gap: 16,
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          }}>
            {spaces.map(s => <SpaceCard key={s.id} space={s} />)}
          </div>
        )}

      </div>
    </main>
  )
}

function EmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
      background: 'var(--color-bg-elevated)',
      border: '0.5px dashed var(--color-border-strong)',
      borderRadius: 14,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: 'var(--color-accent-green-bg)',
        border: '0.5px solid var(--color-accent-green-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, color: 'var(--color-accent-green)',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>
        </svg>
      </div>
      <div style={{
        fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)',
        marginBottom: 10, letterSpacing: '-0.02em',
      }}>
        Nenhum Space ainda
      </div>
      <div style={{
        fontSize: 13, color: 'var(--color-text-tertiary)',
        lineHeight: 1.6, marginBottom: 26, maxWidth: 360,
      }}>
        Crie o primeiro Space, envie a Vista Mestre e o DNA do projeto fica travado.
        Toda variação preserva esse DNA.
      </div>
      <Link
        href="/app/spaces/new"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '11px 22px',
          background: 'var(--color-text-primary)', color: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500,
          letterSpacing: '-0.005em', textDecoration: 'none',
        }}
      >
        Criar primeiro Space
      </Link>
    </div>
  )
}
