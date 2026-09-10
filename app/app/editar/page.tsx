// /app/editar — Editar.
//
// Fork por feature flag (precedência de cima p/ baixo):
//   NEXT_PUBLIC_EDIT_V4=1       → Editar V4 (EditV4Flow): motor Seedream,
//                                 seleção raster (varinha mágica, booleanas,
//                                 refino de borda), 5 ações. EDITOR NOVO.
//   NEXT_PUBLIC_EDIT_V3=1       → Editar V3 (EditV3Flow): Google/Gemini-first,
//                                 edição por instrução (sem máscara) OU seleção,
//                                 4 ações + visão de resultado. EDITOR PADRÃO.
//   NEXT_PUBLIC_EDIT_V2_CLEAN=1 → Editar Clean (EditCleanFlow), legado.
//   NEXT_PUBLIC_EDIT_V2=1       → laboratório v2 (EditV2Flow), congelado.
//   (sem flag)                  → Editar v1 (RetocarStandaloneFlow), intocado.
// Rollback = remover a flag (cai para o editor anterior). Nada é removido.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { redirect } from 'next/navigation'
import { RetocarStandaloneFlow } from '@/components/spaces/RetocarStandaloneFlow'
import { EditV2Flow } from '@/components/editar/EditV2Flow'
import { EditCleanFlow } from '@/components/editar/EditCleanFlow'
import { EditV3Flow } from '@/components/edit-v3/EditV3Flow'
import { EditV4Flow } from '@/components/edit-v4/EditV4Flow'
import { nodesForEdit } from '@/lib/edit-v4/pricing'
import { editV4Route } from '@/lib/edit-v4/flags'

export default async function RetocarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Saldo da bolsa (dono do workspace) — é dele que a edição debita.
  const payerBalance = await getPayerBalance(createAdminClient(), user.id)

  const balance = payerBalance.totalBalance

  // O V4 sai antes do fork antigo de propósito: ele é o único que precisa do
  // papel de parede do <Ambient/> aparecendo por trás do vidro, e o <main> com
  // cor chapada abaixo pinta por cima dele. Os quatro editores antigos seguem
  // exatamente como estavam.
  if (process.env.NEXT_PUBLIC_EDIT_V4 === '1') {
    return (
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <EditV4Flow initialBalance={balance} nodesPerEdit={nodesForEdit({ provider: editV4Route() })} />
      </div>
    )
  }

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
