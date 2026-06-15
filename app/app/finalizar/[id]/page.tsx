// /app/finalizar/[id] — abre uma composição salva.
// Next 16: params é Promise (await). Carrega via cliente user-scoped (RLS).

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { FinalizeEditor } from '@/components/finalizar/FinalizeEditor'
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

  const project = data as unknown as FinalizeProject

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--color-bg)' }}>
      <FinalizeEditor initialProject={project} />
    </div>
  )
}
