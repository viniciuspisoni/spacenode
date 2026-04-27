import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HistoryClient } from './HistoryClient'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: renders }] = await Promise.all([
    supabase.from('profiles').select('credits').eq('id', user.id).single(),
    supabase.from('renders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
  ])

  return (
    <HistoryClient
      renders={renders ?? []}
      credits={profile?.credits ?? 0}
    />
  )
}
