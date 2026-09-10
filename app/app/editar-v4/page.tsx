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
import { assertSafeImageUrl } from '@/lib/edit-v3/ssrf'
import { nodesForEdit } from '@/lib/edit-v4/pricing'
import { editV4Route } from '@/lib/edit-v4/flags'

/** `?source=` só é aceito se apontar para uma origem da casa — a MESMA
 *  allowlist que a rota de edição usa. Sem isto, um link montado por terceiro
 *  abriria o editor com uma imagem de fora e ela viraria o primeiro upload. */
function safeSource(raw: string | string[] | undefined): string | null {
  const url = typeof raw === 'string' ? raw : null
  if (!url) return null
  try {
    assertSafeImageUrl(url)
    return url
  } catch {
    return null
  }
}

export default async function EditarV4Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  if (process.env.NEXT_PUBLIC_EDIT_V4 !== '1') redirect('/app/editar')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Saldo da bolsa (dono do workspace) — é dele que a edição debita.
  const payerBalance = await getPayerBalance(createAdminClient(), user.id)
  const source = safeSource((await searchParams).source)

  return (
    // Sem fundo chapado e sem <main> aninhado: o shell do /app já é o <main>,
    // e é o <Ambient/> dele que pinta o fundo — uma cor opaca aqui apagaria o
    // papel de parede e o vidro da tela viraria cinza.
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
      <EditV4Flow
        initialBalance={payerBalance.totalBalance}
        initialSourceUrl={source}
        nodesPerEdit={nodesForEdit({ provider: editV4Route() })}
      />
    </div>
  )
}
