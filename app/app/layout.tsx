import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/app/Sidebar'
import { getPlanById, type PlanId } from '@/lib/plans'

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

  // Saldo + plano (usa view + profiles)
  const [balRes, profRes] = await Promise.all([
    supabase
      .from('user_node_balance')
      .select('plan_balance, lumen_balance')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single(),
  ])

  const planId      = (profRes.data?.plan as PlanId | undefined) ?? 'free'
  const plan        = getPlanById(planId)
  const planTotal   = plan?.nodes ?? 0
  const planBalance = balRes.data?.plan_balance ?? 0
  const lumenBalance = balRes.data?.lumen_balance ?? 0

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        userName={userName}
        userAvatar={userAvatar}
        planBalance={planBalance}
        planTotal={planTotal}
        lumenBalance={lumenBalance}
        planId={planId}
      />
      <main style={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex' }}>
        {children}
      </main>
    </div>
  )
}
