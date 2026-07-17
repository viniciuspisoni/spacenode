import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/app/Sidebar'
import WelcomeTour from '@/components/app/WelcomeTour'
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
  const [balance, onboardingRow] = await Promise.all([
    getPayerBalance(createAdminClient(), user.id),
    supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', user.id)
      .maybeSingle(),
  ])

  // Sem linha de perfil não há onde persistir a conclusão — não abre o tour
  // (senão ele voltaria a cada visita).
  const needsOnboarding =
    !!onboardingRow.data && onboardingRow.data.onboarding_completed_at === null

  const planId      = (balance.planId as PlanId) ?? 'free'
  const plan        = getPlanById(planId)
  const planTotal   = plan?.nodes ?? 0
  const planBalance = balance.planBalance
  const lumenBalance = balance.lumenBalance

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)' }}>
      <Sidebar
        userName={userName}
        userAvatar={userAvatar}
        planBalance={planBalance}
        planTotal={planTotal}
        lumenBalance={lumenBalance}
        planId={planId}
      />
      <main style={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', background: 'var(--color-bg)' }}>
        {children}
      </main>
      <WelcomeTour needsOnboarding={needsOnboarding} />
    </div>
  )
}
