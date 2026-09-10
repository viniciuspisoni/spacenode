// /app/finalizar — Finalizar (pós-produção arquitetônica local).
// Server Component: só auth. NÃO busca saldo/Nodes (a ferramenta é gratuita).

import { createClient } from '@/lib/supabase/server'
import { editV4Enabled } from '@/lib/edit-v4/flags'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { FinalizeEditor } from '@/components/finalizar/FinalizeEditor'
import { signRows } from '@/lib/storage/signed'
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

  // Assina thumbnail_url antes de passar pro client (bucket privado após o flip).
  const savedProjects = (await signRows(createAdminClient(), data ?? [], ['thumbnail_url'])) as FinalizeProjectSummary[]

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--color-bg)' }}>
      {/* A aba de IA só aparece se a ROTA estiver ligada. As duas flags são
          independentes: NEXT_PUBLIC_EDIT_V4 decide qual editor a página monta,
          EDIT_V4_ENABLED decide se /api/edit-v4 existe. Sem esta checagem o
          /app/finalizar de produção — onde a rota responde 404 — abriria numa
          aba que só sabe falhar depois da pessoa marcar a área. */}
      <FinalizeEditor
        savedProjects={savedProjects}
        initialSourceUrl={sp.source ?? null}
        aiEnabled={editV4Enabled()}
      />
    </div>
  )
}
