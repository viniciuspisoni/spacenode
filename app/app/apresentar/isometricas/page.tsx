import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import IsometricasClient from './IsometricasClient'

export const metadata = {
  title: 'Isométricas — Spacenode',
}

export default async function IsometricasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [balRes, profRes] = await Promise.all([
    supabase
      .from('user_node_balance')
      .select('plan_balance, lumen_balance')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single(),
  ])

  const totalNodes =
    (balRes.data?.plan_balance ?? 0) +
    (balRes.data?.lumen_balance ?? 0)

  const initialCredits = totalNodes > 0 ? totalNodes : (profRes.data?.credits ?? 0)

  return <IsometricasClient initialCredits={initialCredits} />
}
