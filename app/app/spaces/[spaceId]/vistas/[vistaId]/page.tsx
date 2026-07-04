// /app/spaces/[spaceId]/vistas/[vistaId] — detalhe da vista.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import { VistaDetail } from '@/components/spaces/VistaDetail'
import { signStorageUrl, signRows } from '@/lib/storage/signed'
import type { Space, Vista } from '@/lib/spaces/types'

export default async function VistaDetailPage({
  params,
}: {
  params: Promise<{ spaceId: string; vistaId: string }>
}) {
  const { spaceId, vistaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [spaceRes, vistaRes, otherRes, balanceRes] = await Promise.all([
    supabase.from('spaces').select('*').eq('id', spaceId).single(),
    supabase.from('vistas').select('*').eq('id', vistaId).single(),
    supabase.from('vistas')
      .select('id, image_url, axis, axis_value, axis_label, quality')
      .eq('space_id', spaceId)
      .neq('id', vistaId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('user_node_balance').select('total_balance').eq('user_id', user.id).single(),
  ])

  if (vistaRes.error || !vistaRes.data) notFound()
  if (spaceRes.error || !spaceRes.data) notFound()

  // Assina URLs de Storage server-side antes de passar pro client (buckets
  // privados após o flip; no-op enquanto públicos / FAL).
  const admin    = createAdminClient()
  const spaceRaw = spaceRes.data as Space
  const space: Space = { ...spaceRaw, vista_mestre_url: await signStorageUrl(admin, spaceRaw.vista_mestre_url) }
  const vistaRaw = vistaRes.data as Vista
  const vista: Vista = {
    ...vistaRaw,
    image_url:         await signStorageUrl(admin, vistaRaw.image_url),
    source_sketch_url: await signStorageUrl(admin, vistaRaw.source_sketch_url),
    edit_mask_url:     await signStorageUrl(admin, vistaRaw.edit_mask_url),
    source_image_url:  await signStorageUrl(admin, vistaRaw.source_image_url),
  }
  const others  = (await signRows(admin, otherRes.data ?? [], ['image_url'])) as Pick<Vista, 'id' | 'image_url' | 'axis' | 'axis_value' | 'axis_label' | 'quality'>[]
  const balance = balanceRes.data?.total_balance ?? 0

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      <VistaDetail
        space={space}
        vista={vista}
        others={others}
        initialBalance={balance}
      />
    </main>
  )
}
