import { Suspense } from 'react'
import { Ambient } from '@/components/app/glass'
import { signRows } from '@/lib/storage/signed'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/app/Sidebar'
import WelcomeTour from '@/components/app/WelcomeTour'
import AttributionBinder from '@/components/marketing/AttributionBinder'
import NodiRoot from '@/components/nodi/NodiRoot'
import { isNodiEnabled } from '@/lib/nodi/flags'
import SignupConversionPing from '@/components/SignupConversionPing'
import { getPlanById, type PlanId } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userName   = user.user_metadata.full_name ?? user.email ?? 'usuário'
  const userAvatar = user.user_metadata.avatar_url ?? null

  // Saldo + plano da "bolsa": dono do workspace ativo (individual = ele mesmo).
  // Lê via service-role porque o membro não enxerga o saldo do dono pelo RLS.
  // Em paralelo, o flag do tour de boas-vindas (NULL = nunca visto → abre sozinho).
  // O terceiro é o papel de parede: o último render do usuário, borrado, é o
  // que o vidro refrata (mesmo recurso do painel v1 do plugin). Uma linha só,
  // e a falha não é erro visível — sem ele fica o degradê neutro do CSS.
  const [balance, onboardingRow, lastRenderRow] = await Promise.all([
    getPayerBalance(createAdminClient(), user.id),
    supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('renders')
      .select('output_url')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .not('output_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const [signedLastRender] = await signRows(
    createAdminClient(),
    lastRenderRow.data ? [lastRenderRow.data] : [],
    ['output_url'],
  )

  // Sem linha de perfil não há onde persistir a conclusão — não abre o tour
  // (senão ele voltaria a cada visita).
  const needsOnboarding =
    !!onboardingRow.data && onboardingRow.data.onboarding_completed_at === null

  const planId       = (balance.planId as PlanId) ?? 'free'
  const plan         = getPlanById(planId)
  const planTotal    = plan?.nodes ?? 0
  const planBalance  = balance.planBalance
  const extraBalance = balance.extraBalance

  return (
    // .spn-app: o escopo do vidro. Baixa a intensidade do papel de parede e
    // levanta o texto terciário — no plugin todo texto fica sobre vidro, aqui
    // títulos e microcópia caem direto no papel (ver globals.css, "Escopo do
    // app"). O fundo chapado sai daqui e do <main>: é o <Ambient/> que pinta.
    <div className="spn-app" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Ambient fallbackUrl={signedLastRender?.output_url ?? null} />
      <Sidebar
        userName={userName}
        userAvatar={userAvatar}
        planBalance={planBalance}
        planTotal={planTotal}
        extraBalance={extraBalance}
        planId={planId}
      />
      {/* z-index 1: acima do papel de parede, que é fixed em z-index 0. */}
      <main style={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', position: 'relative', zIndex: 1 }}>
        {children}
      </main>
      <WelcomeTour needsOnboarding={needsOnboarding} />
      {/* Vincula a atribuição de campanha (cookie first-party) ao cadastro —
          uma única vez por navegador, best-effort. */}
      <AttributionBinder />
      <Suspense fallback={null}>
        <SignupConversionPing />
      </Suspense>
      {/* Nodi (assistente) — ativação gradual via NODI_ENABLED, lido no servidor */}
      {isNodiEnabled() && <NodiRoot />}
    </div>
  )
}
