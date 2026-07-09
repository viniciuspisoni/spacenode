import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import MoodboardClient from './MoodboardClient'

export const metadata = {
  title: 'Moodboard — Spacenode',
}

export default async function MoodboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Saldo da bolsa (dono do workspace) — é dele que a geração debita.
  const [balance, identityRes] = await Promise.all([
    getPayerBalance(createAdminClient(), user.id),
    supabase
      .from('architect_identity')
      .select('name')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const studioName = identityRes.data?.name?.trim() || null

  return <MoodboardClient initialCredits={balance.totalBalance} studioName={studioName} />
}
