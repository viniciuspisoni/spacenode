// /app/spaces/new — fluxo de criação de Space.
// Server Component: busca saldo total (plan + lumens) e passa pro Client.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NewSpaceFlow } from '@/components/spaces/NewSpaceFlow'

export default async function NewSpacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: balanceRow } = await supabase
    .from('user_node_balance')
    .select('total_balance')
    .eq('user_id', user.id)
    .single()

  const balance = balanceRow?.total_balance ?? 0

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      <NewSpaceFlow initialBalance={balance} />
    </main>
  )
}
