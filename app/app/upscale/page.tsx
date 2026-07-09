import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import UpscaleClient from './UpscaleClient'

export default async function UpscalePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Saldo da bolsa (dono do workspace) — é dele que a geração debita.
  const balance = await getPayerBalance(createAdminClient(), user.id)

  return <UpscaleClient initialCredits={balance.planBalance} sourceUrl={sp.source} />
}
