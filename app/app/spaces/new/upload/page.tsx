// /app/spaces/new/upload — caminho B (upload direto da Vista Mestre).
// Mesma UI/comportamento do fluxo original — só mudou a rota.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { redirect } from 'next/navigation'
import { NewSpaceFlow } from '@/components/spaces/NewSpaceFlow'

export default async function NewSpaceUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Saldo da bolsa (dono do workspace) — é dele que a geração debita.
  const payerBalance = await getPayerBalance(createAdminClient(), user.id)

  const balance = payerBalance.totalBalance
  const sourceUrl = sp.source && /^https:\/\//i.test(sp.source) ? sp.source : undefined

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      <NewSpaceFlow initialBalance={balance} sourceUrl={sourceUrl} />
    </main>
  )
}
