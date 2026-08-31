import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { getEstudarConfig } from '@/lib/estudar/config'
import EstudarClient from './EstudarClient'

// Estudar — estudos preliminares para ambientes reais.
// Server shell no padrão dos módulos: gate de auth + saldo do PAGADOR
// (dono do workspace) + custos da config (fonte única, nunca NEXT_PUBLIC)
// + pastas do usuário pro vínculo com projeto. Todo o resto vive no client.

export default async function EstudarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const config = getEstudarConfig()
  const [balance, foldersRes] = await Promise.all([
    getPayerBalance(createAdminClient(), user.id),
    // RLS: o usuário só lê as próprias pastas.
    supabase.from('render_folders').select('id, name, parent_id').order('name'),
  ])

  return (
    <EstudarClient
      initialCredits={balance.totalBalance}
      custoEstudo={config.studyNodes}
      custoRefino={config.refineNodes}
      folders={(foldersRes.data ?? []) as { id: string; name: string; parent_id: string | null }[]}
    />
  )
}
