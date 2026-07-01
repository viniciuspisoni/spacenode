import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { RENDER_LIST_COLUMNS, sanitizeRenderListRow } from '@/lib/history/redact'
import { HistoryClient } from './HistoryClient'

const PAGE_SIZE = 60

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: renders }, { data: folders }, { data: allFolderIds }] = await Promise.all([
    supabase.from('profiles').select('credits').eq('id', user.id).single(),
    // Projeção explícita + tradução de campos de provider: as linhas viram
    // props do client component (serializam no payload RSC) — nada de prompt
    // final, fal_request_id ou endpoints aqui. Ver lib/history/redact.ts.
    supabase
      .from('renders')
      .select(RENDER_LIST_COLUMNS)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
    // parent_id: null = pasta de topo (cliente), preenchido = subpasta (projeto).
    supabase.from('render_folders').select('id, name, parent_id, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('renders').select('folder_id').eq('user_id', user.id),
  ])

  const counts: Record<string, number> = {}
  let unfiled = 0
  for (const r of allFolderIds ?? []) {
    if (r.folder_id) counts[r.folder_id] = (counts[r.folder_id] ?? 0) + 1
    else unfiled++
  }
  const total = (allFolderIds ?? []).length

  // ── Autoria ──────────────────────────────────────────────────────────────────
  // Mapa user_id → perfil para o chip "Gerado por" na grid. Hoje a listagem é
  // por user_id (só o próprio), mas o mapa já cobre o cenário de equipes: quando
  // a listagem passar a incluir o workspace, os autores dos colegas resolvem
  // aqui sem mudança na UI. Admin client porque a RLS de profiles não permite
  // ler perfis de outros membros.
  const authorIds = Array.from(new Set([user.id, ...(renders ?? []).map(r => r.user_id).filter(Boolean)]))
  const admin = createAdminClient()
  const { data: authorRows } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', authorIds)

  const authors: Record<string, { name: string | null; email: string | null }> = {}
  for (const a of authorRows ?? []) {
    authors[a.id] = { name: a.full_name ?? null, email: a.email ?? null }
  }

  return (
    <HistoryClient
      renders={(renders ?? []).map(sanitizeRenderListRow)}
      folderCounts={{ counts, unfiled, total }}
      pageSize={PAGE_SIZE}
      credits={profile?.credits ?? 0}
      folders={folders ?? []}
      authors={authors}
      currentUserId={user.id}
    />
  )
}
