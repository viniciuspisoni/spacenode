// /app/spaces/[spaceId]/vistas/[vistaId] — detalhe da vista.

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { VistaDetail } from '@/components/spaces/VistaDetail'
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

  const space   = spaceRes.data  as Space
  const vista   = vistaRes.data  as Vista
  const others  = (otherRes.data ?? []) as Pick<Vista, 'id' | 'image_url' | 'axis' | 'axis_value' | 'axis_label' | 'quality'>[]
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
