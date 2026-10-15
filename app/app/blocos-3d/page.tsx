import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { BLOCOS3D_ENGINES, DEFAULT_BLOCOS3D_QUALITY } from '@/lib/blocos3d/config'
import { engineAvailable } from '@/lib/blocos3d/provider'
import Blocos3DClient from './Blocos3DClient'

export default async function Blocos3DPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Saldo da bolsa (dono do workspace) — é dele que a geração debita.
  const balance = await getPayerBalance(createAdminClient(), user.id)

  const available = engineAvailable(BLOCOS3D_ENGINES[DEFAULT_BLOCOS3D_QUALITY])

  return (
    <Blocos3DClient
      initialCredits={balance.totalBalance}
      engineAvailable={available}
      initialJobId={typeof sp.job === 'string' ? sp.job : undefined}
    />
  )
}
