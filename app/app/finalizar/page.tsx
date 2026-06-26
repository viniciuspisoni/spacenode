// /app/finalizar — Finalizar (pós-produção arquitetônica local).
// Server Component: só auth. NÃO busca saldo/Nodes (a ferramenta é gratuita).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FinalizeEditor } from '@/components/finalizar/FinalizeEditor'
import type { FinalizeProjectSummary } from '@/lib/finalizar/types'

export default async function FinalizarPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('finalize_projects')
    .select('id, name, thumbnail_url, updated_at')
    .order('updated_at', { ascending: false })
    .limit(120)

  const savedProjects = (data ?? []) as FinalizeProjectSummary[]

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--color-bg)' }}>
      <FinalizeEditor savedProjects={savedProjects} initialSourceUrl={sp.source ?? null} />
    </div>
  )
}
