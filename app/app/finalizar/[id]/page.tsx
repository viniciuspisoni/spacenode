// /app/finalizar/[id] — abre uma composição salva.
// Next 16: params é Promise (await). Carrega via cliente user-scoped (RLS).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import { FinalizeEditor } from '@/components/finalizar/FinalizeEditor'
import { signStorageUrl, signDeep } from '@/lib/storage/signed'
import type { FinalizeProject } from '@/lib/finalizar/types'

export default async function FinalizarProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('finalize_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) notFound()

  // Assina base/thumbnail + as URLs aninhadas no document antes de entregar ao
  // editor (space-mestres vira privado; no-op enquanto público).
  const admin = createAdminClient()
  const raw = data as unknown as FinalizeProject
  const project: FinalizeProject = {
    ...raw,
    base_image_url: await signStorageUrl(admin, raw.base_image_url),
    thumbnail_url:  await signStorageUrl(admin, raw.thumbnail_url),
    document:       (await signDeep(admin, raw.document)) as FinalizeProject['document'],
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--color-bg)' }}>
      <FinalizeEditor initialProject={project} />
    </div>
  )
}
