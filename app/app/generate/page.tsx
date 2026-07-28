import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { redirect } from 'next/navigation'
import GenerateClient from './GenerateClient'

const DEFAULT_CREDITS = 80

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const admin = createAdminClient()

  // Materiais/config são do PRÓPRIO usuário; o saldo exibido/gateado é da
  // bolsa (dono do workspace) — é dele que a geração debita.
  let [{ data: profile }, balance] = await Promise.all([
    supabase
      .from('profiles')
      .select('project_materials, project_config')
      .eq('id', user.id)
      .single(),
    getPayerBalance(admin, user.id),
  ])

  // Usuário pré-existente (antes do trigger handle_new_user) — cria profile agora
  if (!profile) {
    await admin.from('profiles').upsert({
      id: user.id,
      email: user.email ?? '',
      full_name: user.user_metadata?.full_name ?? null,
      credits: DEFAULT_CREDITS,
    })
    profile = { project_materials: null, project_config: null }
    balance = await getPayerBalance(admin, user.id)
  }

  return (
    <GenerateClient
      initialCredits={balance.planBalance}
      initialMaterials={profile.project_materials ?? undefined}
      initialConfig={profile.project_config ?? undefined}
      initialSourceUrl={sp.source}
    />
  )
}
