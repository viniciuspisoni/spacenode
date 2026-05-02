import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VideoClient from './VideoClient'

export default async function VideoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single()

  return <VideoClient initialCredits={profile?.credits ?? 0} />
}
