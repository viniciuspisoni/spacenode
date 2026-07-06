// /app/finalizar/[id] — abre uma composição salva.
// Next 16: params é Promise (await). Carrega via cliente user-scoped (RLS).

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { FinalizeEditor } from '@/components/finalizar/FinalizeEditor'
import { mediaProxyUrl, mediaProxyDeep } from '@/lib/storage/signed'
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

  // Editor round-trip: URL de PROXY (estável) em base/thumbnail + document, NÃO
  // signed URL (que expiraria e seria persistida no save-back). No-op enquanto
  // STORAGE_PRIVATE off. NOTA: verificar em staging o load do canvas via proxy
  // (crossOrigin/taint no export) antes de ligar a flag.
  const raw = data as unknown as FinalizeProject
  const project: FinalizeProject = {
    ...raw,
    base_image_url: mediaProxyUrl(raw.base_image_url),
    thumbnail_url:  mediaProxyUrl(raw.thumbnail_url),
    document:       mediaProxyDeep(raw.document) as FinalizeProject['document'],
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--color-bg)' }}>
      <FinalizeEditor initialProject={project} />
    </div>
  )
}
