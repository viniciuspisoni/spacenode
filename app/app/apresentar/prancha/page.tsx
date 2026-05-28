import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PranchaClient from './PranchaClient'

export const metadata = {
  title: 'Prancha IA — Carrossel Instagram — Spacenode',
}

export default async function PranchaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [balRes, profRes, identityRes] = await Promise.all([
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
    supabase
      .from('architect_identity')
      .select('name')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const totalNodes =
    (balRes.data?.plan_balance ?? 0) +
    (balRes.data?.lumen_balance ?? 0)

  const initialCredits = totalNodes > 0 ? totalNodes : (profRes.data?.credits ?? 0)
  const studioName     = identityRes.data?.name?.trim() || null

  return (
    <PranchaClient
      initialCredits={initialCredits}
      studioName={studioName}
    />
  )
}
