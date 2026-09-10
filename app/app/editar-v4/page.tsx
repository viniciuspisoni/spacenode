// /app/editar-v4 — Editar V4 (rota nova, isolada).
//
// Gated por NEXT_PUBLIC_EDIT_V4: sem a flag a página redireciona para o Editar
// atual. O V3 e o fork de /app/editar seguem intocados enquanto a flag estiver
// desligada — rollback é remover a env, sem tocar em código.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { redirect } from 'next/navigation'
import { EditV4Flow } from '@/components/edit-v4/EditV4Flow'

export default async function EditarV4Page() {
  if (process.env.NEXT_PUBLIC_EDIT_V4 !== '1') redirect('/app/editar')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Saldo da bolsa (dono do workspace) — é dele que a edição debita.
  const payerBalance = await getPayerBalance(createAdminClient(), user.id)

  return (
    // Sem fundo chapado e sem <main> aninhado: o shell do /app já é o <main>,
    // e é o <Ambient/> dele que pinta o fundo — uma cor opaca aqui apagaria o
    // papel de parede e o vidro da tela viraria cinza.
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
      <EditV4Flow initialBalance={payerBalance.totalBalance} />
    </div>
  )
}
