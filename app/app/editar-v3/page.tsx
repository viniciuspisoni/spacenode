// /app/editar-v3 — Editar V3 (rota nova, isolada).
//
// Gated por NEXT_PUBLIC_EDIT_V3: sem a flag, a página redireciona para o Editar
// atual (/app/editar) — o V3 só aparece com a flag ligada. NÃO toca o fork de
// 3 vias do /app/editar (v1/v2/Clean). Espelha o boilerplate de auth + saldo.
//
// Rollback = remover a flag (a página V3 some, /app/editar segue intocado).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EditV3Flow } from '@/components/edit-v3/EditV3Flow'

export default async function EditarV3Page() {
  if (process.env.NEXT_PUBLIC_EDIT_V3 !== '1') redirect('/app/editar')

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
      <EditV3Flow initialBalance={balance} />
    </main>
  )
}
