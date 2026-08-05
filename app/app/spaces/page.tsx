// /app/spaces — Biblioteca de Projetos ("Meus projetos").
//
// Server component: autentica, busca TODOS os Spaces do usuário (inclusive
// arquivados — o filtro Arquivados vive no client) via view spaces_with_counts
// sob RLS, e delega busca/filtros/ordenação/ações pro ProjectsLibrary.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { signRows } from '@/lib/storage/signed'
import type { SpaceWithCounts } from '@/lib/spaces/types'
import { ProjectsLibrary, ProjectsLoadError } from '@/components/spaces/ProjectsLibrary'

export default async function SpacesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows, error } = await supabase
    .from('spaces_with_counts')
    .select('*')
    .order('updated_at', { ascending: false })

  // Assina vista_mestre_url antes de passar pro client (bucket privado após o flip).
  const spaces = (await signRows(createAdminClient(), rows ?? [], ['vista_mestre_url'])) as SpaceWithCounts[]

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '40px 48px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontSize: 12, color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.005em', marginBottom: 36,
        }}>
          <span>Workspace</span>
          <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>Meus Spaces</span>
        </div>

        {error ? <ProjectsLoadError /> : <ProjectsLibrary spaces={spaces} />}

      </div>
    </main>
  )
}
