import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HistoryClient } from './HistoryClient'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: renders }, { data: spaces }] = await Promise.all([
    supabase.from('profiles').select('credits').eq('id', user.id).single(),
    supabase.from('renders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
    supabase.from('spaces').select('id, name, category').eq('user_id', user.id).order('updated_at', { ascending: false }),
  ])

  return (
    <HistoryClient
      renders={renders ?? []}
      credits={profile?.credits ?? 0}
      spaces={spaces ?? []}
    />
  )
}
