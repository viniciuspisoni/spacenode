// /app/editar-v3 — Editar V3 (rota nova, isolada).
//
// Gated por NEXT_PUBLIC_EDIT_V3: sem a flag, a página redireciona para o Editar
// atual (/app/editar) — o V3 só aparece com a flag ligada. NÃO toca o fork de
// 3 vias do /app/editar (v1/v2/Clean). Espelha o boilerplate de auth + saldo.
//
// Rollback = remover a flag (a página V3 some, /app/editar segue intocado).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { redirect } from 'next/navigation'
import { EditV3Flow } from '@/components/edit-v3/EditV3Flow'
import { editV3AllowHighPrecision } from '@/lib/edit-v3/flags'

export default async function EditarV3Page() {
  if (process.env.NEXT_PUBLIC_EDIT_V3 !== '1') redirect('/app/editar')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Saldo da bolsa (dono do workspace) — é dele que a edição debita.
  const payerBalance = await getPayerBalance(createAdminClient(), user.id)

  const balance = payerBalance.totalBalance

  return (
    // Sem fundo chapado e sem <main> aninhado: o shell do /app já é o <main>,
    // e é o <Ambient/> dele que pinta o fundo — uma cor opaca aqui apagaria o
    // papel de parede e o vidro da tela viraria cinza.
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
      <EditV3Flow
        initialBalance={balance}
        // A alta precisão é gated no servidor (EDIT_V3_ALLOW_PRO). A flag é
        // server-only, então a decisão de MOSTRAR o cartão desce daqui — sem
        // ela o usuário só encontraria o 403.
        allowHighQuality={editV3AllowHighPrecision()}
      />
    </div>
  )
}
