import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Space, Vista } from '@/lib/spaces/types'
import { SpaceHeader }      from '@/components/spaces/SpaceHeader'
import { AnchorCard }       from '@/components/spaces/AnchorCard'
import { DnaCard }          from '@/components/spaces/DnaCard'
import { SpaceInteractive } from '@/components/spaces/SpaceInteractive'

// ── /app/spaces/[spaceId] — Tela 02: Space View ───────────────────────────────

export default async function SpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── 1. Space (with counts) — RLS ensures ownership ────────────────────────
  const { data: spaceRaw } = await supabase
    .from('spaces_with_counts')
    .select('*')
    .eq('id', spaceId)
    .single()

  if (!spaceRaw) notFound()

  const space = spaceRaw as Space

  // ── 2. Anchor (Vista Mestre) ──────────────────────────────────────────────
  let anchor: Vista | null = null
  if (space.anchor_render_id) {
    const { data } = await supabase
      .from('renders')
      .select('*')
      .eq('id', space.anchor_render_id)
      .single()
    anchor = data as Vista | null
  }

  // ── 3. Vistas (excludes Vista Mestre — shown separately as Anchor) ────────
  const { data: vistasRaw } = await supabase
    .from('renders')
    .select('*')
    .eq('space_id', spaceId)
    .neq('vista_type', 'mestre')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })

  const vistas = (vistasRaw ?? []) as Vista[]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main style={{
      flex: 1, overflowY: 'auto',
      background: '#0a0a0a',
      padding: '40px 48px 80px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header: back link + name + category + meta */}
        <SpaceHeader space={space} />

        {/* Two-column: Anchor image | Project DNA */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 348px',
          gap: 20,
          marginBottom: 20,
          alignItems: 'start',
        }}>
          <AnchorCard anchor={anchor} spaceName={space.name} />
          <DnaCard dna={space.project_dna} />
        </div>

        {/* GenBar + Vistas gallery + EvolveDrawer — client island */}
        <SpaceInteractive
          space={space}
          anchor={anchor}
          vistas={vistas}
          spaceId={spaceId}
        />

      </div>
    </main>
  )
}
