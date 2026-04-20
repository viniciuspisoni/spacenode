import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GenerateClient from './GenerateClient'

export default async function GeneratePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single()

  return (
    <GenerateClient
      userName={user.user_metadata?.full_name ?? user.email ?? 'Arquiteto'}
      credits={profile?.credits ?? 0}
    />
  )
}
