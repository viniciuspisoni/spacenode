import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SpacesGrid } from '@/components/spaces/SpacesGrid'
import type { Space } from '@/lib/spaces/types'

type SpaceRow = Space & { anchor_url?: string | null }

export default async function SpacesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch spaces with counts via view
  const { data: spacesRaw } = await supabase
    .from('spaces_with_counts')
    .select('*')
    .order('updated_at', { ascending: false })

  const spaces = spacesRaw ?? []

  // Fetch anchor URLs for all spaces that have an anchor_render_id
  const anchorIds = spaces
    .map(s => s.anchor_render_id)
    .filter((id): id is string => !!id)

  let anchorMap: Record<string, string> = {}
  if (anchorIds.length > 0) {
    const { data: renders } = await supabase
      .from('renders')
      .select('id, output_url')
      .in('id', anchorIds)
    anchorMap = Object.fromEntries(
      (renders ?? []).map(r => [r.id, r.output_url as string])
    )
  }

  const spacesWithAnchor: SpaceRow[] = spaces.map(s => ({
    ...s,
    anchor_url: s.anchor_render_id ? anchorMap[s.anchor_render_id] ?? null : null,
  }))

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: '#0a0a0a', padding: '40px 48px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontSize: 12, color: 'rgba(255,255,255,0.42)',
          letterSpacing: '-0.005em',
          marginBottom: 36,
        }}>
          <span>Workspace</span>
          <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
          <span style={{ color: '#fafafa', fontWeight: 500 }}>Spaces</span>
        </div>

        {/* Page header */}
        <div style={{
          display: 'flex', alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: 28, gap: 24,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 style={{
              fontSize: 26, fontWeight: 500,
              letterSpacing: '-0.03em',
              color: '#fafafa',
              lineHeight: 1.1,
            }}>
              Seus Spaces
            </h1>
            <p style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.42)',
              lineHeight: 1.6,
              maxWidth: 520,
              letterSpacing: '-0.005em',
            }}>
              Cada projeto, um Space. A Vista Mestre define o DNA visual e toda
              evolução nasce com a memória do projeto preservada.
            </p>
          </div>

          <Link
            href="/app/spaces/new"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 18px',
              background: 'linear-gradient(180deg, #fafafa 0%, #e8e8e8 100%)',
              color: '#050505',
              borderRadius: 8, fontSize: 13, fontWeight: 500,
              textDecoration: 'none', letterSpacing: '-0.005em', flexShrink: 0,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.3)',
              lineHeight: 1,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Novo Space
          </Link>
        </div>

        {/* Grid with filters */}
        {spaces.length === 0 ? (
          /* Empty state */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 24px', textAlign: 'center',
            background: '#111111',
            border: '0.5px dashed rgba(255,255,255,0.12)',
            borderRadius: 14,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'rgba(48,180,108,0.08)',
              border: '0.5px solid rgba(48,180,108,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
              color: '#30b46c',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#fafafa', marginBottom: 8, letterSpacing: '-0.02em' }}>
              Nenhum Space ainda
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', lineHeight: 1.6, marginBottom: 24, maxWidth: 360 }}>
              Crie o primeiro Space do seu projeto e comece a evoluir suas Vistas.
            </div>
            <Link
              href="/app/spaces/new"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px',
                background: 'linear-gradient(180deg, #30b46c 0%, #258d54 100%)',
                color: '#042818',
                borderRadius: 8, fontSize: 13, fontWeight: 600,
                textDecoration: 'none', letterSpacing: '-0.005em',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(48,180,108,0.18)',
              }}
            >
              Criar primeiro Space
            </Link>
          </div>
        ) : (
          <SpacesGrid spaces={spacesWithAnchor} />
        )}

      </div>
    </main>
  )
}
