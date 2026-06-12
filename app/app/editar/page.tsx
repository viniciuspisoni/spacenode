// /app/editar — Editar.
//
// Com NEXT_PUBLIC_EDIT_V2=1 renderiza o novo editor (EditV2Flow, Fase 3,
// cobrança simulada); sem a flag, o Editar v1 (RetocarStandaloneFlow) segue
// exatamente como sempre. Rollback = remover a flag (sem deploy de código).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RetocarStandaloneFlow } from '@/components/spaces/RetocarStandaloneFlow'
import { EditV2Flow } from '@/components/editar/EditV2Flow'

export default async function RetocarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: balanceRow } = await supabase
    .from('user_node_balance')
    .select('total_balance')
    .eq('user_id', user.id)
    .single()

  const balance = balanceRow?.total_balance ?? 0
  const useV2 = process.env.NEXT_PUBLIC_EDIT_V2 === '1'

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      {useV2 ? (
        <EditV2Flow initialBalance={balance} />
      ) : (
        <RetocarStandaloneFlow initialBalance={balance} />
      )}
    </main>
  )
}
