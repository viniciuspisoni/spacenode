import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { redirect } from 'next/navigation'
import GenerateClient from './GenerateClient'

const DEFAULT_CREDITS = 80

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; return?: string }>
}) {
  const sp = await searchParams
  // ?return=spaces/new — veio do fluxo "Novo projeto" sem renders; ao concluir
  // a render, o CTA de resultado volta pro fluxo com ela pré-selecionada.
  const returnTo = sp.return === 'spaces/new' ? ('spaces/new' as const) : undefined
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const admin = createAdminClient()

  // Conta renders do usuário (head-only) — 0 liga o Guia da primeira imagem.
  // O .then() já dispara a requisição, correndo em paralelo com o bloco abaixo.
  const renderCountPromise = supabase
    .from('renders')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .then(({ count }) => count ?? 0)

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

  const renderCount = await renderCountPromise

  return (
    <GenerateClient
      // Saldo TOTAL da bolsa (plano + Lumens) — é o que consume_workspace_nodes
      // debita, então é o que gateia o CTA e alimenta o contador de renders.
      initialCredits={balance.totalBalance}
      // Sem assinatura ativa, o default de motor×qualidade é o econômico
      // (Pulsar + HD) — config persistida do usuário continua vencendo.
      isSubscriber={balance.planId !== 'free'}
      initialMaterials={profile.project_materials ?? undefined}
      initialConfig={profile.project_config ?? undefined}
      initialSourceUrl={sp.source}
      returnTo={returnTo}
      firstRender={renderCount === 0}
    />
  )
}
