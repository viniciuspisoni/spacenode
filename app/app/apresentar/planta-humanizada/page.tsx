import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import PlantaHumanizadaClient from './PlantaHumanizadaClient'

export const metadata = {
  title: 'Planta Humanizada — Spacenode',
}

export default async function PlantaHumanizadaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Saldo da bolsa (dono do workspace) — é dele que a geração debita.
  const balance = await getPayerBalance(createAdminClient(), user.id)

  return <PlantaHumanizadaClient initialCredits={balance.totalBalance} />
}
