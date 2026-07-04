// /app/spaces/[spaceId] — Space em uso.
// Server Component: busca Space, vistas e identity do usuário; renderiza
// SpaceWorkspace (client) com tudo necessário pra geração + galeria.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import { SpaceWorkspace } from '@/components/spaces/SpaceWorkspace'
import { signStorageUrl, signRows } from '@/lib/storage/signed'
import type { Space, Vista, ArchitectIdentity } from '@/lib/spaces/types'
import type { PlanId } from '@/lib/plans'

export default async function SpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [spaceRes, vistasRes, balanceRes, identityRes, profRes] = await Promise.all([
    supabase.from('spaces').select('*').eq('id', spaceId).single(),
    supabase.from('vistas')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('user_node_balance').select('total_balance').eq('user_id', user.id).single(),
    supabase.from('architect_identity').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('plan').eq('id', user.id).single(),
  ])

  if (spaceRes.error || !spaceRes.data) notFound()

  // Assina URLs de Storage server-side antes de passar pro client (buckets
  // privados após o flip; no-op enquanto públicos / FAL).
  const admin    = createAdminClient()
  const spaceRaw = spaceRes.data as Space
  const space: Space = { ...spaceRaw, vista_mestre_url: await signStorageUrl(admin, spaceRaw.vista_mestre_url) }
  const vistas   = (await signRows(admin, vistasRes.data ?? [], ['image_url', 'source_sketch_url', 'edit_mask_url', 'source_image_url'])) as Vista[]
  const balance  = balanceRes.data?.total_balance ?? 0
  const identityRaw = (identityRes.data ?? null) as ArchitectIdentity | null
  const identity: ArchitectIdentity | null = identityRaw
    ? { ...identityRaw, logo_url: await signStorageUrl(admin, identityRaw.logo_url) }
    : null
  const planId   = (profRes.data?.plan as PlanId | undefined) ?? 'free'

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      <SpaceWorkspace
        space={space}
        initialVistas={vistas}
        initialBalance={balance}
        identity={identity}
        planId={planId}
      />
    </main>
  )
}
