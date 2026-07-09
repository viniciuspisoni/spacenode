import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import IsometricasClient from './IsometricasClient'

export const metadata = {
  title: 'Isométricas — Spacenode',
}

export default async function IsometricasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Saldo da bolsa (dono do workspace) — é dele que a geração debita.
  const balance = await getPayerBalance(createAdminClient(), user.id)

  return <IsometricasClient initialCredits={balance.totalBalance} />
}
