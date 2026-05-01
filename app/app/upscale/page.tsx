import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UpscaleClient from './UpscaleClient'

export default async function UpscalePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single()

  return <UpscaleClient initialCredits={profile?.credits ?? 0} />
}
