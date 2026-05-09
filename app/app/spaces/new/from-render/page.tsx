// /app/spaces/new/from-render — caminho A.
//   - Sem ?render_id → galeria de renders
//   - Com ?render_id  → tela de config (nome + categoria + motor herdado) + extração

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FromRenderFlow, type RenderGalleryItem } from '@/components/spaces/FromRenderFlow'

export default async function FromRenderPage({
  searchParams,
}: {
  searchParams: Promise<{ render_id?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [galleryRes, balanceRes, preselectedRes] = await Promise.all([
    supabase
      .from('renders')
      .select('id, output_url, ambient, style, lighting, engine, resolution, created_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .neq('ambient', 'upscale')
      .neq('ambient', 'video')
      .not('output_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('user_node_balance')
      .select('total_balance')
      .eq('user_id', user.id).single(),
    sp.render_id
      ? supabase
          .from('renders')
          .select('id, output_url, ambient, style, lighting, engine, resolution, created_at')
          .eq('id', sp.render_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ])

  const gallery     = (galleryRes.data ?? []) as RenderGalleryItem[]
  const balance     = balanceRes.data?.total_balance ?? 0
  const preselected = (preselectedRes.data ?? null) as RenderGalleryItem | null

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      <FromRenderFlow
        gallery={gallery}
        preselected={preselected}
        initialBalance={balance}
      />
    </main>
  )
}
