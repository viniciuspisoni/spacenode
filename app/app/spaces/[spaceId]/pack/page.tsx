// /app/spaces/[spaceId]/pack — editor de Pack.
// Server Component carrega Space, vistas, identidade do escritório e
// pack existente (ou cria draft sob demanda no client se não houver).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import { PackEditor } from '@/components/spaces/PackEditor'
import { signStorageUrl, signRows } from '@/lib/storage/signed'
import type { Space, Vista, Pack, ArchitectIdentity } from '@/lib/spaces/types'

export default async function PackPage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [spaceRes, vistasRes, packRes, identityRes] = await Promise.all([
    supabase.from('spaces').select('*').eq('id', spaceId).single(),
    supabase.from('vistas')
      .select('*')
      .eq('space_id', spaceId)
      .eq('status', 'completed')
      .order('is_favorited', { ascending: false })
      .order('created_at', { ascending: false }),
    // pega o pack mais recente do Space (se houver)
    supabase.from('packs')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('architect_identity').select('*').eq('user_id', user.id).maybeSingle(),
  ])

  if (spaceRes.error || !spaceRes.data) notFound()

  // Assina URLs de Storage server-side antes de passar pro client (buckets
  // privados após o flip; no-op enquanto públicos / FAL).
  const admin    = createAdminClient()
  const spaceRaw = spaceRes.data as Space
  const space: Space = { ...spaceRaw, vista_mestre_url: await signStorageUrl(admin, spaceRaw.vista_mestre_url) }
  const vistas   = (await signRows(admin, vistasRes.data ?? [], ['image_url'])) as Vista[]
  const pack     = (packRes.data ?? null) as Pack | null
  const identityRaw = (identityRes.data ?? null) as ArchitectIdentity | null
  const identity: ArchitectIdentity | null = identityRaw
    ? { ...identityRaw, logo_url: await signStorageUrl(admin, identityRaw.logo_url) }
    : null

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      <PackEditor
        space={space}
        vistas={vistas}
        initialPack={pack}
        identity={identity}
      />
    </main>
  )
}
