// /app/editar — Editar.
//
// Fork por feature flag (precedência de cima p/ baixo):
//   NEXT_PUBLIC_EDIT_V3=1       → Editar V3 (EditV3Flow): Google/Gemini-first,
//                                 edição por instrução (sem máscara) OU seleção,
//                                 4 ações + visão de resultado. EDITOR PADRÃO.
//   NEXT_PUBLIC_EDIT_V2_CLEAN=1 → Editar Clean (EditCleanFlow), legado.
//   NEXT_PUBLIC_EDIT_V2=1       → laboratório v2 (EditV2Flow), congelado.
//   (sem flag)                  → Editar v1 (RetocarStandaloneFlow), intocado.
// Rollback = remover a flag (cai para o editor anterior). Nada é removido.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RetocarStandaloneFlow } from '@/components/spaces/RetocarStandaloneFlow'
import { EditV2Flow } from '@/components/editar/EditV2Flow'
import { EditCleanFlow } from '@/components/editar/EditCleanFlow'
import { EditV3Flow } from '@/components/edit-v3/EditV3Flow'

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
  const useV3 = process.env.NEXT_PUBLIC_EDIT_V3 === '1'
  const useClean = process.env.NEXT_PUBLIC_EDIT_V2_CLEAN === '1'
  const useV2 = process.env.NEXT_PUBLIC_EDIT_V2 === '1'

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      {useV3 ? (
        <EditV3Flow initialBalance={balance} />
      ) : useClean ? (
        <EditCleanFlow initialBalance={balance} />
      ) : useV2 ? (
        <EditV2Flow initialBalance={balance} />
      ) : (
        <RetocarStandaloneFlow initialBalance={balance} />
      )}
    </main>
  )
}
