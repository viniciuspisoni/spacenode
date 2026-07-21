import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { BLOCOS3D_ENGINES, BLOCOS3D_QUALITY_ORDER } from '@/lib/blocos3d/config'
import { engineAvailable } from '@/lib/blocos3d/provider'
import type { Blocos3DQuality } from '@/lib/blocos3d/types'
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

  // Disponibilidade real por tier (as keys dos providers são server-only).
  const engineAvailability = Object.fromEntries(
    BLOCOS3D_QUALITY_ORDER.map(q => [q, engineAvailable(BLOCOS3D_ENGINES[q])]),
  ) as Record<Blocos3DQuality, boolean>

  return (
    <Blocos3DClient
      initialCredits={balance.planBalance}
      engineAvailability={engineAvailability}
      initialJobId={typeof sp.job === 'string' ? sp.job : undefined}
    />
  )
}
