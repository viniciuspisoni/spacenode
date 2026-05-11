import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HistoryClient } from './HistoryClient'

const PAGE_SIZE = 60

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: renders }, { data: folders }, { data: allFolderIds }] = await Promise.all([
    supabase.from('profiles').select('credits').eq('id', user.id).single(),
    supabase
      .from('renders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
    supabase.from('render_folders').select('id, name, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('renders').select('folder_id').eq('user_id', user.id),
  ])

  const counts: Record<string, number> = {}
  let unfiled = 0
  for (const r of allFolderIds ?? []) {
    if (r.folder_id) counts[r.folder_id] = (counts[r.folder_id] ?? 0) + 1
    else unfiled++
  }
  const total = (allFolderIds ?? []).length

  return (
    <HistoryClient
      renders={renders ?? []}
      folderCounts={{ counts, unfiled, total }}
      pageSize={PAGE_SIZE}
      credits={profile?.credits ?? 0}
      folders={folders ?? []}
    />
  )
}
