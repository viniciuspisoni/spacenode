import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AnimateClient from './AnimateClient'

export default async function VideoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single()

  return <AnimateClient initialCredits={profile?.credits ?? 0} />
}
