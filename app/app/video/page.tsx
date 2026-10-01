import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import AnimateClient from './AnimateClient'
import { assertSafeImageUrl } from '@/lib/edit-v3/ssrf'

export default async function VideoPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Saldo da bolsa (dono do workspace) — é dele que a geração debita.
  const balance = await getPayerBalance(createAdminClient(), user.id)

  let source: string | null = null
  if (sp.source) {
    try { assertSafeImageUrl(sp.source); source = sp.source } catch { /* Ignore invalid deep links. */ }
  }
  return <AnimateClient initialCredits={balance.planBalance} initialSourceUrl={source} />
}
